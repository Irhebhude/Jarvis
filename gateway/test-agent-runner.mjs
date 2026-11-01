import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'

const dataDir = await mkdtemp(join(tmpdir(), 'jarvis-agent-run-test-'))
const provider = createServer(async (req, res) => {
  let raw = ''
  for await (const chunk of req) raw += chunk
  const body = JSON.parse(raw)
  const system = body.messages[0].content
  assert.match(system, /You are (JARVIS|HEDY)/)
  assert.match(system, /no external action tools/i)
  const report = `## Summary\n${body.messages[1].content.includes('Review the source') ? 'Reviewed source context.' : 'Prepared engineering analysis.'}\n\n## Work performed\nGenerated this report only.`
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ model: 'mock-agent', choices: [{ message: { role: 'assistant', content: report } }] }))
})
await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve))
const port = 20800 + Math.floor(Math.random() * 500)
const gateway = spawn(process.execPath, [resolve('gateway/server.mjs')], { cwd: process.cwd(), env: { ...process.env, JARVIS_GATEWAY_HOST: '127.0.0.1', JARVIS_GATEWAY_PORT: String(port), JARVIS_DATA_DIR: dataDir, JARVIS_AI_BASE_URL: `http://127.0.0.1:${provider.address().port}/v1`, JARVIS_AI_MODEL: 'mock-agent' }, stdio: 'ignore' })
const base = `http://127.0.0.1:${port}`
async function call(path, method = 'POST', body = {}) {
  const response = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, ...(method === 'GET' ? {} : { body: JSON.stringify(body) }) })
  return { status: response.status, body: await response.json() }
}
try {
  let ready = false
  for (let i = 0; i < 60; i++) { try { if ((await fetch(base + '/health')).ok) { ready = true; break } } catch {} await new Promise(r => setTimeout(r, 100)) }
  assert.equal(ready, true)
  let result = await call('/v1/plans', 'POST', { goal: 'Test agent sequencing', steps: [
    { title: 'Review the source', description: 'Review supplied source context.', agent: 'jarvis' },
    { title: 'Prepare engineering design', description: 'Prepare design recommendations.', agent: 'hedy', requiresApproval: true },
  ] })
  assert.equal(result.status, 201)
  const [first, second] = result.body.tasks
  result = await call(`/v1/tasks/${second.id}/run`)
  assert.equal(result.status, 409, 'approval-required task cannot run before approval')
  result = await call(`/v1/tasks/${first.id}/run`)
  assert.equal(result.status, 200)
  assert.equal(result.body.task.status, 'in_progress', 'report must not be treated as real-world completion')
  assert.equal(result.body.task.result.model, 'mock-agent')
  assert.match(result.body.task.result.report, /Generated this report only/)
  result = await call(`/v1/tasks/${second.id}`, 'PATCH', { approved: true })
  assert.equal(result.status, 200)
  result = await call(`/v1/tasks/${second.id}/run`)
  assert.equal(result.status, 409, 'dependent task remains blocked until prerequisite is completed')
  result = await call(`/v1/tasks/${first.id}`, 'PATCH', { status: 'completed' })
  assert.equal(result.status, 200)
  result = await call(`/v1/tasks/${second.id}/run`)
  assert.equal(result.status, 200)
  const stored = JSON.parse(await readFile(join(dataDir, 'tasks.json'), 'utf8'))
  assert.equal(stored.find(task => task.id === first.id).result.type, 'ai_report_only')
  assert.ok(stored.find(task => task.id === second.id).result)
  console.log('Agent-runner integration tests passed: role routing, approval gate, prerequisite gate, report persistence and no false completion.')
} finally {
  gateway.kill('SIGTERM')
  await new Promise(resolve => { gateway.once('exit', resolve); setTimeout(resolve, 1000).unref() })
  provider.close()
  await rm(dataDir, { recursive: true, force: true })
}
