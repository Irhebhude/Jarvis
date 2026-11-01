import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'

const dataDir = await mkdtemp(join(tmpdir(), 'jarvis-provider-'))
let calls = 0
const provider = createServer(async (req, res) => {
  let raw = ''
  for await (const chunk of req) raw += chunk
  const body = JSON.parse(raw)
  calls++
  assert.equal(req.url, '/v1/chat/completions')
  assert.equal(body.model, 'mock-provider-model')
  assert.equal(body.messages[0].content, 'Reply with exactly: JARVIS_PROVIDER_OK')
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ model: body.model, choices: [{ message: { role: 'assistant', content: 'JARVIS_PROVIDER_OK' } }] }))
})
await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve))
const port = 23800 + Math.floor(Math.random() * 200)
const gateway = spawn(process.execPath, [resolve('gateway/server.mjs')], { cwd: process.cwd(), env: { ...process.env, JARVIS_GATEWAY_HOST: '127.0.0.1', JARVIS_GATEWAY_PORT: String(port), JARVIS_DATA_DIR: dataDir, JARVIS_AI_BASE_URL: `http://127.0.0.1:${provider.address().port}/v1`, JARVIS_AI_MODEL: 'mock-provider-model', JARVIS_AI_API_KEY: 'mock-secret-not-returned' }, stdio: 'ignore' })
const base = `http://127.0.0.1:${port}`
try {
  let ready = false
  for (let i = 0; i < 60; i++) { try { if ((await fetch(base + '/health')).ok) { ready = true; break } } catch {} await new Promise(r => setTimeout(r, 100)) }
  assert.equal(ready, true, 'gateway starts')
  let response = await fetch(base + '/v1/provider/status')
  assert.equal(response.status, 200)
  let status = await response.json()
  assert.equal(status.configured, true)
  assert.equal(status.apiKeyConfigured, true)
  assert.equal(JSON.stringify(status).includes('mock-secret'), false, 'API key is never disclosed')
  response = await fetch(base + '/v1/provider/test', { method: 'POST' })
  const result = await response.json()
  assert.equal(response.status, 200)
  assert.equal(result.ok, true)
  assert.equal(result.responsePreview, 'JARVIS_PROVIDER_OK')
  assert.equal(calls, 1)
  console.log('Provider integration tests passed: configuration status, live OpenAI-compatible request, response validation and secret redaction.')
} finally {
  gateway.kill('SIGTERM')
  await new Promise(resolve => { gateway.once('exit', resolve); setTimeout(resolve, 1000).unref() })
  provider.close()
  await rm(dataDir, { recursive: true, force: true })
}
