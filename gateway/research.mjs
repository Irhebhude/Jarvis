import https from 'node:https'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

const MAX_BYTES = 1_000_000
const MAX_TEXT = 12_000
const MAX_REDIRECTS = 3

function isPublicAddress(address) {
  const family = isIP(address)
  if (family === 4) {
    const p = address.split('.').map(Number)
    return !(p[0] === 0 || p[0] === 10 || p[0] === 127 || p[0] >= 224
      || (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31)
      || (p[0] === 192 && p[1] === 168) || (p[0] === 100 && p[1] >= 64 && p[1] <= 127)
      || (p[0] === 192 && p[1] === 0 && p[2] === 0) || (p[0] === 198 && (p[1] === 18 || p[1] === 19)))
  }
  if (family === 6) {
    const a = address.toLowerCase()
    return a !== '::' && a !== '::1' && !a.startsWith('::ffff:') && !a.startsWith('fc') && !a.startsWith('fd')
      && !a.startsWith('fe8') && !a.startsWith('fe9') && !a.startsWith('fea') && !a.startsWith('feb')
      && !a.startsWith('ff') && !a.startsWith('::ffff:127.') && !a.startsWith('::ffff:10.')
  }
  return false
}

function cleanHtml(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|nav|footer|header|form)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/article|\/section)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Math.min(Number(n), 0x10ffff)))
    .replace(/[ \t\f\v]+/g, ' ').replace(/\n\s*/g, '\n').trim()
}

async function requestPinned(url) {
  const hostname = url.hostname.toLowerCase()
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || isIP(hostname)) {
    throw new Error('Only public DNS hostnames are allowed.')
  }
  const addresses = await lookup(hostname, { all: true, verbatim: true })
  if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) throw new Error('The hostname resolves to a non-public or blocked network address.')
  const chosen = addresses[0]
  return await new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'GET', timeout: 12_000, headers: { 'user-agent': 'JARVIS-Research/1.0 (+source retrieval)', accept: 'text/html,text/plain,application/xhtml+xml' },
      lookup: (_host, _options, callback) => callback(null, chosen.address, chosen.family),
    }, res => {
      const chunks = []
      let bytes = 0
      res.on('data', chunk => {
        bytes += chunk.length
        if (bytes > MAX_BYTES) { req.destroy(new Error('Source exceeds the 1 MB download limit.')); return }
        chunks.push(chunk)
      })
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }))
    })
    req.on('timeout', () => req.destroy(new Error('Source request timed out.')))
    req.on('error', reject)
    req.end()
  })
}

export async function fetchResearchSource(rawUrl) {
  let url
  try { url = new URL(rawUrl) } catch { throw new Error('Each source must be a valid URL.') }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Only HTTPS source URLs without embedded credentials are accepted.')
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    const response = await requestPinned(url)
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (!response.headers.location || redirects === MAX_REDIRECTS) throw new Error('Source redirect limit reached or redirect target missing.')
      const next = new URL(response.headers.location, url)
      if (next.protocol !== 'https:') throw new Error('Redirects to non-HTTPS destinations are blocked.')
      url = next
      continue
    }
    if (response.status < 200 || response.status >= 300) throw new Error(`Source returned HTTP ${response.status}.`)
    const type = String(response.headers['content-type'] ?? '').toLowerCase()
    if (!type.includes('text/html') && !type.includes('text/plain') && !type.includes('application/xhtml+xml')) throw new Error('Source must return HTML or plain text; binary and document downloads are not supported.')
    const html = type.includes('html') || type.includes('xhtml')
    const text = html ? cleanHtml(response.body) : response.body.replace(/\s+/g, ' ').trim()
    if (!text) throw new Error('No readable text was found at this source.')
    const title = (response.body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').replace(/<[^>]+>/g, '').trim().slice(0, 200)
    const links = []
    if (html) {
      const pattern = /<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi
      let match
      while ((match = pattern.exec(response.body)) && links.length < 30) {
        try {
          const target = new URL(match[2], url)
          if (target.protocol !== 'https:' || target.username || target.password || target.href.length > 2048) continue
          const label = cleanHtml(match[3]).slice(0, 160)
          if (!links.some(link => link.url === target.href)) links.push({ label: label || target.hostname, url: target.href })
        } catch {}
      }
    }
    return { url: url.href, title: title || url.hostname, text: text.slice(0, MAX_TEXT), truncated: text.length > MAX_TEXT, links }
  }
  throw new Error('Source redirect limit reached.')
}
