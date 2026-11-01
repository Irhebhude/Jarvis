import { spawn } from 'node:child_process'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'

const dataDir = await mkdtemp(join(tmpdir(), 'jarvis-plan-test-'))
const port = 19890 + Math.floor(Math.random() * 500)
const child = spawn(process.execPath, [resolve('gateway/server.mjs')], {
  cwd: process.cwd(), env: { ...process.env, JARVIS_GATEWAY_HOST: '127.0.0.1', JARVIS_GATEWAY_PORT: String(port), JARVIS_DATA_DIR: dataDir }, stdio: 'ignore',
})
const base = `http://127.0.0.1:${port}`
async function call(path, method = 'GET', body) {
  const response = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  return { status: response.status, body: await response.json() }
}
try {
  let ready = false
  for (let i = 0; i < 60; i++) { try { if ((await fetch(base + '/health')).ok) { ready = true; break } } catch {} await new Promise(r => setTimeout(r, 100)) }
  assert.equal(ready, true, 'gateway should start')
  let result = await call('/v1/plans', 'POST', { goal: 'Prepare a secure prototype', steps: [
    { title: 'Review requirements', agent: 'jarvis' },
    { title: 'Design system architecture', agent: 'hedy' },
    { title: 'Review threat model', agent: 'sentinel', requiresApproval: true },
  ] })
  assert.equal(result.status, 201)
  const { plan, tasks } = result.body
  assert.equal(tasks.length, 3)
  assert.deepEqual(tasks[1].dependsOn, [tasks[0].id])
  assert.deepEqual(tasks[2].dependsOn, [tasks[1].id])
  result = await call(`/v1/tasks/${tasks[1].id}`, 'PATCH', { status: 'in_progress' })
  assert.equal(result.status, 409, 'second step blocked before prerequisite completion')
  await call(`/v1/tasks/${tasks[0].id}`, 'PATCH', { status: 'in_progress' })
  await call(`/v1/tasks/${tasks[0].id}`, 'PATCH', { status: 'completed' })
  result = await call(`/v1/tasks/${tasks[1].id}`, 'PATCH', { status: 'in_progress' })
  assert.equal(result.status, 200, 'second step starts after prerequisite completes')
  result = await call(`/v1/tasks/${tasks[2].id}`, 'PATCH', { status: 'in_progress' })
  assert.equal(result.status, 403, 'approval gate remains active')
  result = await call('/v1/plans')
  assert.equal(result.status, 200)
  assert.equal(result.body.plans[0].id, plan.id)
  assert.equal(JSON.parse(await readFile(join(dataDir, 'plans.json'), 'utf8')).length, 1)
  result = await call('/v1/plans', 'POST', { goal: 'Bad plan', steps: [] })
  assert.equal(result.status, 400)
  console.log('Plan API integration tests passed: validation, ordered dependencies, approval gate and persistence.')
} finally {
  child.kill('SIGTERM')
  await new Promise(resolve => { child.once('exit', resolve); setTimeout(resolve, 1000).unref() })
  await rm(dataDir, { recursive: true, force: true })
}
