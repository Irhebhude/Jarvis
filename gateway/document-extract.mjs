import { inflateRawSync, inflateSync } from 'node:zlib'

function decodeXml(value) {
  return value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
}
function extractDocx(buffer) {
  let eocd = -1
  for (let i = Math.max(0, buffer.length - 65557); i <= buffer.length - 22; i++) if (buffer.readUInt32LE(i) === 0x06054b50) eocd = i
  if (eocd < 0) throw new Error('DOCX archive directory is invalid.')
  const count = buffer.readUInt16LE(eocd + 10)
  let offset = buffer.readUInt32LE(eocd + 16)
  if (count > 10000) throw new Error('DOCX contains too many archive entries.')
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('DOCX archive entry is invalid.')
    const method = buffer.readUInt16LE(offset + 10), compressedSize = buffer.readUInt32LE(offset + 20), uncompressedSize = buffer.readUInt32LE(offset + 24)
    if (uncompressedSize > 3 * 1024 * 1024 || compressedSize > 3 * 1024 * 1024) throw new Error('DOCX expanded content exceeds the 3 MB extraction limit.')
    const nameLength = buffer.readUInt16LE(offset + 28), extraLength = buffer.readUInt16LE(offset + 30), commentLength = buffer.readUInt16LE(offset + 32)
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength)
    const localOffset = buffer.readUInt32LE(offset + 42)
    if (name === 'word/document.xml') {
      if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('DOCX document entry is invalid.')
      const localName = buffer.readUInt16LE(localOffset + 26), localExtra = buffer.readUInt16LE(localOffset + 28)
      const start = localOffset + 30 + localName + localExtra
      const compressed = buffer.subarray(start, start + compressedSize)
      const xml = (method === 0 ? compressed : method === 8 ? inflateRawSync(compressed, { maxOutputLength: 3 * 1024 * 1024 }) : null)?.toString('utf8')
      if (!xml) throw new Error('DOCX uses an unsupported compression method.')
      return decodeXml(xml.replace(/<w:tab\b[^>]*\/>/g, '\t').replace(/<w:br\b[^>]*\/>/g, '\n').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '')).replace(/\n{3,}/g, '\n\n').trim()
    }
    offset += 46 + nameLength + extraLength + commentLength
  }
  throw new Error('DOCX does not contain word/document.xml.')
}
function unescapePdfLiteral(raw) {
  let out = ''
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== '\\') { out += raw[i]; continue }
    const c = raw[++i]
    if (c === 'n') out += '\n'; else if (c === 'r') out += '\r'; else if (c === 't') out += '\t'; else if (c === 'b') out += '\b'; else if (c === 'f') out += '\f'; else if (c === '\n') {} else if (c === '\r') { if (raw[i + 1] === '\n') i++ } else if (/[0-7]/.test(c ?? '')) { let oct = c; for (let j = 0; j < 2 && /[0-7]/.test(raw[i + 1] ?? ''); j++) oct += raw[++i]; out += String.fromCharCode(parseInt(oct, 8)) } else out += c ?? ''
  }
  return out
}
function extractPdf(buffer) {
  const source = buffer.toString('latin1')
  if (!source.startsWith('%PDF-')) throw new Error('File is not a valid PDF.')
  const streams = []
  const re = /(<<(?:.|\r|\n)*?>>)\s*stream\r?\n([\s\S]*?)\r?\nendstream/g
  let match
  while ((match = re.exec(source))) {
    let data = Buffer.from(match[2], 'latin1')
    if (/\/FlateDecode/.test(match[1])) { try { data = inflateSync(data, { maxOutputLength: 4 * 1024 * 1024 }) } catch { try { data = inflateRawSync(data, { maxOutputLength: 4 * 1024 * 1024 }) } catch { continue } } }
    if (data.length > 4 * 1024 * 1024) continue
    streams.push(data.toString('latin1'))
  }
  const text = []
  for (const stream of streams) {
    const token = /\(((?:\\.|[^\\)])*)\)\s*Tj|\[((?:.|\r|\n)*?)\]\s*TJ|<([\da-f\s]+)>\s*Tj/g
    let item
    while ((item = token.exec(stream))) {
      if (item[1] !== undefined) text.push(unescapePdfLiteral(item[1]))
      else if (item[2] !== undefined) {
        const pieces = item[2].match(/\(((?:\\.|[^\\)])*)\)|<([\da-f\s]+)>/g) ?? []
        text.push(pieces.map(piece => piece[0] === '(' ? unescapePdfLiteral(piece.slice(1, -1)) : Buffer.from(piece.slice(1, -1).replace(/\s/g, ''), 'hex').toString('latin1')).join(''))
      } else if (item[3] !== undefined) text.push(Buffer.from(item[3].replace(/\s/g, ''), 'hex').toString('latin1'))
    }
  }
  const result = text.join(' ').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').replace(/\s+/g, ' ').trim()
  if (!result) throw new Error('No extractable text was found. This PDF may be scanned or use unsupported font encoding; OCR is not included.')
  return result
}
export function extractDocumentText(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) throw new Error('The uploaded document is empty or invalid.')
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return extractDocx(buffer)
  if (mimeType === 'application/pdf') return extractPdf(buffer)
  throw new Error('Only PDF and DOCX files are supported.')
}
