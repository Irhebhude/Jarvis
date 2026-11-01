import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'

const dataDir = await mkdtemp(join(tmpdir(), 'jarvis-vision-'))
let providerCalls = 0
const provider = createServer(async (req, res) => {
  let raw = ''
  for await (const chunk of req) raw += chunk
  const body = JSON.parse(raw)
  providerCalls++
  assert.match(body.messages[0].content, /visible content/i)
  const content = body.messages[1].content
  assert.ok(Array.isArray(content), 'vision request uses multimodal content')
  assert.match(content[1].image_url.url, /^data:image\/png;base64,/)
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ model: 'mock-vision-model', choices: [{ message: { role: 'assistant', content: 'Visible text: JARVIS TEST. The image shows a simple test card.' } }] }))
})
await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve))
const port = 23500 + Math.floor(Math.random() * 300)
const gateway = spawn(process.execPath, [resolve('gateway/server.mjs')], { cwd: process.cwd(), env: { ...process.env, JARVIS_GATEWAY_HOST: '127.0.0.1', JARVIS_GATEWAY_PORT: String(port), JARVIS_DATA_DIR: dataDir, JARVIS_AI_BASE_URL: `http://127.0.0.1:${provider.address().port}/v1`, JARVIS_AI_MODEL: 'mock-vision-model' }, stdio: 'ignore' })
const base = `http://127.0.0.1:${port}`
const call = async (path, body) => { const response = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: response.status, body: await response.json() } }
try {
  let ready = false
  for (let i = 0; i < 60; i++) { try { if ((await fetch(base + '/health')).ok) { ready = true; break } } catch {} await new Promise(r => setTimeout(r, 100)) }
  assert.equal(ready, true, 'gateway starts')
  let result = await call('/v1/vision/analyze', { filename: 'test.png', image: 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=' })
  assert.equal(result.status, 400, 'unsupported image type rejected')
  assert.equal(providerCalls, 0)
  result = await call('/v1/vision/analyze', { filename: 'test.png', image: `data:image/png;base64,${Buffer.from('fake-png-bytes').toString('base64')}` })
  assert.equal(result.status, 201, 'vision result saved')
  assert.equal(result.body.model, 'mock-vision-model')
  assert.match(result.body.description, /JARVIS TEST/)
  assert.equal(providerCalls, 1)
  const stored = JSON.parse(await readFile(join(dataDir, 'documents.json'), 'utf8'))
  assert.equal(stored.length, 1)
  assert.equal(stored[0].mimeType, 'image/png')
  assert.match(stored[0].text, /Visible text: JARVIS TEST/)
  const audit = (await readFile(join(dataDir, 'audit.jsonl'), 'utf8'))
  assert.match(audit, /vision_analysis_saved/)
  console.log('Vision tests passed: MIME validation, multimodal provider payload, model response, knowledge-vault persistence and audit. Image bytes are not persisted.')
} finally {
  gateway.kill('SIGTERM')
  await new Promise(resolve => { gateway.once('exit', resolve); setTimeout(resolve, 1000).unref() })
  provider.close()
  await rm(dataDir, { recursive: true, force: true })
}
