// Converts data/faculty.csv, data/publications.tsv and data/overrides.csv
// into src/generated/data.json for the site. Classification and screening run
// in the browser (src/classify.ts, src/rules.ts); this script only parses and
// validates, and fails loudly on malformed input.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCsv } from './csv.mjs'
import { newWorks } from './new-works.mjs'

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
  // Each row keeps its line number in the file, so a message still points at the right line after
  // a blank line.
  return text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((l, i) => Object.assign(l.split('\t'), { line: i + 1 }))
    .filter((r) => r.join('').trim() !== '')
}

function toRecords(rows, required, file) {
  if (!rows.length) { fail(`${file}: file is empty (a header row is required)`); return [] }
  const header = rows[0].map((h) => h.trim())
  const missing = required.filter((c) => !header.includes(c))
  if (missing.length) { fail(`${file}: missing column(s) ${missing.join(', ')}; found ${header.join(', ')}`); return [] }
  return rows.slice(1).map((r, i) => {
    const rec = { _line: r.line ?? i + 2 }
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
  { file: join(ROOT, 'data/openalex.tsv'), name: 'openalex', label: 'openalex.tsv', ext: (p) => ({ doi: p.doi, extType: p.oa_type, sourceType: p.source_type, issn: p.issn ?? '', ...(p.pub_date ? { pubDate: p.pub_date } : {}) }) },
  { file: join(ROOT, 'data/scopus.tsv'), name: 'scopus', label: 'scopus.tsv', ext: (p) => ({ doi: p.doi, extType: p.sc_type, sourceType: p.source_type, issn: p.issn ?? '', eid: p.eid ?? '', ...(p.cover_date || p.volume || p.page_range || p.article_number ? { biblio: { date: p.cover_date ?? '', volume: p.volume ?? '', issue: p.issue ?? '', pages: p.page_range ?? '', articleNumber: p.article_number ?? '' } } : {}) }) },
  // Articles in Thai journals found by the lecturer's name in the TCI article search (fetch-sources.mjs fetchTciArticles).
  { file: join(ROOT, 'data/tci_articles.tsv'), name: 'tci', label: 'tci_articles.tsv', ext: (p) => ({ extType: 'article', sourceType: 'journal', issn: p.issn ?? '' }) },
  { file: join(ROOT, 'data/manual.tsv'), name: 'manual', label: 'manual.tsv', ext: (p) => ({ doi: p.doi, extType: p.type, manualResearch: p.is_research === 'yes', submitted: p.submitted, issn: p.issn ?? '' }) },
  // Google Scholar rows a level-2 admin imported on the admin page (scripts/fetch-sources.mjs fetchScholarImports).
  { file: join(ROOT, 'data/scholar_imports.tsv'), name: 'scholar', label: 'scholar_imports.tsv', ext: (p) => (p.batch ? { submitted: `scholar:${p.batch}` } : {}) },
  // Works lecturers added themselves and a level-2 admin approved (scripts/fetch-sources.mjs fetchSelf).
  { file: join(ROOT, 'data/self.tsv'), name: 'manual', label: 'self.tsv', ext: (p) => ({ doi: p.doi, extType: p.type, manualResearch: p.is_research === 'yes', submitted: p.submitted, issn: p.issn ?? '' }) },
]
// Admin-form works a level-2 admin cancelled on the site (fetch-sources.mjs fetchFormCancels).
// Same normalisation as src/classify.ts normalizeTitle and the backend's normTitle.
const normTitle = (t) => String(t ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, '')
const FORM_CANCELS = join(ROOT, 'data/form_cancels.tsv')
const formCancelled = new Set(existsSync(FORM_CANCELS) ? toRecords(parseTsv(read(FORM_CANCELS)), ['name_en', 'title_norm'], 'form_cancels.tsv').map((r) => `${r.name_en}|${r.title_norm}`) : [])
let formDropped = 0
const publications = SOURCES.flatMap((src) => {
  if (!src.required && !existsSync(src.file)) return []
  return toRecords(parseTsv(read(src.file)), ['key', 'year', 'title', 'authors', 'venue', 'cites'], src.label).filter((p) => {
    if (src.label !== 'manual.tsv' || !formCancelled.has(`${p.key}|${normTitle(p.title)}`)) return true
    formDropped++
    return false
  }).map((p) => {
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
if (formDropped) log(`${formDropped} admin-form row(s) cancelled on the site (data/form_cancels.tsv) left out`)

const unknownKeys = [...new Set(publications.map((p) => p.key).filter((k) => !names.has(k)))]
if (unknownKeys.length) warn(`publication keys not in faculty.csv, in any source file (rows ignored by the site): ${unknownKeys.join('; ')}`)
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

// Programme membership for the admin tab's "หลักสูตร" view (Tum, 2026-11-08; list supplied by Tum from
// the faculty's programme pages). Display only: it does not fill faculty.programs, which the
// programme-level check in src/rules.ts reads.
const programmes = []
const PROG_FILE = join(ROOT, 'data/programmes.csv')
if (existsSync(PROG_FILE)) {
  const rows = toRecords(parseCsv(read(PROG_FILE)), ['programme_id', 'programme_th', 'level', 'name_en', 'role', 'email', 'ext', 'responsible'], 'programmes.csv')
  for (const r of rows) {
    if (!/^[a-z0-9-]+$/.test(r.programme_id)) fail(`programmes.csv line ${r._line}: programme_id "${r.programme_id}" must be lowercase letters, digits and "-"`)
    if (!['ba', 'ms', 'phd'].includes(r.level)) fail(`programmes.csv line ${r._line}: level "${r.level}" is not one of ba | ms | phd`)
    if (!['ประธานหลักสูตร', 'อาจารย์'].includes(r.role)) fail(`programmes.csv line ${r._line}: role "${r.role}" is not ประธานหลักสูตร | อาจารย์`)
    if (!['yes', ''].includes(r.responsible)) fail(`programmes.csv line ${r._line}: responsible "${r.responsible}" must be yes or empty`)
    if (!faculty.some((f) => f.nameEn === r.name_en)) fail(`programmes.csv line ${r._line}: name_en "${r.name_en}" is not in faculty.csv`)
    let prog = programmes.find((x) => x.id === r.programme_id)
    if (!prog) { prog = { id: r.programme_id, th: r.programme_th, level: r.level, members: [] }; programmes.push(prog) }
    else if (prog.th !== r.programme_th || prog.level !== r.level) fail(`programmes.csv line ${r._line}: programme_th/level differ from earlier rows of "${r.programme_id}"`)
    if (prog.members.some((m) => m.nameEn === r.name_en)) fail(`programmes.csv line ${r._line}: "${r.name_en}" listed twice in "${r.programme_id}"`)
    prog.members.push({ nameEn: r.name_en, role: r.role, email: r.email, ext: r.ext, responsible: r.responsible === 'yes' })
  }
}
if (errors.length) {
  for (const e of errors) console.error(`[build-data] ERROR: ${e}`)
  process.exit(1)
}

// TCI journal list (data/tci_journals.csv, from scripts/fetch-sources.mjs --only=tci).
// Only journals that currently hold a กลุ่ม are kept; the site treats กลุ่ม 1–2 as ระดับชาติ.
// Certification periods per journal (data/tci_tier_history.csv): [start year, end year, กลุ่ม]. The
// site reads the กลุ่ม of the year a work was published from these (Tum's decision, 2026-11-08:
// follow TCI's own coverage, as the Scopus quartiles follow CiteScore years). A journal that
// holds no กลุ่ม today but did in the past is kept for that reason, with tier ''.
const thFile = join(ROOT, 'data/tci_tier_history.csv')
const periodsById = new Map()
if (existsSync(thFile)) {
  for (const h of toRecords(parseCsv(read(thFile)), ['journal_id', 'tier', 'start_date', 'end_date'], 'tci_tier_history.csv')) {
    if (!['1', '2', '3'].includes(h.tier)) continue
    const y0 = Number(h.start_date.slice(0, 4))
    const y1 = Number(h.end_date.slice(0, 4))
    // TCI's own data has the odd reversed period (e.g. 2026-01-01 to 2025-12-31): skip it, keep building.
    if (!Number.isInteger(y0) || !Number.isInteger(y1) || y1 < y0) { warn(`tci_tier_history.csv line ${h._line}: bad dates ${h.start_date}–${h.end_date}; row skipped`); continue }
    if (!periodsById.has(h.journal_id)) periodsById.set(h.journal_id, [])
    periodsById.get(h.journal_id).push([y0, y1, h.tier])
  }
  for (const v of periodsById.values()) v.sort((a, b) => a[0] - b[0])
}
const tciFile = join(ROOT, 'data/tci_journals.csv')
const tci = existsSync(tciFile)
  ? toRecords(parseCsv(read(tciFile)), ['id', 'name_eng', 'name_local', 'issn', 'eissn', 'tci_tier', 'status'], 'tci_journals.csv')
      .filter((j) => ['1', '2', '3'].includes(j.tci_tier) || periodsById.has(j.id))
      .map((j) => ({ nameEng: j.name_eng, nameLocal: j.name_local, abbrev: j.abbrev_name ?? '', issn: j.issn, eissn: j.eissn, tier: ['1', '2', '3'].includes(j.tci_tier) ? j.tci_tier : '', status: j.status, periods: periodsById.get(j.id) ?? [] }))
  : []
if (tci.length && !periodsById.size) warn('data/tci_tier_history.csv missing or empty: TCI กลุ่ม cannot follow the publication year; the current กลุ่ม is used')
if (!tci.length) warn('data/tci_journals.csv missing or empty: national journals cannot be matched to TCI')

// Journals known to be indexed in Scopus (data/scopus_journals.csv), by ISSN.
const sjFile = join(ROOT, 'data/scopus_journals.csv')
const scopusJournals = existsSync(sjFile)
  ? toRecords(parseCsv(read(sjFile)), ['issn', 'in_scopus', 'name'], 'scopus_journals.csv')
      .filter((j) => j.in_scopus === 'yes')
      .map((j) => ({ issn: j.issn, name: j.name }))
  : []

// CiteScore quartiles per Scopus journal and year (data/scopus_quartiles.csv, scripts/fetch-sources.mjs),
// complete CiteScore years only, for the "แยกตามคุณภาพผลงาน" chart view (2026-11-08).
const sqFile = join(ROOT, 'data/scopus_quartiles.csv')
const quartiles = existsSync(sqFile)
  ? toRecords(parseCsv(read(sqFile)), ['issn', 'year', 'status', 'quartile'], 'scopus_quartiles.csv')
      .filter((q) => q.status === 'Complete' && /^Q[1-4]$/.test(q.quartile) && /^\d{4}$/.test(q.year))
      .map((q) => [q.issn, Number(q.year), Number(q.quartile[1])])
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

/** When each source last really answered (data/status/<name>.txt, written by the fetch scripts
 *  only on success). null = no stamp: never fetched here, or the file is not a readable time. */
function freshness() {
  const one = (name) => {
    const f = join(ROOT, 'data/status', `${name}.txt`)
    if (!existsSync(f)) return null
    const t = read(f).trim()
    return Number.isNaN(Date.parse(t)) ? null : t
  }
  return { scopus: one('scopus'), openalex: one('openalex'), tci: one('tci'), scholar: one('scholar'), forms: one('forms'), crossref: one('crossref') }
}

mkdirSync(dirname(CONFIG.out), { recursive: true })
writeFileSync(
  CONFIG.out,
  JSON.stringify({ builtAt: new Date().toISOString(), freshness: freshness(), newWorks: newWorks(ROOT), sources: publicSources(), faculty, publications, overrides, tci, scopusJournals, conferences, conferenceScreening, formCancelled: [...formCancelled], crossref, programmes, quartiles }, null, 1),
)
log(`${faculty.length} lecturers, ${publications.length} publication rows, ${overrides.length} overrides, ${tci.length} TCI journals, ${scopusJournals.length} Scopus journals, ${conferences.length} conferences (screening ${conferenceScreening}), ${crossref.length} Crossref records (${biblioOverrides.length} hand overrides), ${programmes.length} programmes, ${quartiles.length} journal-year quartiles -> src/generated/data.json`)
