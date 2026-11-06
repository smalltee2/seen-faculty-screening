// Sets (or changes) the passcode that unlocks the เพิ่มผลงาน (admin) tab.
// The admin form link is encrypted with the passcode (PBKDF2-SHA256 -> AES-GCM) and
// stored in data/sources.json as adminGate; the plain googleFormUrl is removed, so the
// published site does not contain the link. The passcode itself is never stored.
//
//   npm run set-passcode                       # uses googleFormUrl from data/sources.json
//   npm run set-passcode -- --form-url=<url>   # when changing the passcode later
//   npm run set-passcode -- --form-url=<url> --decision-form-url=<url>   # also the conference-decision form
//
// The site is static, so this protects the tab and the link, not the Google Form itself.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'
import { webcrypto as crypto } from 'node:crypto'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCES = join(ROOT, 'data/sources.json')
const ITERATIONS = 210000

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    rl._writeToOutput = (s) => {
      if (s.startsWith(question)) process.stdout.write(question)
    }
    rl.question(question, (answer) => {
      rl.close()
      process.stdout.write('\n')
      resolve(answer)
    })
  })
}

const b64 = (buf) => Buffer.from(buf).toString('base64')

const sources = JSON.parse(readFileSync(SOURCES, 'utf8'))
const formUrl = process.argv.find((a) => a.startsWith('--form-url='))?.slice('--form-url='.length) ?? sources.googleFormUrl
if (!formUrl) {
  console.error('No form link: pass --form-url=<Google Form link> (the plain link is no longer in data/sources.json).')
  process.exit(1)
}

const decisionFormUrl = process.argv.find((a) => a.startsWith('--decision-form-url='))?.slice('--decision-form-url='.length) ?? sources.decisionFormUrl ?? ''

const pass = await askHidden('New admin passcode (hidden, at least 8 characters): ')
if (pass.length < 8) {
  console.error('Passcode too short; nothing changed.')
  process.exit(1)
}
const again = await askHidden('Type it again: ')
if (again !== pass) {
  console.error('The two entries differ; nothing changed.')
  process.exit(1)
}

const salt = crypto.getRandomValues(new Uint8Array(16))
const iv = crypto.getRandomValues(new Uint8Array(12))
const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey'])
const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt'])
const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify({ formUrl, decisionFormUrl })))

delete sources.googleFormUrl
delete sources.decisionFormUrl
sources.adminGate = { iterations: ITERATIONS, salt: b64(salt), iv: b64(iv), data: b64(data) }
writeFileSync(SOURCES, JSON.stringify(sources, null, 2) + '\n')
console.log('Admin passcode set. The form link is now stored encrypted in data/sources.json. Commit and push to publish.')
