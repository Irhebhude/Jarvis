import { readdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve('gateway')
const files = (await readdir(root)).filter(name => /^test-.*\.mjs$/.test(name)).sort()
if (!files.length) {
  console.error('No gateway test suites were found.')
  process.exit(1)
}
let failed = 0
for (const file of files) {
  console.log(`\n=== ${file} ===`)
  const result = spawnSync(process.execPath, [resolve(root, file)], { stdio: 'inherit', env: process.env })
  if (result.status !== 0) {
    failed++
    console.error(`FAILED: ${file}`)
  }
}
console.log(`\nGateway test suites: ${files.length - failed} passed, ${failed} failed.`)
process.exit(failed ? 1 : 0)
