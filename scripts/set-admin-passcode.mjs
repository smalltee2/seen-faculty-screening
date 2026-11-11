// Sets (or changes) an admin passcode. Two levels (2026-11-07):
//   level 2 (default) unlocks the whole สำหรับผู้ดูแลระบบ tab: ข้อมูลอาจารย์, เพิ่มผลงานด้วยตนเอง,
//           the conference register and the decision form (stored as adminGate);
//   level 1 (--level=1) unlocks only ข้อมูลอาจารย์ (stored as viewerGate).
//   npm run set-passcode -- --level=1          # set or change the level-1 passcode
// The two passcodes must differ. Each level-2 run also creates a new approval key (see below).
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
// A mistyped option (--level 1, --level=one, --form_url=…) must not fall through to the default and
// replace the level-2 passcode and its approval key.
const KNOWN = [/^--level=[12]$/, /^--form-url=.+/, /^--decision-form-url=.*/]
const unknown = process.argv.slice(2).filter((a) => !KNOWN.some((re) => re.test(a)))
if (unknown.length) {
  console.error(`Unknown option(s): ${unknown.join(' ')}. Use --level=1 or --level=2, --form-url=<url>, --decision-form-url=<url>. Nothing changed.`)
  process.exit(1)
}
const level = process.argv.includes('--level=1') ? 1 : 2

async function encrypt(pass, payload) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey'])
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt'])
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(payload)))
  return { iterations: ITERATIONS, salt: b64(salt), iv: b64(iv), data: b64(data) }
}

/** True when `pass` opens `gate`: the two levels must not share a passcode, or the site could not
 *  tell which level was meant. */
async function opens(gate, pass) {
  if (!gate?.salt || !gate.iv || !gate.data) return false
  try {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey'])
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: Buffer.from(gate.salt, 'base64'), iterations: gate.iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt'])
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(gate.iv, 'base64') }, key, Buffer.from(gate.data, 'base64'))
    return true
  } catch {
    return false
  }
}
function refuseSame() {
  console.error('This passcode is already the passcode of the other level; the two must differ. Nothing changed.')
  process.exit(1)
}

async function askPass(label) {
  const pass = await askHidden(`New ${label} passcode (hidden, at least 8 characters): `)
  if (pass.length < 8) {
    console.error('Passcode too short; nothing changed.')
    process.exit(1)
  }
  const again = await askHidden('Type it again: ')
  if (again !== pass) {
    console.error('The two entries differ; nothing changed.')
    process.exit(1)
  }
  return pass
}

if (level === 1) {
  const pass = await askPass('level-1 (ข้อมูลอาจารย์ only)')
  if (await opens(sources.adminGate, pass)) refuseSame()
  sources.viewerGate = await encrypt(pass, { level: 1 })
  writeFileSync(SOURCES, JSON.stringify(sources, null, 2) + '\n')
  console.log('Level-1 passcode set (viewerGate in data/sources.json). Commit and push to publish.')
  process.exit(0)
}

const formUrl = process.argv.find((a) => a.startsWith('--form-url='))?.slice('--form-url='.length) ?? sources.googleFormUrl
if (!formUrl) {
  console.error('No form link: pass --form-url=<Google Form link> (the plain link is no longer in data/sources.json).')
  process.exit(1)
}

const decisionFormUrl = process.argv.find((a) => a.startsWith('--decision-form-url='))?.slice('--decision-form-url='.length) ?? sources.decisionFormUrl ?? ''

const pass = await askPass('level-2 admin')
if (await opens(sources.viewerGate, pass)) refuseSame()
// Approval key (2026-11-07): random, stored only inside the encrypted level-2 data, so whoever
// opens level 2 can approve lecturers' works. The backend keeps only its SHA-256 (approvalKeyHash,
// safe to publish), copied into apps-script/Code.gs (APPROVAL_KEY_HASH). A new passcode = a new key.
const approvalKey = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex')
const approvalKeyHash = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(approvalKey))).toString('hex')
delete sources.googleFormUrl
delete sources.decisionFormUrl
sources.adminGate = await encrypt(pass, { formUrl, decisionFormUrl, level: 2, approvalKey })
sources.approvalKeyHash = approvalKeyHash
writeFileSync(SOURCES, JSON.stringify(sources, null, 2) + '\n')
console.log('Admin passcode set. The form links and a new approval key are stored encrypted in data/sources.json.')
console.log('The backend must learn the new key: set APPROVAL_KEY_HASH in apps-script/Code.gs to approvalKeyHash from data/sources.json and deploy a new version (or ask Claude). Then commit and push.')
