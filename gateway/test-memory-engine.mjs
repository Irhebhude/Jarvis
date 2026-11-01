import { spawn } from 'node:child_process'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { rankMemories, findPossibleConflicts } from './memory-engine.mjs'

const ranked = rankMemories('mobile phone', [
  { id: 'a', text: 'The Android phone is my primary mobile device.', createdAt: new Date().toISOString() },
  { id: 'b', text: 'I enjoy classical music and reading history books.', createdAt: new Date().toISOString() },
])
assert.equal(ranked[0].id, 'a', 'synonym expansion ranks related terms')
assert.equal(rankMemories('   ', []).length, 0, 'empty query returns no results')
const conflicts = findPossibleConflicts([
  { id: 'one', text: 'I currently live in Lagos Nigeria every day.' },
  { id: 'two', text: 'I do not currently live in Lagos Nigeria every day.' },
])
assert.equal(conflicts.length, 1, 'possible polarity conflict is flagged')

const dataDir = await mkdtemp(join(tmpdir(), 'jarvis-memory-test-'))
const port = 23100 + Math.floor(Math.random() * 300)
const gateway = spawn(process.execPath, [resolve('gateway/server.mjs')], { cwd: process.cwd(), env: { ...process.env, JARVIS_GATEWAY_HOST: '127.0.0.1', JARVIS_GATEWAY_PORT: String(port), JARVIS_DATA_DIR: dataDir }, stdio: 'ignore' })
const base = `http://127.0.0.1:${port}`
const call = async (path, method = 'GET', body) => fetch(base + path, { method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
try {
  let ready = false
  for (let i = 0; i < 60; i++) { try { if ((await fetch(base + '/health')).ok) { ready = true; break } } catch {} await new Promise(r => setTimeout(r, 100)) }
  assert.equal(ready, true, 'gateway starts')
  let response = await call('/v1/memory', 'POST', { text: 'I prefer using an Android phone for development.', category: 'preferences', tags: ['android', 'development'] })
  assert.equal(response.status, 201, 'memory can be created')
  const item = (await response.json()).item
  response = await call('/v1/memory/search?q=mobile%20device')
  assert.equal(response.status, 200)
  assert.equal((await response.json()).results[0].id, item.id, 'search finds related memory')
  response = await call('/v1/memory/conflicts')
  assert.equal(response.status, 200, 'conflict review endpoint works')
  response = await call('/v1/memory', 'PUT', { items: [{ id: 'chat_0_user', text: JSON.stringify({ role: 'user', content: 'Hello' }) }] })
  assert.equal(response.status, 200, 'conversation sync remains compatible')
  const all = await (await call('/v1/memory')).json()
  assert.equal(all.items.some(entry => entry.id === item.id), true, 'conversation sync preserves durable memory')
  assert.equal(all.items.some(entry => entry.id === 'chat_0_user'), true, 'conversation sync saves chat turn')
  response = await call(`/v1/memory/${item.id}`, 'PATCH', { text: 'I prefer an Android mobile phone for software engineering.' })
  assert.equal(response.status, 200, 'memory can be edited')
  assert.match((await response.json()).item.text, /software engineering/)
  const stored = JSON.parse(await readFile(join(dataDir, 'memory.json'), 'utf8'))
  assert.equal(stored.some(entry => entry.id === item.id), true, 'edited memory persists')
  response = await call(`/v1/memory/${item.id}`, 'DELETE')
  assert.equal(response.status, 200, 'individual memory can be deleted')
  response = await call(`/v1/memory/${item.id}`)
  assert.equal(response.status, 404, 'deleted memory is not accessible')
  console.log('Memory intelligence tests passed: relevance ranking, synonym expansion, conflict review, CRUD, persistence and conversation-sync preservation.')
} finally {
  gateway.kill('SIGTERM')
  await new Promise(resolve => { gateway.once('exit', resolve); setTimeout(resolve, 1000).unref() })
  await rm(dataDir, { recursive: true, force: true })
}
