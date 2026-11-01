const STOP = new Set(['a','an','and','are','as','at','be','been','but','by','for','from','had','has','have','how','i','in','into','is','it','its','me','my','of','on','or','our','please','the','their','them','there','this','to','was','we','what','when','where','which','who','why','with','you','your'])
const RELATED = new Map([
  ['job', ['work','career','employment']], ['work', ['job','career','employment']],
  ['study', ['school','university','course','learning']], ['school', ['study','university','learning']],
  ['build', ['create','develop','engineering']], ['create', ['build','develop']],
  ['phone', ['mobile','android','device']], ['mobile', ['phone','android','device']],
  ['goal', ['plan','objective','target']], ['plan', ['goal','objective']],
  ['memory', ['remember','recall','saved']], ['remember', ['memory','recall']],
])

export function tokenize(value) {
  return String(value ?? '').toLowerCase().match(/[a-z0-9][a-z0-9'-]{1,}/g)?.filter(token => !STOP.has(token)) ?? []
}

function expandedTerms(tokens) {
  const terms = new Set(tokens)
  for (const token of tokens) for (const related of RELATED.get(token) ?? []) terms.add(related)
  return terms
}

export function rankMemories(query, memories, limit = 10) {
  const queryTokens = tokenize(query)
  if (!queryTokens.length) return []
  const queryTerms = expandedTerms(queryTokens)
  const docs = memories.map(item => ({ item, tokens: tokenize(item.text) }))
  const documentFrequency = new Map()
  for (const term of queryTerms) documentFrequency.set(term, docs.filter(doc => doc.tokens.includes(term)).length)
  const now = Date.now()
  const ranked = docs.map(({ item, tokens }) => {
    const counts = new Map()
    for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1)
    const lengthNorm = Math.sqrt(Math.max(tokens.length, 1))
    let score = 0
    for (const term of queryTerms) {
      const frequency = counts.get(term) ?? 0
      if (!frequency) continue
      const idf = Math.log(1 + (docs.length - (documentFrequency.get(term) ?? 0) + 0.5) / ((documentFrequency.get(term) ?? 0) + 0.5))
      const weight = queryTokens.includes(term) ? 1 : 0.42
      score += weight * idf * (frequency * 2.2) / (frequency + 1.2 * (0.25 + 0.75 * tokens.length / 120))
    }
    const phrase = String(item.text).toLowerCase().includes(String(query).trim().toLowerCase())
    if (phrase) score += 2
    const date = Date.parse(item.updatedAt ?? item.createdAt ?? '')
    const ageDays = Number.isFinite(date) ? Math.max(0, (now - date) / 86_400_000) : 3650
    const recency = 1 + 0.12 * Math.exp(-ageDays / 90)
    score = score * recency / Math.max(1, lengthNorm / 8)
    return { ...item, score: Number(score.toFixed(4)), matchedTerms: [...queryTerms].filter(term => counts.has(term)), relevance: phrase ? 'phrase' : 'term' }
  }).filter(item => item.score > 0)
  return ranked.sort((a, b) => b.score - a.score).slice(0, Math.max(1, Math.min(50, limit)))
}

// This is a review aid, not a truth detector: lexical overlap plus opposite polarity
// can flag pairs for a human to inspect, but cannot establish a real contradiction.
export function findPossibleConflicts(memories) {
  const results = []
  for (let i = 0; i < memories.length; i++) {
    const left = memories[i]
    const leftTokens = new Set(tokenize(left.text))
    for (let j = i + 1; j < memories.length; j++) {
      const right = memories[j]
      const rightTokens = new Set(tokenize(right.text))
      const shared = [...leftTokens].filter(token => rightTokens.has(token))
      if (shared.length < 3) continue
      const leftNegative = /\b(no|not|never|isn't|aren't|don't|doesn't|didn't|cannot|can't)\b/i.test(left.text)
      const rightNegative = /\b(no|not|never|isn't|aren't|don't|doesn't|didn't|cannot|can't)\b/i.test(right.text)
      if (leftNegative !== rightNegative) results.push({ memoryIds: [left.id, right.id], sharedTerms: shared.slice(0, 8), reason: 'Similar wording with different negative/positive polarity; review manually.' })
    }
  }
  return results.slice(0, 50)
}
