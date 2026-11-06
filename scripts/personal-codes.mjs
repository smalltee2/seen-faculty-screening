// Prints every lecturer's personal code (name_th, name_en, code) for the admin to hand out
// privately, plus the central page URL. Needs the salt: PERSONAL_SALT env or the Keychain
// item "seen-personal-salt" (scripts/personal-salt.sh creates both). Never commit the output.
//   npm run personal-codes            # TSV to stdout
//   npm run personal-codes -- --csv   # CSV with BOM for Excel
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCsv } from './csv.mjs'
import { personalCode, readSalt } from './personal-token.mjs'

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
const csv = process.argv.includes('--csv')
const sep = csv ? ',' : '\t'
const q = (v) => (csv && /[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
const out = [['name_th', 'name_en', 'code', 'page'].join(sep)]
for (const r of rows.slice(1)) {
  const nameEn = col(r, 'name_en')
  if (!nameEn) continue
  out.push([q(col(r, 'name_th')), q(nameEn), personalCode(salt, nameEn), `${BASE}me/`].join(sep))
}
process.stdout.write((csv ? '﻿' : '') + out.join('\n') + '\n')
