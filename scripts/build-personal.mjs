// "ข้อมูลของฉัน": after `vite build`, moves the personal entry to dist/me/index.html (the one
// central page where a lecturer enters their code) and writes dist/p/<folder>/data.json for
// every lecturer, holding only that lecturer's rows; folder = SHA-256(code). Runs as part of
// `npm run build`; without PERSONAL_SALT (or the Keychain item) it skips the data folders,
// so the public site still builds. Codes: npm run personal-codes.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { personalCode, personalFolder, readSalt } from './personal-token.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')
const PAGE = join(DIST, 'personal.html')
const log = (m) => console.log(`[personal] ${m}`)

if (!existsSync(PAGE)) {
  console.error('[personal] dist/personal.html not found; run vite build first')
  process.exit(1)
}
mkdirSync(join(DIST, 'me'), { recursive: true })
writeFileSync(join(DIST, 'me/index.html'), readFileSync(PAGE, 'utf8'))
rmSync(PAGE)

const salt = readSalt()
if (!salt) {
  log('no PERSONAL_SALT and no Keychain item "seen-personal-salt": /me/ page built, but no personal data folders')
  process.exit(0)
}

const data = JSON.parse(readFileSync(join(ROOT, 'src/generated/data.json'), 'utf8'))
rmSync(join(DIST, 'p'), { recursive: true, force: true })
let n = 0
for (const f of data.faculty) {
  const dir = join(DIST, 'p', personalFolder(personalCode(salt, f.nameEn)))
  mkdirSync(dir, { recursive: true })
  const own = {
    builtAt: data.builtAt,
    // Only what the personal page needs: the add-works sheet (filtered client-side); no admin gate.
    sources: { manualSheetCsvUrl: data.sources?.manualSheetCsvUrl },
    faculty: [f],
    publications: data.publications.filter((p) => p.key === f.nameEn),
    overrides: data.overrides.filter((o) => o.key === f.nameEn),
    tci: data.tci ?? [],
    scopusJournals: data.scopusJournals ?? [],
    conferences: data.conferences ?? [],
    conferenceScreening: data.conferenceScreening ?? 'off',
  }
  writeFileSync(join(dir, 'data.json'), JSON.stringify(own))
  n++
}
log(`/me/ page and ${n} personal data folders written (codes: npm run personal-codes)`)
