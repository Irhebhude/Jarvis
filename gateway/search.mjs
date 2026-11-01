import { fetchResearchSource } from './research.mjs'

const SEARCH_ENDPOINT = 'https://html.duckduckgo.com/html/'

export function parseSearchResults(page, limit = 8) {
  const results = []
  const seen = new Set()
  for (const link of page.links ?? []) {
    let target
    try {
      const parsed = new URL(link.url)
      if (parsed.hostname === 'duckduckgo.com' || parsed.hostname.endsWith('.duckduckgo.com')) {
        const destination = parsed.searchParams.get('uddg')
        if (!destination) continue
        target = new URL(destination)
      } else target = parsed
    } catch { continue }
    if (target.protocol !== 'https:' || target.username || target.password || target.hostname.endsWith('duckduckgo.com')) continue
    target.hash = ''
    const url = target.href
    const title = String(link.label ?? '').replace(/\s+/g, ' ').trim().slice(0, 180)
    if (!title || seen.has(url)) continue
    seen.add(url)
    results.push({ title, url })
    if (results.length >= limit) break
  }
  return results
}

export async function searchWeb(query, fetchPage = fetchResearchSource) {
  if (typeof query !== 'string' || !query.trim() || query.trim().length > 300) throw new Error('Search query must contain 1 to 300 characters.')
  const url = new URL(SEARCH_ENDPOINT)
  url.searchParams.set('q', query.trim())
  url.searchParams.set('kl', 'wt-wt')
  const page = await fetchPage(url.href)
  const results = parseSearchResults(page)
  if (!results.length) throw new Error('The search provider returned no readable results. Try another query or use supplied source URLs.')
  return { query: query.trim(), provider: 'DuckDuckGo HTML', results, retrievedAt: new Date().toISOString(), note: 'Search results are a starting point, not verified facts. Open sources and compare evidence before relying on them.' }
}
