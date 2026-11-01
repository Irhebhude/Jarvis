import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'

const dataDir = await mkdtemp(join(tmpdir(), 'jarvis-plan-gen-test-'))
const provider = createServer(async (req, res) => {
  let body = ''
  for await (const chunk of req) body += chunk
  const request = JSON.parse(body)
  assert.equal(request.messages.at(-1).content, 'Prepare and publish a project update')
  const plan = { steps: [
    { title: 'Review project information', description: 'Check available source material.', agent: 'jarvis', priority: 'normal', requiresApproval: false },
    { title: 'Publish project update', description: 'Publish the approved update to the public page.', agent: 'hedy', priority: 'high', requiresApproval: false },
  ] }
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ model: 'mock-planner', choices: [{ message: { role: 'assistant', content: JSON.stringify(plan) } }] }))
})
await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve))
const providerPort = provider.address().port
const port = 20300 + Math.floor(Math.random() * 500)
const gateway = spawn(process.execPath, [resolve('gateway/server.mjs')], {
  cwd: process.cwd(), env: { ...process.env, JARVIS_GATEWAY_HOST: '127.0.0.1', JARVIS_GATEWAY_PORT: String(port), JARVIS_DATA_DIR: dataDir, JARVIS_AI_BASE_URL: `http://127.0.0.1:${providerPort}/v1`, JARVIS_AI_MODEL: 'mock-planner' }, stdio: 'ignore',
})
const base = `http://127.0.0.1:${port}`
async function call(path, body) {
  const response = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { status: response.status, body: await response.json() }
}
try {
  let ready = false
  for (let i = 0; i < 60; i++) { try { if ((await fetch(base + '/health')).ok) { ready = true; break } } catch {} await new Promise(r => setTimeout(r, 100)) }
  assert.equal(ready, true)
  let result = await call('/v1/plans/generate', { goal: 'Prepare and publish a project update' })
  assert.equal(result.status, 201)
  assert.equal(result.body.generatedBy, 'mock-planner')
  assert.equal(result.body.tasks.length, 2)
  assert.equal(result.body.tasks[0].status, 'planned')
  assert.equal(result.body.tasks[1].requiresApproval, true, 'server should force approval for publishing')
  assert.equal(result.body.tasks[1].status, 'awaiting_approval')
  assert.deepEqual(result.body.tasks[1].dependsOn, [result.body.tasks[0].id])
  const saved = JSON.parse(await readFile(join(dataDir, 'tasks.json'), 'utf8'))
  assert.equal(saved.length, 2)
  result = await call('/v1/plans/generate', { goal: '' })
  assert.equal(result.status, 400)
  console.log('AI plan-generator integration tests passed: provider call, JSON validation, safety approval, dependencies and persistence.')
} finally {
  gateway.kill('SIGTERM')
  await new Promise(resolve => { gateway.once('exit', resolve); setTimeout(resolve, 1000).unref() })
  provider.close()
  await rm(dataDir, { recursive: true, force: true })
}
