import { spawn } from 'node:child_process'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'

const dataDir = await mkdtemp(join(tmpdir(), 'jarvis-documents-test-'))
const port = 22800 + Math.floor(Math.random() * 300)
const gateway = spawn(process.execPath, [resolve('gateway/server.mjs')], { cwd: process.cwd(), env: { ...process.env, JARVIS_GATEWAY_HOST: '127.0.0.1', JARVIS_GATEWAY_PORT: String(port), JARVIS_DATA_DIR: dataDir }, stdio: 'ignore' })
const base = `http://127.0.0.1:${port}`
const call = async (path, method = 'GET', body) => fetch(base + path, { method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
try {
  let ready = false
  for (let i = 0; i < 60; i++) { try { if ((await fetch(base + '/health')).ok) { ready = true; break } } catch {} await new Promise(r => setTimeout(r, 100)) }
  assert.equal(ready, true, 'gateway starts')
  let response = await call('/v1/documents', 'POST', { title: '   ', text: 'content' })
  assert.equal(response.status, 400, 'blank title rejected')
  response = await call('/v1/documents', 'POST', { title: 'Engineering notes', filename: 'notes.md', text: '# JARVIS\nHEDY designs robotics and wearable engineering systems. SENTINEL handles defensive security.' })
  assert.equal(response.status, 201, 'document saved')
  const saved = (await response.json()).document
  response = await call('/v1/documents/search', 'POST', { query: 'robotics wearable' })
  assert.equal(response.status, 200)
  const found = await response.json()
  assert.equal(found.results.length, 1, 'keyword search finds document')
  assert.equal(found.results[0].id, saved.id)
  response = await call(`/v1/documents/${saved.id}`)
  assert.equal(response.status, 200, 'document detail available')
  assert.match((await response.json()).document.text, /HEDY designs robotics/)
  const stored = JSON.parse(await readFile(join(dataDir, 'documents.json'), 'utf8'))
  assert.equal(stored.length, 1, 'document persisted to disk')
  response = await call(`/v1/documents/${saved.id}`, 'DELETE')
  assert.equal(response.status, 200, 'document deletion succeeds')
  response = await call(`/v1/documents/${saved.id}`)
  assert.equal(response.status, 404, 'deleted document no longer available')
  console.log('Document knowledge tests passed: validation, save, keyword search, detail retrieval, persistence and deletion.')
} finally {
  gateway.kill('SIGTERM')
  await new Promise(resolve => { gateway.once('exit', resolve); setTimeout(resolve, 1000).unref() })
  await rm(dataDir, { recursive: true, force: true })
}
