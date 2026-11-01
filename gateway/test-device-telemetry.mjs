import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'

const dataDir = await mkdtemp(join(tmpdir(), 'jarvis-device-'))
const port = 24600 + Math.floor(Math.random() * 200)
const token = 'test-device-token-0123456789abcdef'
const gateway = spawn(process.execPath, [resolve('gateway/server.mjs')], { cwd: process.cwd(), env: { ...process.env, JARVIS_GATEWAY_HOST: '127.0.0.1', JARVIS_GATEWAY_PORT: String(port), JARVIS_DATA_DIR: dataDir, JARVIS_GATEWAY_TOKEN: token }, stdio: 'ignore' })
const base = `http://127.0.0.1:${port}`
try {
  let ready = false
  for (let i = 0; i < 60; i++) { try { if ((await fetch(base + '/health')).ok) { ready = true; break } } catch {} await new Promise(r => setTimeout(r, 100)) }
  assert.equal(ready, true)
  let response = await fetch(base + '/v1/devices/telemetry', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ deviceId: 'phone-1', readings: { light: 20 } }) })
  assert.equal(response.status, 401, 'token is required')
  response = await fetch(base + '/v1/devices/telemetry', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ deviceId: 'phone-1', readings: { accelerometer: { x: 1, y: 2, z: 3 }, light: 20, ignored: 'secret' } }) })
  assert.equal(response.status, 202)
  const stored = JSON.parse(await readFile(join(dataDir, 'device-telemetry.json'), 'utf8'))
  assert.equal(stored[0].readings.accelerometer.z, 3)
  assert.equal('ignored' in stored[0].readings, false)
  response = await fetch(base + '/v1/devices/telemetry', { headers: { authorization: `Bearer ${token}` } })
  assert.equal((await response.json()).devices.length, 1)
  console.log('Device telemetry tests passed: bearer authentication, allowlisted readings, persistence and retrieval.')
} finally {
  gateway.kill('SIGTERM')
  await new Promise(resolve => { gateway.once('exit', resolve); setTimeout(resolve, 1000).unref() })
  await rm(dataDir, { recursive: true, force: true })
}
