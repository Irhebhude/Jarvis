import assert from 'node:assert/strict'
import { parseSearchResults, searchWeb } from './search.mjs'

const page = { links: [
  { label: 'Example result', url: 'https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Farticle' },
  { label: 'Duplicate', url: 'https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Farticle' },
  { label: 'Unsafe scheme', url: 'https://duckduckgo.com/l/?uddg=http%3A%2F%2Fexample.net' },
  { label: 'Internal', url: 'https://duckduckgo.com/about' },
  { label: 'Second result', url: 'https://news.example.com/story' },
] }
const parsed = parseSearchResults(page)
assert.deepEqual(parsed.map(item => item.url), ['https://example.org/article', 'https://news.example.com/story'])
let requested = ''
const result = await searchWeb('AI safety research', async url => { requested = url; return page })
assert.equal(new URL(requested).hostname, 'html.duckduckgo.com')
assert.equal(new URL(requested).searchParams.get('q'), 'AI safety research')
assert.equal(result.results.length, 2)
assert.deepEqual(parseSearchResults({ links: [{ label: 'bad', url: 'javascript:alert(1)' }] }), [])
await assert.rejects(() => searchWeb(' '.repeat(1)))
console.log('Search tests passed: query validation, fixed provider endpoint, redirect unwrapping, HTTPS-only results and deduplication.')
