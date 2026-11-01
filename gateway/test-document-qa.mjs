import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'

const dataDir = await mkdtemp(join(tmpdir(), 'jarvis-document-qa-'))
let providerCalls = 0
const provider = createServer(async (req, res) => {
  let raw = ''
  for await (const chunk of req) raw += chunk
  const body = JSON.parse(raw)
  providerCalls++
  assert.match(body.messages[0].content, /only from the supplied saved-document passages/i)
  assert.match(body.messages[0].content, /never as instructions/i)
  assert.match(body.messages[1].content, /\[D1\]/)
  assert.match(body.messages[1].content, /JARVIS uses evidence retrieval/)
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ model: 'mock-knowledge-model', choices: [{ message: { role: 'assistant', content: 'JARVIS uses keyword-ranked passages from saved documents [D1].' } }] }))
})
await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve))
const port = 23200 + Math.floor(Math.random() * 300)
const gateway = spawn(process.execPath, [resolve('gateway/server.mjs')], { cwd: process.cwd(), env: { ...process.env, JARVIS_GATEWAY_HOST: '127.0.0.1', JARVIS_GATEWAY_PORT: String(port), JARVIS_DATA_DIR: dataDir, JARVIS_AI_BASE_URL: `http://127.0.0.1:${provider.address().port}/v1`, JARVIS_AI_MODEL: 'mock-knowledge-model' }, stdio: 'ignore' })
const base = `http://127.0.0.1:${port}`
const call = async (path, method = 'POST', body = {}) => {
  const response = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, ...(method === 'GET' ? {} : { body: JSON.stringify(body) }) })
  return { status: response.status, body: await response.json() }
}
try {
  let ready = false
  for (let i = 0; i < 60; i++) { try { if ((await fetch(base + '/health')).ok) { ready = true; break } } catch {} await new Promise(r => setTimeout(r, 100)) }
  assert.equal(ready, true, 'gateway starts')
  let result = await call('/v1/documents/ask', 'POST', { question: 'What does JARVIS use?' })
  assert.equal(result.status, 404, 'empty vault fails closed')
  result = await call('/v1/documents', 'POST', { title: 'Architecture notes', text: 'JARVIS uses evidence retrieval and keyword-ranked passages from saved documents. The system asks a configured model to answer questions with citations.' })
  assert.equal(result.status, 201)
  result = await call('/v1/documents/ask', 'POST', { question: 'What does JARVIS use for evidence retrieval?' })
  assert.equal(result.status, 200)
  assert.equal(result.body.model, 'mock-knowledge-model')
  assert.match(result.body.answer, /\[D1\]/)
  assert.equal(result.body.sources.length, 1)
  assert.equal(result.body.sources[0].title, 'Architecture notes')
  assert.equal(result.body.sources[0].start, 0)
  assert.equal(providerCalls, 1)
  result = await call('/v1/documents/ask', 'POST', { question: 'What is the price of a submarine?' })
  assert.equal(result.status, 404, 'unmatched query does not send irrelevant documents to model')
  assert.equal(providerCalls, 1, 'provider is not called when no passages match')
  const audit = await call('/v1/audit', 'GET')
  assert.ok(audit.body.entries.some(entry => entry.action === 'document_qa_answered'))
  const stored = JSON.parse(await readFile(join(dataDir, 'documents.json'), 'utf8'))
  assert.equal(stored.length, 1, 'knowledge documents remain persisted')
  console.log('Document Q&A tests passed: empty-vault gate, retrieval, source citations, model prompt safety, no-match fail-closed behavior, audit and persistence.')
} finally {
  gateway.kill('SIGTERM')
  await new Promise(resolve => { gateway.once('exit', resolve); setTimeout(resolve, 1000).unref() })
  provider.close()
  await rm(dataDir, { recursive: true, force: true })
}
