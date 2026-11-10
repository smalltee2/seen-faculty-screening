// Change summary after a data refresh (back-office check, Tum 2026-11-10).
// Evaluates src/generated/data.json with the site's own rules, compares the result with
// data/snapshot.json from the previous refresh, appends what changed to data/changes.json
// (newest first, capped) and rewrites the snapshot. Run after scripts/build-data.mjs:
//
//   npm run snapshot            # compare, record, rewrite the snapshot
//   npm run snapshot -- --dry   # only print what would be recorded
//
// The numbers are those of the bundled data: decisions pressed on the site after the
// build (approvals, นับ/ไม่นับ) enter with the next refresh that fetches them.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { appendChange, changeTotals, diffSnapshots, takeSnapshot, type ChangeEntry, type Snapshot } from '../src/changes'
import { preparePubs } from '../src/classify'
import { ROLES, evaluatePerson, type Settings } from '../src/rules'
import type { DataBundle } from '../src/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BUNDLE = join(ROOT, 'src/generated/data.json')
const SNAPSHOT = join(ROOT, 'data/snapshot.json')
const CHANGES = join(ROOT, 'data/changes.json')
const DRY = process.argv.includes('--dry')
// Same duties as the site shows (SHOWN_ROLES in src/ui.tsx, which this script cannot import: it is a .tsx with assets).
const SHOWN = ROLES.filter((r) => r.level === 'ba' || r.level === 'ms' || r.level === 'phd')

function readJson<T>(path: string, what: string): T {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch (e) {
    throw new Error(`${what} (${path}) cannot be read: ${(e as Error).message}`)
  }
}

if (!existsSync(BUNDLE)) throw new Error(`${BUNDLE} is missing. Run "npm run data" first.`)
const bundle = readJson<DataBundle>(BUNDLE, 'data bundle')
// Same settings as the site's defaults (loadSettings in src/App.tsx).
const settings: Settings = { year: new Date().getFullYear(), countPosters: true, strict: true, screenConferences: bundle.conferenceScreening === 'on' }
const rows = bundle.publications.filter((p) => bundle.faculty.some((f) => f.nameEn === p.key))
const pubs = preparePubs(rows, bundle.overrides, bundle.conferences ?? [])
const results = bundle.faculty.map((f) => evaluatePerson(f, pubs, settings))
const next = takeSnapshot(results, SHOWN, bundle.builtAt, settings.year, (r) => r.person.nameTh || r.person.nameEn)

const prev = existsSync(SNAPSHOT) ? readJson<Snapshot>(SNAPSHOT, 'previous snapshot') : null
const log = existsSync(CHANGES) ? readJson<ChangeEntry[]>(CHANGES, 'change log') : []
if (!Array.isArray(log)) throw new Error(`${CHANGES} is not a list.`)
const entry = prev ? diffSnapshots(prev, next) : null

if (!prev) console.log(`snapshot: first snapshot (${results.length} lecturers); nothing to compare yet.`)
else if (!entry) console.log(`snapshot: no change since ${prev.at}.`)
else {
  const t = changeTotals(entry)
  console.log(`snapshot: ${entry.people.length} lecturer(s) changed since ${prev.at}: +${t.added} works, -${t.removed} works, ${t.recounted} recounted, ${t.status} status change(s).`)
  for (const p of entry.people) for (const s of p.status) console.log(`  ${p.nameEn}: ${s.role} ${s.from ?? '—'} → ${s.to ?? '—'}`)
}
if (DRY) console.log('snapshot: --dry, nothing written.')
else {
  // The snapshot's own time changes on every build; rewrite it only with a change, so quiet refreshes make no commit.
  if (!prev || entry) writeFileSync(SNAPSHOT, JSON.stringify(next) + '\n')
  if (entry || !existsSync(CHANGES)) writeFileSync(CHANGES, JSON.stringify(appendChange(log, entry), null, 1) + '\n')
}
