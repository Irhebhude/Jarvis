import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { deflateRawSync } from 'node:zlib'

function makeZip(name, content) {
  const filename = Buffer.from(name), data = deflateRawSync(Buffer.from(content)), crc = 0
  const local = Buffer.alloc(30 + filename.length); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20,4); local.writeUInt16LE(8,8); local.writeUInt32LE(data.length,18); local.writeUInt32LE(Buffer.byteLength(content),22); local.writeUInt16LE(filename.length,26); filename.copy(local,30)
  const central = Buffer.alloc(46 + filename.length); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20,4); central.writeUInt16LE(20,6); central.writeUInt16LE(8,10); central.writeUInt32LE(data.length,20); central.writeUInt32LE(Buffer.byteLength(content),24); central.writeUInt16LE(filename.length,28); filename.copy(central,46)
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1,8); end.writeUInt16LE(1,10); end.writeUInt32LE(central.length,12); end.writeUInt32LE(local.length + data.length,16)
  return Buffer.concat([local,data,central,end])
}
const dataDir = await mkdtemp(join(tmpdir(), 'jarvis-doc-extract-'))
const provider = createServer(async (_req,res)=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:'ok'}}]}))})
await new Promise(resolve => provider.listen(0,'127.0.0.1',resolve))
const port = 23500 + Math.floor(Math.random()*200)
const gateway = spawn(process.execPath,[resolve('gateway/server.mjs')],{cwd:process.cwd(),env:{...process.env,JARVIS_GATEWAY_HOST:'127.0.0.1',JARVIS_GATEWAY_PORT:String(port),JARVIS_DATA_DIR:dataDir,JARVIS_AI_BASE_URL:`http://127.0.0.1:${provider.address().port}/v1`},stdio:'ignore'})
const base=`http://127.0.0.1:${port}`
const call=async body=>{const r=await fetch(base+'/v1/documents/extract',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()}}
try {
 let ready=false;for(let i=0;i<60;i++){try{if((await fetch(base+'/health')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,100))}assert.equal(ready,true)
 const docx=makeZip('word/document.xml','<w:document xmlns:w="x"><w:body><w:p><w:r><w:t>JARVIS reads Word documents.</w:t></w:r></w:p><w:p><w:r><w:t>Second paragraph.</w:t></w:r></w:p></w:body></w:document>')
 let result=await call({filename:'notes.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',data:docx.toString('base64')})
 assert.equal(result.status,201);assert.match(result.body.document.preview,/JARVIS reads Word documents/)
 const pdf=Buffer.from('%PDF-1.4\n1 0 obj\n<< /Length 46 >>\nstream\nBT (PDF text extraction works) Tj ET\nendstream\nendobj\n%%EOF','latin1')
 result=await call({filename:'notes.pdf',mimeType:'application/pdf',data:pdf.toString('base64')})
 assert.equal(result.status,201);assert.match(result.body.document.preview,/PDF text extraction works/)
 result=await call({filename:'bad.docx',mimeType:'application/pdf',data:docx.toString('base64')});assert.equal(result.status,415)
 result=await call({filename:'scan.pdf',mimeType:'application/pdf',data:Buffer.from('%PDF-1.4\n%%EOF').toString('base64')});assert.equal(result.status,422)
 console.log('Document extraction tests passed: DOCX paragraphs, basic PDF text, MIME mismatch rejection and scanned/empty PDF handling.')
} finally {gateway.kill('SIGTERM');await new Promise(resolve=>{gateway.once('exit',resolve);setTimeout(resolve,1000).unref()});provider.close();await rm(dataDir,{recursive:true,force:true})}
