const endpoint = 'https://stac.dataspace.copernicus.eu/v1/collections'
const response = await fetch(endpoint, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15_000) })
if (!response.ok) throw new Error(`Copernicus STAC returned HTTP ${response.status}`)
const payload = await response.json()
if (!Array.isArray(payload.collections) || payload.collections.length === 0) throw new Error('Copernicus STAC responded but no collections were returned.')
const ids = payload.collections.map(item => item.id).filter(Boolean)
console.log(`Copernicus STAC live check passed: ${ids.length} collections returned; Sentinel-2 L2A present: ${ids.includes('sentinel-2-l2a')}.`)
