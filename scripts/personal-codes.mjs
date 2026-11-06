// Prints every lecturer's personal code (name_th, name_en, code) for the admin to hand out
// privately, plus the central page URL. Needs the salt: PERSONAL_SALT env or the Keychain
// item "seen-personal-salt" (scripts/personal-salt.sh creates both). Never commit the output.
//   npm run personal-codes            # TSV to stdout
//   npm run personal-codes -- --csv   # CSV with BOM for Excel
//   npm run personal-codes -- --users # CSV for the private 'users' sheet of the login backend
//                                     # (email guessed from the name — verify; folder = SHA-256(code))
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCsv } from './csv.mjs'
import { personalCode, personalFolder, readSalt } from './personal-token.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = process.env.PERSONAL_BASE_URL ?? 'https://smalltee2.github.io/seen-faculty-screening/'
const salt = readSalt()
if (!salt) {
  console.error('No salt: set PERSONAL_SALT or run scripts/personal-salt.sh once on this Mac.')
  process.exit(1)
}
const rows = parseCsv(readFileSync(join(ROOT, 'data/faculty.csv'), 'utf8'))
const header = rows[0].map((h) => h.trim())
const col = (r, name) => (r[header.indexOf(name)] ?? '').trim()
const csv = process.argv.includes('--csv') || process.argv.includes('--users')
const users = process.argv.includes('--users')
// Guessed UP address: firstname.<first two letters of surname>@up.ac.th (verify before use).
const guessEmail = (nameEn) => {
  const parts = nameEn.trim().toLowerCase().split(/\s+/)
  return parts.length < 2 ? '' : `${parts[0]}.${parts[parts.length - 1].slice(0, 2)}@up.ac.th`
}
const sep = csv ? ',' : '\t'
const q = (v) => (csv && /[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
const out = [(users ? ['email', 'name_en', 'name_th', 'folder', 'active'] : ['name_th', 'name_en', 'code', 'page']).join(sep)]
for (const r of rows.slice(1)) {
  const nameEn = col(r, 'name_en')
  if (!nameEn) continue
  const code = personalCode(salt, nameEn)
  out.push(
    (users ? [guessEmail(nameEn), q(nameEn), q(col(r, 'name_th')), personalFolder(code), 'yes'] : [q(col(r, 'name_th')), q(nameEn), code, `${BASE}me/`]).join(sep),
  )
}
process.stdout.write((csv ? '﻿' : '') + out.join('\n') + '\n')
