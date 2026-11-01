import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'

const dataDir = await mkdtemp(join(tmpdir(), 'jarvis-orbit-'))
const port = 24000 + Math.floor(Math.random() * 200)
const gateway = spawn(process.execPath, [resolve('gateway/server.mjs')], { cwd: process.cwd(), env: { ...process.env, JARVIS_GATEWAY_HOST: '127.0.0.1', JARVIS_GATEWAY_PORT: String(port), JARVIS_DATA_DIR: dataDir }, stdio: 'ignore' })
const base = `http://127.0.0.1:${port}`
const post = body => fetch(base + '/v1/orbit/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
try {
  let ready = false
  for (let i = 0; i < 60; i++) { try { if ((await fetch(base + '/health')).ok) { ready = true; break } } catch {} await new Promise(r => setTimeout(r, 100)) }
  assert.equal(ready, true)
  let response = await post({})
  assert.equal(response.status, 400, 'missing bbox rejected')
  response = await post({ bbox: [0, 0, 1, 1], datetime: 'not-a-date' })
  assert.equal(response.status, 400, 'invalid datetime rejected')
  response = await post({ bbox: [-180, -90, 180, 90], datetime: '2026-01-01T00:00:00Z/2026-02-01T00:00:00Z' })
  assert.equal(response.status, 400, 'global bbox rejected as too large')
  response = await post({ bbox: [0, 0, 1, 1], datetime: '2026-01-01T00:00:00Z/2026-02-01T00:00:00Z', collection: 'unknown-collection' })
  assert.equal(response.status, 400, 'unknown collection rejected')
  response = await post({ bbox: [0, 0, 1, 1], datetime: '2026-02-01T00:00:00Z/2026-01-01T00:00:00Z' })
  assert.equal(response.status, 400, 'reversed date interval rejected')
  console.log('ORBIT catalogue tests passed: bbox validation, bounded area, UTC interval validation and collection allowlist. Live Copernicus network availability is not tested here.')
} finally {
  gateway.kill('SIGTERM')
  await new Promise(resolve => { gateway.once('exit', resolve); setTimeout(resolve, 1000).unref() })
  await rm(dataDir, { recursive: true, force: true })
}
