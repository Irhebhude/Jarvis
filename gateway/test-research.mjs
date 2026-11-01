import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { fetchResearchSource } from './research.mjs'

await assert.rejects(() => fetchResearchSource('http://example.com'), /Only HTTPS/)
await assert.rejects(() => fetchResearchSource('https://127.0.0.1/'), /public DNS hostnames/)
await assert.rejects(() => fetchResearchSource('https://localhost/'), /public DNS hostnames/)
await assert.rejects(() => fetchResearchSource('https://user:pass@example.com/'), /without embedded credentials/)

const dataDir = await mkdtemp(join(tmpdir(), 'jarvis-research-test-'))
const port = 21400 + Math.floor(Math.random() * 400)
const gateway = spawn(process.execPath, [resolve('gateway/server.mjs')], { cwd: process.cwd(), env: { ...process.env, JARVIS_GATEWAY_HOST: '127.0.0.1', JARVIS_GATEWAY_PORT: String(port), JARVIS_DATA_DIR: dataDir }, stdio: 'ignore' })
const base = `http://127.0.0.1:${port}`
try {
  let ready = false
  for (let i = 0; i < 60; i++) { try { if ((await fetch(base + '/health')).ok) { ready = true; break } } catch {} await new Promise(r => setTimeout(r, 100)) }
  assert.equal(ready, true)
  let response = await fetch(base + '/v1/research', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: 'test' }) })
  assert.equal(response.status, 400, 'research requires 1–5 URLs')
  response = await fetch(base + '/v1/research', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: 'test', urls: ['http://example.com'] }) })
  assert.equal(response.status, 422, 'unsafe/non-HTTPS source is rejected and no report is created')
  const body = await response.json()
  assert.equal(body.error, 'No source could be retrieved. No report was created.')
  response = await fetch(base + '/v1/research')
  assert.equal(response.status, 200)
  assert.equal((await response.json()).count, 0)
  console.log('Research tests passed: HTTPS-only validation, private-host blocking, credential rejection, API validation and fail-closed source retrieval.')
} finally {
  gateway.kill('SIGTERM')
  await new Promise(resolve => { gateway.once('exit', resolve); setTimeout(resolve, 1000).unref() })
  await rm(dataDir, { recursive: true, force: true })
}
