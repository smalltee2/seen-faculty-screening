// Daily data refresh, run by GitHub Actions (and by hand with `npm run fetch`).
//   1. OpenAlex: works of every lecturer with an openalex_id in data/faculty.csv
//      -> data/openalex.tsv
//   2. Scopus (Elsevier Search API): works of every lecturer with a scopus_id, or found
//      by name + University of Phayao affiliation -> data/scopus.tsv. The API key is
//      read from the SCOPUS_API_KEY environment variable (a GitHub Actions secret);
//      it is never written to the repository. Without a key this step is skipped.
//   3. Admin Google Form: the response sheet published as CSV (URL in data/sources.json)
//      -> data/manual.tsv
//   4. TCI journal database (tci-thailand.org, the list behind its journal search):
//      every journal with ISSN, E-ISSN and กลุ่ม -> data/tci_journals.csv. National
//      journals are recognised by matching ISSN (OpenAlex/Scopus rows) or venue name.
// Google Scholar is not fetched: it has no API and blocks automated access. The
// Scholar export in data/publications.tsv is updated by hand with the console snippet.
//
// A failed request for one lecturer keeps that lecturer's previous rows, so one bad
// day never empties anyone's record. The script exits non-zero only if every
// OpenAlex request fails.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCsv } from './csv.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CONFIG = {
  faculty: join(ROOT, 'data/faculty.csv'),
  sources: join(ROOT, 'data/sources.json'),
  openalexOut: join(ROOT, 'data/openalex.tsv'),
  scopusOut: join(ROOT, 'data/scopus.tsv'),
  manualOut: join(ROOT, 'data/manual.tsv'),
  tciOut: join(ROOT, 'data/tci_journals.csv'),
  scopusJournalsOut: join(ROOT, 'data/scopus_journals.csv'),
  tciUrl: 'https://tci-thailand.org/backend/journal/list_all_journal',
  firstYear: new Date().getFullYear() - 11, // ten years for the chart plus one
  userAgent: 'seen-faculty-screening (https://github.com/smalltee2/seen-faculty-screening)',
}
const log = (m) => console.log(`[fetch] ${m}`)
const warn = (m) => console.warn(`[fetch] WARNING: ${m}`)
const clean = (s) => String(s ?? '').replace(/[\t\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getJson(url, tries = 3, headers = {}) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': CONFIG.userAgent, ...headers } })
      if (res.status === 401 || res.status === 403) {
        // Elsevier explains the refusal in the body (invalid key, no entitlement from this IP, …).
        const body = (await res.text()).replace(/\s+/g, ' ').slice(0, 300)
        throw Object.assign(new Error(`HTTP ${res.status}: ${body}`), { fatal: true })
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (e) {
      if (e.fatal || i >= tries) throw e
      await sleep(1500 * i)
    }
  }
}

function readTsv(path) {
  if (!existsSync(path)) return { header: [], rows: [] }
  const lines = readFileSync(path, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim())
  const header = lines[0]?.split('\t') ?? []
  return { header, rows: lines.slice(1).map((l) => Object.fromEntries(l.split('\t').map((v, i) => [header[i], v]))) }
}

function writeTsv(path, header, rows) {
  const body = rows.map((r) => header.map((h) => clean(r[h])).join('\t'))
  writeFileSync(path, [header.join('\t'), ...body].join('\n') + '\n')
}

/** Scholar-like venue string so the same classifier reads both sources. */
function venueOf(w) {
  const src = w.primary_location?.source?.display_name ?? ''
  const b = w.biblio ?? {}
  let v = src
  if (b.volume) v += ` ${b.volume}${b.issue ? ` (${b.issue})` : ''}`
  if (b.first_page) v += `, ${b.first_page}${b.last_page && b.last_page !== b.first_page ? `-${b.last_page}` : ''}`
  if (v && w.publication_year) v += `, ${w.publication_year}`
  return v
}

const OA_HEADER = ['key', 'year', 'title', 'authors', 'venue', 'cites', 'doi', 'oa_type', 'source_type', 'oa_id', 'issn']
/** ISSNs of a work's source, "issn_l;issn;…" (OpenAlex) — used to match the TCI list. */
const issnsOf = (src) => [...new Set([src?.issn_l, ...(src?.issn ?? [])].filter(Boolean))].join(';')

async function fetchOpenAlex(faculty) {
  const previous = readTsv(CONFIG.openalexOut).rows
  const out = []
  let ok = 0
  let tried = 0
  for (const f of faculty) {
    if (!f.openalex_id) continue
    tried++
    try {
      const rows = []
      let cursor = '*'
      while (cursor) {
        const url =
          `https://api.openalex.org/works?filter=author.id:${encodeURIComponent(f.openalex_id)},publication_year:>${CONFIG.firstYear - 1}` +
          `&select=id,doi,display_name,publication_year,type,primary_location,biblio,authorships,cited_by_count&per-page=200&cursor=${encodeURIComponent(cursor)}`
        const d = await getJson(url)
        for (const w of d.results) {
          if (!w.display_name || !w.publication_year) continue
          rows.push({
            key: f.name_en,
            year: w.publication_year,
            title: w.display_name,
            authors: w.authorships.slice(0, 6).map((a) => a.author?.display_name).filter(Boolean).join(', ') + (w.authorships.length > 6 ? ', ...' : ''),
            venue: venueOf(w),
            cites: w.cited_by_count ?? 0,
            doi: (w.doi ?? '').replace('https://doi.org/', ''),
            oa_type: w.type ?? '',
            source_type: w.primary_location?.source?.type ?? '',
            oa_id: w.id.split('/').pop(),
            issn: issnsOf(w.primary_location?.source),
          })
        }
        cursor = d.meta?.next_cursor && d.results.length ? d.meta.next_cursor : null
        await sleep(150)
      }
      out.push(...rows)
      ok++
      log(`${f.name_en}: ${rows.length} works`)
    } catch (e) {
      const kept = previous.filter((r) => r.key === f.name_en)
      out.push(...kept)
      warn(`${f.name_en}: OpenAlex request failed (${e.message}); kept ${kept.length} previous rows`)
    }
  }
  if (tried && !ok) throw new Error('every OpenAlex request failed; data/openalex.tsv left unchanged')
  out.sort((a, b) => a.key.localeCompare(b.key) || b.year - a.year || a.oa_id.localeCompare(b.oa_id))
  writeTsv(CONFIG.openalexOut, OA_HEADER, out)
  log(`OpenAlex: ${out.length} rows for ${ok}/${tried} lecturers -> data/openalex.tsv`)
}

const SC_HEADER = ['key', 'year', 'title', 'authors', 'venue', 'cites', 'doi', 'sc_type', 'source_type', 'eid', 'scopus_author_id', 'issn']

async function scopusGet(url, key) {
  const headers = { 'X-ELS-APIKey': key, Accept: 'application/json' }
  // An institutional token lets the key work outside the university network.
  if (process.env.SCOPUS_INSTTOKEN) headers['X-ELS-Insttoken'] = process.env.SCOPUS_INSTTOKEN
  return getJson(url, 3, headers)
}

/** Scopus query for one lecturer. The key is not entitled to Elsevier's Author Search
 *  (AUTHORIZATION_ERROR), so the Scopus author ID comes from faculty.csv (scopus_id) or
 *  from the lecturer's OpenAlex record; without one, search by name + Phayao affiliation. */
async function scopusQuery(f) {
  let id = f.scopus_id
  if (!id && f.openalex_id) {
    try {
      const a = await getJson(`https://api.openalex.org/authors/${encodeURIComponent(f.openalex_id)}?select=ids`)
      id = String(a.ids?.scopus ?? '').match(/authorID=(\d+)/)?.[1] ?? ''
    } catch {
      /* fall back to the name query */
    }
  }
  if (id) return { query: `AU-ID(${id})`, id }
  const parts = f.name_en.split(' ')
  // Scopus indexes first names as initials: AUTHFIRST(Teerachai) finds nothing, AUTHOR-NAME(Last, T) works.
  return { query: `AUTHOR-NAME(${parts.slice(1).join(' ')}, ${parts[0][0]}) AND AFFIL(Phayao)`, id: '' }
}

async function fetchScopus(faculty, key) {
  if (!key) {
    log('Scopus: SCOPUS_API_KEY not set; skipped')
    if (!existsSync(CONFIG.scopusOut)) writeTsv(CONFIG.scopusOut, SC_HEADER, [])
    return
  }
  const previous = readTsv(CONFIG.scopusOut).rows
  const out = []
  let ok = 0
  for (const f of faculty) {
    try {
      const { query, id: aid } = await scopusQuery(f)
      const rows = []
      for (let start = 0; ; start += 25) {
        const q = `${query} AND PUBYEAR > ${CONFIG.firstYear - 1}`
        const d = await scopusGet(`https://api.elsevier.com/content/search/scopus?query=${encodeURIComponent(q)}&count=25&start=${start}`, key)
        const entries = (d['search-results']?.entry ?? []).filter((e) => e['dc:title'])
        for (const e of entries) {
          const year = /^\d{4}/.test(String(e['prism:coverDate'] ?? '')) ? Number(String(e['prism:coverDate']).slice(0, 4)) : ''
          let venue = e['prism:publicationName'] ?? ''
          if (e['prism:volume']) venue += ` ${e['prism:volume']}${e['prism:issueIdentifier'] ? ` (${e['prism:issueIdentifier']})` : ''}`
          if (e['prism:pageRange']) venue += `, ${e['prism:pageRange']}`
          else if (e['article-number']) venue += `, ${e['article-number']}`
          if (venue && year) venue += `, ${year}`
          rows.push({
            key: f.name_en,
            year,
            title: e['dc:title'],
            authors: e['dc:creator'] ?? '',
            venue,
            cites: e['citedby-count'] ?? 0,
            doi: e['prism:doi'] ?? '',
            sc_type: e.subtypeDescription ?? '',
            source_type: e['prism:aggregationType'] ?? '',
            eid: e.eid ?? '',
            scopus_author_id: aid,
            issn: [e['prism:issn'], e['prism:eIssn']].filter(Boolean).join(';'),
          })
        }
        const total = Number(d['search-results']?.['opensearch:totalResults'] ?? 0)
        if (start + 25 >= total || !entries.length) break
        await sleep(200)
      }
      out.push(...rows)
      ok++
      log(`${f.name_en}: ${rows.length} Scopus documents (${aid ? `AU-ID ${aid}` : 'name + Phayao'})`)
    } catch (e) {
      if (e.fatal) {
        // The key itself was refused: the same answer would come for everyone, so stop here.
        warn(`Scopus refused the request (${e.message}). Kept all previous Scopus rows. From outside the university network Elsevier usually needs an institutional token (SCOPUS_INSTTOKEN secret).`)
        writeTsv(CONFIG.scopusOut, SC_HEADER, previous)
        return
      }
      const kept = previous.filter((r) => r.key === f.name_en)
      out.push(...kept)
      warn(`${f.name_en}: Scopus request failed (${e.message}); kept ${kept.length} previous rows`)
    }
  }
  out.sort((a, b) => a.key.localeCompare(b.key) || b.year - a.year || String(a.eid).localeCompare(String(b.eid)))
  writeTsv(CONFIG.scopusOut, SC_HEADER, out)
  log(`Scopus: ${out.length} rows, ${ok}/${faculty.length} lecturers fetched -> data/scopus.tsv`)
}

// Google Form question titles (must match the form exactly; see README).
const FORM = {
  timestamp: 'Timestamp',
  key: 'อาจารย์ (name_en)',
  year: 'ปีที่ตีพิมพ์ (ค.ศ.)',
  title: 'ชื่อผลงาน',
  authors: 'ผู้แต่ง',
  type: 'ประเภทผลงาน',
  venue: 'ชื่อวารสารหรืองานประชุม',
  volume: 'ปีที่/ฉบับที่/หน้า',
  doi: 'DOI หรือ URL',
  research: 'เป็นงานวิจัยหรือไม่',
}
const TYPE_MAP = { 'บทความวารสาร (journal)': 'journal', 'บทความฉบับสมบูรณ์ในงานประชุม (proceedings)': 'proceeding', 'โปสเตอร์/บทคัดย่อในงานประชุม (poster)': 'poster' }
const MANUAL_HEADER = ['key', 'year', 'title', 'authors', 'venue', 'cites', 'doi', 'type', 'is_research', 'submitted', 'issn']

/** ISSNs of a DOI's journal from OpenAlex, so admin-form rows get the same national /
 *  international check as fetched rows. Previous answers are reused; '' when unknown. */
async function issnByDoi(doi, previous) {
  const key = doi.trim().toLowerCase()
  if (!key) return ''
  const seen = previous.find((r) => (r.doi ?? '').trim().toLowerCase() === key && r.issn)
  if (seen) return seen.issn
  try {
    const w = await getJson(`https://api.openalex.org/works/https://doi.org/${encodeURIComponent(key)}?select=primary_location`)
    await sleep(150)
    return issnsOf(w.primary_location?.source)
  } catch {
    return ''
  }
}

async function fetchManual(faculty, url) {
  if (!url) {
    log('Google Sheet: no manualSheetCsvUrl in data/sources.json; skipped')
    if (!existsSync(CONFIG.manualOut)) writeTsv(CONFIG.manualOut, MANUAL_HEADER, [])
    return
  }
  let text
  try {
    const res = await fetch(url, { headers: { 'User-Agent': CONFIG.userAgent } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    text = await res.text()
  } catch (e) {
    warn(`Google Sheet fetch failed (${e.message}); data/manual.tsv left unchanged`)
    return
  }
  const rows = parseCsv(text)
  // A Thai-language Google account names the first column "ประทับเวลา" instead of "Timestamp".
  const header = rows[0].map((h) => (h.trim() === 'ประทับเวลา' ? 'Timestamp' : h.trim()))
  const missing = Object.values(FORM).filter((h) => !header.includes(h))
  if (missing.length) {
    warn(`Google Sheet is missing column(s): ${missing.join(', ')}; data/manual.tsv left unchanged`)
    return
  }
  const col = (r, k) => clean(r[header.indexOf(FORM[k])])
  const names = new Set(faculty.map((f) => f.name_en))
  const out = []
  for (const [i, r] of rows.slice(1).entries()) {
    // Dropdown options read "ชื่อไทย (English name)"; the English name in brackets is the key.
    const key = col(r, 'key').match(/\(([^()]+)\)\s*$/)?.[1].trim() ?? col(r, 'key')
    const type = TYPE_MAP[col(r, 'type')]
    const year = Number(col(r, 'year'))
    if (!names.has(key) || !type || !Number.isInteger(year) || !col(r, 'title')) {
      warn(`Google Sheet row ${i + 2} skipped: lecturer, type, year or title is missing or not recognised`)
      continue
    }
    const venue = [col(r, 'venue'), col(r, 'volume')].filter(Boolean).join(' ')
    out.push({
      key,
      year,
      title: col(r, 'title'),
      authors: col(r, 'authors'),
      venue: `${venue}, ${year}`,
      cites: 0,
      doi: col(r, 'doi'),
      issn: '',
      type,
      is_research: col(r, 'research').startsWith('ใช่') ? 'yes' : 'no',
      submitted: col(r, 'timestamp'),
    })
  }
  const previousManual = readTsv(CONFIG.manualOut).rows
  for (const r of out) r.issn = await issnByDoi(r.doi, previousManual)
  writeTsv(CONFIG.manualOut, MANUAL_HEADER, out)
  log(`Google Sheet: ${out.length} rows (${out.filter((r) => r.issn).length} with ISSN from DOI) -> data/manual.tsv`)
}

/** Journal-level Scopus coverage: for every ISSN seen in openalex.tsv / scopus.tsv, ask
 *  Scopus once whether the journal is indexed (ISSN(x) returns documents). Cached in
 *  data/scopus_journals.csv so a new article in a Scopus journal counts as international
 *  before Scopus itself has indexed it. Only ISSNs not yet in the cache are queried. */
async function fetchScopusJournals(key) {
  if (!key) {
    log('Scopus journals: no SCOPUS_API_KEY; skipped')
    return
  }
  const prev = existsSync(CONFIG.scopusJournalsOut) ? parseCsv(readFileSync(CONFIG.scopusJournalsOut, 'utf8')) : [['issn', 'in_scopus', 'name', 'checked']]
  const header = prev[0]
  const rows = prev.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])))
  const known = new Set(rows.map((r) => r.issn))
  const seen = new Set()
  for (const f of [CONFIG.openalexOut, CONFIG.scopusOut]) for (const r of readTsv(f).rows) for (const i of (r.issn ?? '').split(';')) if (i) seen.add(i.trim())
  const todo = [...seen].filter((i) => !known.has(i))
  let added = 0
  for (const issn of todo) {
    try {
      const d = await scopusGet(`https://api.elsevier.com/content/search/scopus?query=${encodeURIComponent(`ISSN(${issn})`)}&count=1`, key)
      const total = Number(d['search-results']?.['opensearch:totalResults'] ?? 0)
      const name = d['search-results']?.entry?.[0]?.['prism:publicationName'] ?? ''
      rows.push({ issn, in_scopus: total > 0 ? 'yes' : 'no', name, checked: new Date().toISOString().slice(0, 10) })
      added++
      await sleep(150)
    } catch (e) {
      warn(`Scopus journals: ISSN ${issn} failed (${e.message})`)
      if (e.fatal) break
    }
  }
  rows.sort((a, b) => a.issn.localeCompare(b.issn))
  writeFileSync(CONFIG.scopusJournalsOut, [header.join(','), ...rows.map((r) => header.map((h) => csvCell(r[h])).join(','))].join('\n') + '\n')
  log(`Scopus journals: ${rows.length} ISSNs cached (${added} new), ${rows.filter((r) => r.in_scopus === 'yes').length} in Scopus -> data/scopus_journals.csv`)
}

const csvCell = (v) => {
  const t = clean(v)
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}

/** The TCI journal database: one POST returns every journal (about 1,700 rows). */
async function fetchTci() {
  const res = await fetch(CONFIG.tciUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': CONFIG.userAgent }, body: '{}' })
  if (!res.ok) throw new Error(`TCI HTTP ${res.status}`)
  const d = await res.json()
  const js = Array.isArray(d.journals) ? d.journals : []
  if (js.length < 500) throw new Error(`TCI returned only ${js.length} journals; keeping the previous file`)
  const header = ['id', 'name_eng', 'name_local', 'abbrev_name', 'issn', 'eissn', 'tci_tier', 'status', 'main_area']
  const lines = js.map((j) => header.map((h) => csvCell(j[h])).join(','))
  writeFileSync(CONFIG.tciOut, [header.join(','), ...lines].join('\n') + '\n')
  const tiers = js.reduce((m, j) => ((m[j.tci_tier] = (m[j.tci_tier] ?? 0) + 1), m), {})
  log(`TCI: ${js.length} journals (กลุ่ม 1: ${tiers['1'] ?? 0}, 2: ${tiers['2'] ?? 0}, 3: ${tiers['3'] ?? 0}) -> data/tci_journals.csv`)
}

const faculty = (() => {
  const rows = parseCsv(readFileSync(CONFIG.faculty, 'utf8'))
  const h = rows[0].map((x) => x.trim())
  return rows.slice(1).map((r) => Object.fromEntries(h.map((k, i) => [k, (r[i] ?? '').trim()])))
})()
const sources = existsSync(CONFIG.sources) ? JSON.parse(readFileSync(CONFIG.sources, 'utf8')) : {}

// --only=openalex|scopus|manual|tci runs one source (the iMac job runs --only=scopus).
const only = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1] ?? ''
const run = (name) => !only || only === name
// Scopus Search accepts the key from any network (only Author Search is refused), so both
// GitHub Actions and the iMac job (scripts/scopus-daily.sh) can update data/scopus.tsv.
const scopusHere = true

if (run('openalex')) await fetchOpenAlex(faculty)
if (run('scopus')) {
  if (scopusHere) {
    await fetchScopus(faculty, process.env.SCOPUS_API_KEY ?? '')
    await fetchScopusJournals(process.env.SCOPUS_API_KEY ?? '')
  } else log('Scopus: updated by the iMac job (no SCOPUS_INSTTOKEN in GitHub Actions); skipped here')
}
if (run('manual')) await fetchManual(faculty, sources.manualSheetCsvUrl ?? '')
if (run('tci')) {
  try {
    await fetchTci()
  } catch (e) {
    warn(`TCI: ${e.message}`)
  }
}
