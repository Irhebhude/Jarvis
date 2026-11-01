const base = (process.env.JARVIS_AI_BASE_URL ?? '').replace(/\/+$/, '')
const model = process.env.JARVIS_AI_MODEL ?? ''
const key = process.env.JARVIS_AI_API_KEY ?? ''
if (!base || !model) throw new Error('Set JARVIS_AI_BASE_URL and JARVIS_AI_MODEL before running this live test.')
const response = await fetch(`${base}/chat/completions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
  body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply with exactly: JARVIS_LIVE_OK' }], max_tokens: 24, temperature: 0, stream: false }),
  signal: AbortSignal.timeout(30_000),
})
if (!response.ok) throw new Error(`AI provider returned HTTP ${response.status}; response body intentionally not printed.`)
const payload = await response.json()
const answer = payload?.choices?.[0]?.message?.content
if (typeof answer !== 'string' || !answer.trim()) throw new Error('AI provider returned no assistant text.')
console.log(`Live AI provider connection passed. Model: ${payload.model ?? model}. Non-empty response received; credentials were not printed.`)
