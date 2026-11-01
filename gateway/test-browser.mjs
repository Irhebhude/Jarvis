import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'

const dataDir = await mkdtemp(join(tmpdir(), 'jarvis-browser-test-'))
const port = 21800 + Math.floor(Math.random() * 300)
const gateway = spawn(process.execPath, [resolve('gateway/server.mjs')], { cwd: process.cwd(), env: { ...process.env, JARVIS_GATEWAY_HOST: '127.0.0.1', JARVIS_GATEWAY_PORT: String(port), JARVIS_DATA_DIR: dataDir }, stdio: 'ignore' })
const base = `http://127.0.0.1:${port}`
try {
  let ready = false
  for (let i = 0; i < 60; i++) { try { if ((await fetch(base + '/health')).ok) { ready = true; break } } catch {} await new Promise(r => setTimeout(r, 100)) }
  assert.equal(ready, true)
  let response = await fetch(base + '/v1/browser/open', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) })
  assert.equal(response.status, 400, 'open requires a URL')
  response = await fetch(base + '/v1/browser/open', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'http://example.com' }) })
  assert.equal(response.status, 422, 'non-HTTPS navigation is rejected')
  response = await fetch(base + '/v1/browser/follow', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'https://127.0.0.1/' }) })
  assert.equal(response.status, 422, 'private/IP navigation is rejected')
  response = await fetch(base + '/v1/audit')
  const audit = await response.json()
  assert.ok(audit.entries.some(entry => entry.action === 'browser_navigation_blocked_or_failed'))
  console.log('Browser tests passed: request validation, HTTPS enforcement, private/IP blocking and audit logging.')
} finally {
  gateway.kill('SIGTERM')
  await new Promise(resolve => { gateway.once('exit', resolve); setTimeout(resolve, 1000).unref() })
  await rm(dataDir, { recursive: true, force: true })
}
