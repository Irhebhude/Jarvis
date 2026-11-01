import { spawn } from 'node:child_process'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
const dataDir = await mkdtemp(join(tmpdir(), 'jarvis-task-test-'))
const port = 19700 + Math.floor(Math.random() * 500)
const child = spawn(process.execPath, [resolve('gateway/server.mjs')], { cwd: process.cwd(), env: { ...process.env, JARVIS_GATEWAY_HOST: '127.0.0.1', JARVIS_GATEWAY_PORT: String(port), JARVIS_DATA_DIR: dataDir }, stdio: 'ignore' })
const base = `http://127.0.0.1:${port}`
async function request(path, options={}) { const r=await fetch(base+path,{...options,headers:{'content-type':'application/json',...(options.headers??{})}}); return {status:r.status,body:await r.json()} }
try {
  let ready=false
  for(let i=0;i<60;i++){try{if((await fetch(base+'/health')).ok){ready=true;break}}catch{} await new Promise(r=>setTimeout(r,100))}
  assert.equal(ready,true,'gateway starts')
  let r=await request('/v1/tasks',{method:'POST',body:JSON.stringify({title:'Review sensor design',agent:'hedy',priority:'high'})}); assert.equal(r.status,201); const id=r.body.task.id; assert.equal(r.body.task.status,'planned')
  r=await request(`/v1/tasks/${id}`,{method:'PATCH',body:JSON.stringify({status:'in_progress'})}); assert.equal(r.status,200)
  r=await request(`/v1/tasks/${id}`,{method:'PATCH',body:JSON.stringify({status:'completed'})}); assert.equal(r.status,200)
  r=await request('/v1/tasks',{method:'POST',body:JSON.stringify({title:'Send a message',requiresApproval:true})}); assert.equal(r.status,201); const approvalId=r.body.task.id; assert.equal(r.body.task.status,'awaiting_approval')
  r=await request(`/v1/tasks/${approvalId}`,{method:'PATCH',body:JSON.stringify({status:'in_progress'})}); assert.equal(r.status,403)
  r=await request(`/v1/tasks/${approvalId}`,{method:'PATCH',body:JSON.stringify({approved:true})}); assert.equal(r.status,200); assert.equal(r.body.task.status,'planned')
  r=await request('/v1/tasks',{method:'POST',body:JSON.stringify({title:''})}); assert.equal(r.status,400)
  r=await request(`/v1/tasks/${id}`,{method:'PATCH',body:JSON.stringify({status:'planned'})}); assert.equal(r.status,409)
  r=await request('/v1/tasks?status=planned'); assert.equal(r.status,200); assert.equal(r.body.count,1)
  const saved=JSON.parse(await readFile(join(dataDir,'tasks.json'),'utf8')); assert.equal(saved.length,2); assert.equal(saved.find(t=>t.id===id).status,'completed')
  console.log('Task API integration tests passed: creation, validation, approval gate, transitions, filtering and persistence.')
} finally { child.kill('SIGTERM'); await rm(dataDir,{recursive:true,force:true}) }
