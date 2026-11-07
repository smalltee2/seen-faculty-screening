// Converts data/faculty.csv, data/publications.tsv and data/overrides.csv
// into src/generated/data.json for the site. Classification and screening run
// in the browser (src/classify.ts, src/rules.ts); this script only parses and
// validates, and fails loudly on malformed input.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCsv } from './csv.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CONFIG = {
  faculty: join(ROOT, 'data/faculty.csv'),
  publications: join(ROOT, 'data/publications.tsv'),
  overrides: join(ROOT, 'data/overrides.csv'),
  conferences: join(ROOT, 'data/conferences.csv'),
  rules: join(ROOT, 'data/rules.json'),
  out: join(ROOT, 'src/generated/data.json'),
  ranks: ['อาจารย์', 'ผศ.', 'รศ.', 'ศ.'],
  degrees: ['ปริญญาโท', 'ปริญญาเอก'],
  types: ['journal', 'proceeding', 'poster', 'exclude'],
  yesNo: ['yes', 'no'],
}

const log = (msg) => console.log(`[build-data] ${msg}`)
const warn = (msg) => console.warn(`[build-data] WARNING: ${msg}`)
const errors = []
const fail = (msg) => errors.push(msg)

function parseTsv(text) {
  return text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
    .map((l) => l.split('\t'))
}

function toRecords(rows, required, file) {
  if (!rows.length) { fail(`${file}: file is empty (a header row is required)`); return [] }
  const header = rows[0].map((h) => h.trim())
  const missing = required.filter((c) => !header.includes(c))
  if (missing.length) { fail(`${file}: missing column(s) ${missing.join(', ')}; found ${header.join(', ')}`); return [] }
  return rows.slice(1).map((r, i) => {
    const rec = { _line: i + 2 }
    header.forEach((h, j) => { rec[h] = (r[j] ?? '').trim() })
    return rec
  })
}

const read = (p) => readFileSync(p, 'utf8')

const faculty = toRecords(
  parseCsv(read(CONFIG.faculty)),
  ['name_en', 'name_th', 'scholar_id', 'academic_rank', 'highest_degree', 'degree_field', 'degree_year_ce', 'programs', 'notes'],
  'faculty.csv',
).map((f) => {
  if (!f.name_en) fail(`faculty.csv line ${f._line}: name_en is empty`)
  if (f.academic_rank && !CONFIG.ranks.includes(f.academic_rank))
    fail(`faculty.csv line ${f._line}: academic_rank "${f.academic_rank}" is not one of ${CONFIG.ranks.join(' | ')}`)
  if (f.highest_degree && !CONFIG.degrees.includes(f.highest_degree))
    fail(`faculty.csv line ${f._line}: highest_degree "${f.highest_degree}" is not one of ${CONFIG.degrees.join(' | ')}`)
  let degreeYear = null
  if (f.degree_year_ce) {
    degreeYear = Number(f.degree_year_ce)
    if (!Number.isInteger(degreeYear) || degreeYear < 1950 || degreeYear > 2100)
      fail(`faculty.csv line ${f._line}: degree_year_ce "${f.degree_year_ce}" must be a Common Era year (e.g. 2015, not 2558)`)
  }
  return {
    nameEn: f.name_en,
    nameTh: f.name_th,
    scholarId: f.scholar_id,
    openalexId: f.openalex_id ?? '',
    scopusId: f.scopus_id ?? '',
    rank: f.academic_rank || null,
    degree: f.highest_degree || null,
    degreeField: f.degree_field || null,
    degreeYear,
    programs: f.programs ? f.programs.split(';').map((s) => s.trim()).filter(Boolean) : [],
    notes: f.notes,
  }
})

// Conference register (optional): see src/conferences.ts and scripts/screen-conferences.ts.
const CONF_COLS = ['key', 'display_name', 'conference_name', 'organiser', 'association', 'association_role', 'field', 'related_field', 'confidence', 'evidence_url', 'checked_at', 'checked_by', 'note', 'decision', 'decided_by', 'decided_at', 'decision_note']
const conferences = existsSync(CONFIG.conferences)
  ? toRecords(parseCsv(read(CONFIG.conferences)), CONF_COLS, 'conferences.csv').map((c) => {
      if (!c.key) fail(`conferences.csv line ${c._line}: key is empty`)
      if (!['organiser', 'co_organiser', 'none', 'unknown'].includes(c.association_role)) fail(`conferences.csv line ${c._line}: association_role "${c.association_role}"`)
      if (!['yes', 'no', 'unknown'].includes(c.related_field)) fail(`conferences.csv line ${c._line}: related_field "${c.related_field}"`)
      if (!['high', 'medium', 'low'].includes(c.confidence)) fail(`conferences.csv line ${c._line}: confidence "${c.confidence}"`)
      if (!['count', 'no_count', ''].includes(c.decision)) fail(`conferences.csv line ${c._line}: decision "${c.decision}" must be count, no_count or empty`)
      return {
        key: c.key, displayName: c.display_name, conferenceName: c.conference_name, organiser: c.organiser, association: c.association,
        associationRole: c.association_role, field: c.field, relatedField: c.related_field, confidence: c.confidence, evidenceUrl: c.evidence_url,
        checkedAt: c.checked_at, checkedBy: c.checked_by, note: c.note, decision: c.decision, decidedBy: c.decided_by, decidedAt: c.decided_at, decisionNote: c.decision_note,
      }
    })
  : []
{
  const dup = conferences.map((c) => c.key).filter((k, i, a) => a.indexOf(k) !== i)
  if (dup.length) fail(`conferences.csv: duplicate key(s) ${[...new Set(dup)].join(', ')}`)
}
const rules = existsSync(CONFIG.rules) ? JSON.parse(read(CONFIG.rules)) : {}
const conferenceScreening = rules.conferenceScreening === 'on' ? 'on' : 'off'

const names = new Set()
for (const f of faculty) {
  if (names.has(f.nameEn)) fail(`faculty.csv: duplicate name_en "${f.nameEn}"`)
  names.add(f.nameEn)
}

// All publication sources share the Scholar columns; the structured ones add a type.
const SOURCES = [
  { file: CONFIG.publications, name: 'scholar', label: 'publications.tsv', required: true },
  { file: join(ROOT, 'data/openalex.tsv'), name: 'openalex', label: 'openalex.tsv', ext: (p) => ({ doi: p.doi, extType: p.oa_type, sourceType: p.source_type, issn: p.issn ?? '' }) },
  { file: join(ROOT, 'data/scopus.tsv'), name: 'scopus', label: 'scopus.tsv', ext: (p) => ({ doi: p.doi, extType: p.sc_type, sourceType: p.source_type, issn: p.issn ?? '', eid: p.eid ?? '', ...(p.cover_date || p.volume || p.page_range || p.article_number ? { biblio: { date: p.cover_date ?? '', volume: p.volume ?? '', issue: p.issue ?? '', pages: p.page_range ?? '', articleNumber: p.article_number ?? '' } } : {}) }) },
  { file: join(ROOT, 'data/manual.tsv'), name: 'manual', label: 'manual.tsv', ext: (p) => ({ doi: p.doi, extType: p.type, manualResearch: p.is_research === 'yes', submitted: p.submitted, issn: p.issn ?? '' }) },
  // Works lecturers added themselves and a level-2 admin approved (scripts/fetch-sources.mjs fetchSelf).
  { file: join(ROOT, 'data/self.tsv'), name: 'manual', label: 'self.tsv', ext: (p) => ({ doi: p.doi, extType: p.type, manualResearch: p.is_research === 'yes', submitted: p.submitted, issn: p.issn ?? '' }) },
]
const publications = SOURCES.flatMap((src) => {
  if (!src.required && !existsSync(src.file)) return []
  return toRecords(parseTsv(read(src.file)), ['key', 'year', 'title', 'authors', 'venue', 'cites'], src.label).map((p) => {
    const year = p.year ? Number(p.year) : null
    if (year !== null && (!Number.isInteger(year) || year < 1900 || year > 2100)) fail(`${src.label} line ${p._line}: year "${p.year}" is not a valid year`)
    return {
      line: p._line,
      source: src.name,
      key: p.key,
      year,
      title: p.title,
      authors: p.authors,
      venue: p.venue,
      cites: p.cites ? Number(p.cites) || 0 : 0,
      ...(src.ext ? src.ext(p) : {}),
    }
  })
})

const unknownKeys = [...new Set(publications.map((p) => p.key).filter((k) => !names.has(k)))]
if (unknownKeys.length) warn(`publications.tsv keys not in faculty.csv (rows ignored by the site): ${unknownKeys.join('; ')}`)
const noPubs = faculty.filter((f) => !publications.some((p) => p.key === f.nameEn)).map((f) => f.nameEn)
if (noPubs.length) warn(`lecturers with no rows in publications.tsv: ${noPubs.join('; ')}`)

const overrides = toRecords(
  parseCsv(read(CONFIG.overrides)),
  ['key', 'title_normalized', 'type_override', 'is_research', 'part_of_own_degree', 'note'],
  'overrides.csv',
).map((o) => {
  if (!o.key || !o.title_normalized) fail(`overrides.csv line ${o._line}: key and title_normalized are required`)
  if (o.type_override && !CONFIG.types.includes(o.type_override))
    fail(`overrides.csv line ${o._line}: type_override "${o.type_override}" is not one of ${CONFIG.types.join(' | ')}`)
  for (const col of ['is_research', 'part_of_own_degree'])
    if (o[col] && !CONFIG.yesNo.includes(o[col])) fail(`overrides.csv line ${o._line}: ${col} "${o[col]}" must be yes or no`)
  return {
    key: o.key,
    titleNormalized: o.title_normalized,
    type: o.type_override || null,
    isResearch: o.is_research ? o.is_research === 'yes' : null,
    ownDegree: o.part_of_own_degree ? o.part_of_own_degree === 'yes' : null,
    note: o.note,
  }
})

if (errors.length) {
  for (const e of errors) console.error(`[build-data] ERROR: ${e}`)
  process.exit(1)
}

// TCI journal list (data/tci_journals.csv, from scripts/fetch-sources.mjs --only=tci).
// Only journals that currently hold a กลุ่ม are kept; the site treats กลุ่ม 1–2 as ระดับชาติ.
const tciFile = join(ROOT, 'data/tci_journals.csv')
const tci = existsSync(tciFile)
  ? toRecords(parseCsv(read(tciFile)), ['id', 'name_eng', 'name_local', 'issn', 'eissn', 'tci_tier', 'status'], 'tci_journals.csv')
      .filter((j) => ['1', '2', '3'].includes(j.tci_tier))
      .map((j) => ({ nameEng: j.name_eng, nameLocal: j.name_local, abbrev: j.abbrev_name ?? '', issn: j.issn, eissn: j.eissn, tier: j.tci_tier, status: j.status }))
  : []
if (!tci.length) warn('data/tci_journals.csv missing or empty: national journals cannot be matched to TCI')

// Journals known to be indexed in Scopus (data/scopus_journals.csv), by ISSN.
const sjFile = join(ROOT, 'data/scopus_journals.csv')
const scopusJournals = existsSync(sjFile)
  ? toRecords(parseCsv(read(sjFile)), ['issn', 'in_scopus', 'name'], 'scopus_journals.csv')
      .filter((j) => j.in_scopus === 'yes')
      .map((j) => ({ issn: j.issn, name: j.name }))
  : []

// Crossref bibliographic details per DOI (data/crossref.tsv, scripts/fetch-sources.mjs), for the CSV export.
const crFile = join(ROOT, 'data/crossref.tsv')
const crossref = existsSync(crFile)
  ? toRecords(parseTsv(read(crFile)), ['doi'], 'crossref.tsv')
      .filter((r) => r.fetched)
      .map((r) => ({ doi: r.doi, journal: r.journal ?? '', volume: r.volume ?? '', issue: r.issue ?? '', pageStart: r.page_start ?? '', pageEnd: r.page_end ?? '', articleNumber: r.article_number ?? '', published: r.published ?? '', publishedOnline: r.published_online ?? '' }))
  : []
// Hand-checked bibliographic details (data/biblio_overrides.csv, with source_url) for DOIs that
// Crossref does not know or gets wrong; a filled field there wins over Crossref, an empty one does not.
const boFile = join(ROOT, 'data/biblio_overrides.csv')
const biblioOverrides = existsSync(boFile) ? toRecords(parseCsv(read(boFile)), ['doi', 'source_url'], 'biblio_overrides.csv') : []
for (const o of biblioOverrides) {
  if (!o.source_url) fail(`biblio_overrides.csv: ${o.doi} has no source_url`)
  const doi = o.doi.trim().toLowerCase()
  const fields = { journal: o.journal, volume: o.volume, issue: o.issue, pageStart: o.page_start, pageEnd: o.page_end, articleNumber: o.article_number, published: o.published }
  let entry = crossref.find((c) => c.doi.toLowerCase() === doi)
  if (!entry) {
    entry = { doi, journal: '', volume: '', issue: '', pageStart: '', pageEnd: '', articleNumber: '', published: '', publishedOnline: '' }
    crossref.push(entry)
  }
  for (const [k, v] of Object.entries(fields)) if (v) entry[k] = v.trim()
}
if (errors.length) {
  for (const e of errors) console.error(`[build-data] ERROR: ${e}`)
  process.exit(1)
}

// Only the keys the browser uses go into the public bundle (2026-11-07: a retired form's sheet
// URL, whose sheet carried respondents' e-mail addresses, used to be copied along with everything else).
const PUBLIC_SOURCE_KEYS = ['manualSheetCsvUrl', 'googleFormUrl', 'adminGate', 'viewerGate', 'loginApiUrl', 'approvalKeyHash']
function publicSources() {
  const f = join(ROOT, 'data/sources.json')
  if (!existsSync(f)) return {}
  const all = JSON.parse(read(f))
  return Object.fromEntries(PUBLIC_SOURCE_KEYS.filter((k) => k in all).map((k) => [k, all[k]]))
}

mkdirSync(dirname(CONFIG.out), { recursive: true })
writeFileSync(
  CONFIG.out,
  JSON.stringify({ builtAt: new Date().toISOString(), sources: publicSources(), faculty, publications, overrides, tci, scopusJournals, conferences, conferenceScreening, crossref }, null, 1),
)
log(`${faculty.length} lecturers, ${publications.length} publication rows, ${overrides.length} overrides, ${tci.length} TCI journals, ${scopusJournals.length} Scopus journals, ${conferences.length} conferences (screening ${conferenceScreening}), ${crossref.length} Crossref records (${biblioOverrides.length} hand overrides) -> src/generated/data.json`)
