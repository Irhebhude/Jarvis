import { access, readFile, readdir } from 'node:fs/promises'
import { constants } from 'node:fs'

const problems = []
const token = process.env.JARVIS_GATEWAY_TOKEN ?? ''
const baseUrl = process.env.JARVIS_AI_BASE_URL ?? ''
const model = process.env.JARVIS_AI_MODEL ?? ''
if (token.length < 32 || /REPLACE|CHANGE_ME|YOUR_/i.test(token)) problems.push('JARVIS_GATEWAY_TOKEN must be a real random secret of at least 32 characters.')
if (!baseUrl) problems.push('JARVIS_AI_BASE_URL is missing.')
else {
  try {
    const parsed = new URL(baseUrl)
    if (!['http:', 'https:'].includes(parsed.protocol)) problems.push('JARVIS_AI_BASE_URL must use HTTP or HTTPS.')
  } catch { problems.push('JARVIS_AI_BASE_URL is not a valid URL.') }
}
if (!model.trim()) problems.push('JARVIS_AI_MODEL is missing.')
try { await access('deploy/nginx/.htpasswd', constants.R_OK) }
catch { problems.push('deploy/nginx/.htpasswd is missing. Create an Nginx Basic Auth file before deployment.') }
try { await access('dist/index.html', constants.R_OK) }
catch { problems.push('Frontend build is missing. Run npm ci && npm run build first.') }
try {
  const files = await readdir('dist/assets')
  for (const file of files.filter(name => name.endsWith('.js'))) {
    const content = await readFile(`dist/assets/${file}`, 'utf8')
    if (token && content.includes(token)) problems.push(`Gateway secret appears in browser asset ${file}; deployment blocked.`)
    if (process.env.JARVIS_AI_API_KEY && content.includes(process.env.JARVIS_AI_API_KEY)) problems.push(`AI provider key appears in browser asset ${file}; deployment blocked.`)
  }
} catch { /* Missing dist is already reported above. */ }
if (problems.length) {
  console.error('JARVIS deployment preflight FAILED:')
  for (const problem of problems) console.error(`- ${problem}`)
  process.exit(1)
}
console.log('JARVIS deployment preflight passed: required server secrets/model settings are present, frontend build exists, and supplied server credentials were not found in built JS assets.')
console.log('This check does not verify live provider connectivity, HTTPS, access proxy configuration, container startup or backup restoration.')
