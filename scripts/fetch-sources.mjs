// Daily data refresh, run by GitHub Actions (and by hand with `npm run fetch`).
//   1. OpenAlex: works of every lecturer's author record(s) (openalex_id in data/faculty.csv), plus
//      works whose author is written exactly as the lecturer's English or Thai name (scripts/name-match.mjs)
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
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCsv } from './csv.mjs'
import { lecturerNames, namedOn } from './name-match.mjs'
import { tciAuthorMatch, tciRow } from './tci-articles.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
/** The calendar year in Thailand (UTC+7). The daily run is at 20:00 UTC, which is already the next
 *  day there, so the runner's own year is one behind on 31 December. */
function thaiYear() {
  return new Date(Date.now() + 7 * 3600000).getUTCFullYear()
}
/** Sort key for a time written as text; an unreadable time sorts first. */
const whenMs = (at) => {
  const t = Date.parse(String(at ?? ''))
  return Number.isNaN(t) ? 0 : t
}
const TIMEOUT_MS = 60000
const CONFIG = {
  faculty: join(ROOT, 'data/faculty.csv'),
  sources: join(ROOT, 'data/sources.json'),
  openalexOut: join(ROOT, 'data/openalex.tsv'),
  scopusOut: join(ROOT, 'data/scopus.tsv'),
  statusDir: join(ROOT, 'data/status'),
  manualOut: join(ROOT, 'data/manual.tsv'),
  selfOut: join(ROOT, 'data/self.tsv'),
  tciOut: join(ROOT, 'data/tci_journals.csv'),
  tciArticlesOut: join(ROOT, 'data/tci_articles.tsv'),
  tciSearch: 'https://search.tci-thailand.org/php/search',
  // One file per calendar year with the list as last seen in that year, so a journal's
  // กลุ่ม at the time an article appeared can be looked up later (stored, not displayed yet).
  tciSnapshotDir: join(ROOT, 'data/tci_snapshots'),
  // Per-round กลุ่ม of every TCI journal (tier, start_date, end_date) from the journal record
  // endpoint; authoritative for "กลุ่ม ณ ปีที่ตีพิมพ์". Stored, not displayed yet (Tum, 2026-11-06).
  tciHistoryOut: join(ROOT, 'data/tci_tier_history.csv'),
  tciInfoUrl: 'https://tci-thailand.org/backend/journal/get_journal_info',
  scopusJournalsOut: join(ROOT, 'data/scopus_journals.csv'),
  scopusQuartilesOut: join(ROOT, 'data/scopus_quartiles.csv'),
  // Bibliographic details per DOI from Crossref (issue, pages, article number, publication date)
  // for the Scopus-style CSV export; cached, only new DOIs are looked up (Tum, 2026-11-07).
  crossrefOut: join(ROOT, 'data/crossref.tsv'),
  crossrefMailto: 'teerachai.am@up.ac.th',
  tciUrl: 'https://tci-thailand.org/backend/journal/list_all_journal',
  firstYear: thaiYear() - 11, // ten years for the chart plus one
  userAgent: 'seen-faculty-screening (https://github.com/smalltee2/seen-faculty-screening)',
}
const log = (m) => console.log(`[fetch] ${m}`)
const warn = (m) => console.warn(`[fetch] WARNING: ${m}`)
const clean = (s) => String(s ?? '').replace(/[\t\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
/** Crossref returns some names HTML-escaped ("Air Quality, Atmosphere &amp; Health"). */
const unescapeHtml = (s) => String(s ?? '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
/** Records that a source really answered in this run (data/status/<name>.txt, one ISO time).
 *  The site shows it as "ข้อมูลล่าสุด" per source and the backend's daily check e-mails the
 *  admin when a stamp is more than 2 days old (apps-script/Code.gs, checkFreshness). A run that
 *  only kept the previous rows writes no stamp. */
function stamp(name) {
  mkdirSync(CONFIG.statusDir, { recursive: true })
  writeFileSync(join(CONFIG.statusDir, `${name}.txt`), `${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}\n`)
}

async function getJson(url, tries = 3, headers = {}) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': CONFIG.userAgent, ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS) })
      if (res.status === 401 || res.status === 403) {
        // Elsevier explains the refusal in the body (invalid key, no entitlement from this IP, …).
        const body = (await res.text()).replace(/\s+/g, ' ').slice(0, 300)
        throw Object.assign(new Error(`HTTP ${res.status}: ${body}`), { fatal: true })
      }
      // The same request gets the same answer for these, so asking again only wastes time.
      if ([400, 404, 410].includes(res.status)) throw Object.assign(new Error(`HTTP ${res.status}`), { noRetry: true })
      // A used-up allowance (OpenAlex answers 429 with the hours to wait): asking again does not help.
      if (res.status === 429 && Number(res.headers.get('retry-after')) > 60) throw Object.assign(new Error(`HTTP 429 (allowance used up; retry after ${res.headers.get('retry-after')} s)`), { noRetry: true })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (e) {
      if (e.fatal || e.noRetry || i >= tries) throw e
      await sleep(1500 * i)
    }
  }
}

function readTsv(path) {
  if (!existsSync(path)) return { header: [], rows: [] }
  const lines = readFileSync(path, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim())
  const header = lines[0]?.split('\t') ?? []
  // Cells beyond the header (a stray tab in a line) are dropped; missing ones read as ''.
  return { header, rows: lines.slice(1).map((l) => { const cells = l.split('\t'); return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ''])) }) }
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

// Optional: a free OpenAlex API key raises the daily allowance (https://openalex.org; GitHub secret OPENALEX_API_KEY).
const OA_KEY = process.env.OPENALEX_API_KEY ? `&api_key=${encodeURIComponent(process.env.OPENALEX_API_KEY)}` : ''

async function fetchOpenAlex(faculty) {
  const previous = readTsv(CONFIG.openalexOut).rows
  const out = []
  let ok = 0
  let tried = 0
  const SELECT = 'id,doi,display_name,publication_year,type,primary_location,biblio,authorships,cited_by_count'
  /** Every work matching an OpenAlex filter (all pages). */
  const worksOf = async (filter) => {
    const found = []
    let cursor = '*'
    while (cursor) {
      const d = await getJson(`https://api.openalex.org/works?filter=${filter},publication_year:>${CONFIG.firstYear - 1}&select=${SELECT}&per-page=200&cursor=${encodeURIComponent(cursor)}${OA_KEY}`)
      found.push(...d.results)
      cursor = d.meta?.next_cursor && d.results.length ? d.meta.next_cursor : null
      await sleep(150)
    }
    return found
  }
  // OpenAlex charges a search ten times a plain request against a daily allowance (HTTP 429 once it
  // is used up). The name search is therefore the part that may be skipped: when it fails, the rows
  // an earlier run found by name are kept, and the rest of this run does not ask again.
  let nameSearchOff = ''
  for (const f of faculty) {
    const ids = openalexIds(f)
    const names = lecturerNames(f)
    if (!ids.length && !names.length) continue
    tried++
    try {
      // 1. Works of the lecturer's author record(s). 2. Works whose author is written exactly as the
      // lecturer's English or Thai name, whatever record OpenAlex filed them under (Tum, 2026-11-12).
      const works = new Map()
      if (ids.length) for (const w of await worksOf(`author.id:${ids.join('|')}`)) works.set(w.id, w)
      let byName = 0
      const named = []
      if (!nameSearchOff) {
        try {
          for (const name of names) {
            for (const w of await worksOf(`raw_author_name.search:${encodeURIComponent(`"${name.replace(/"/g, '')}"`)}`)) if (namedOn(w, [name])) named.push(w)
          }
        } catch (e) {
          nameSearchOff = e.message
          warn(`OpenAlex name search stopped for this run (${e.message}); rows found by name earlier are kept`)
        }
      }
      for (const w of named) {
        if (works.has(w.id)) continue
        works.set(w.id, w)
        byName++
      }
      // Rows of an earlier run that the author record(s) no longer give: found by name then.
      const keptByName = nameSearchOff ? previous.filter((r) => r.key === f.name_en && !works.has(`https://openalex.org/${r.oa_id}`)) : []
      if (!ids.length && nameSearchOff && !keptByName.length) throw new Error(`no author record and no name search (${nameSearchOff})`)
      const rows = [...keptByName]
      for (const w of works.values()) {
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
      // An answer with no works for a lecturer who had some is treated as a failed request:
      // writing it would silently drop every OpenAlex row of that lecturer.
      const before = previous.filter((r) => r.key === f.name_en)
      if (!rows.length && before.length) {
        out.push(...before)
        warn(`${f.name_en}: OpenAlex returned no works; kept ${before.length} previous rows`)
        continue
      }
      out.push(...rows)
      ok++
      log(`${f.name_en}: ${rows.length} works${byName ? ` (${byName} found by name only)` : ''}${keptByName.length ? ` (${keptByName.length} kept from an earlier name search)` : ''}`)
    } catch (e) {
      const kept = previous.filter((r) => r.key === f.name_en)
      out.push(...kept)
      warn(`${f.name_en}: OpenAlex request failed (${e.message}); kept ${kept.length} previous rows`)
    }
  }
  if (tried && !ok) throw new Error('every OpenAlex request failed; data/openalex.tsv left unchanged')
  out.sort((a, b) => a.key.localeCompare(b.key) || b.year - a.year || String(a.oa_id ?? '').localeCompare(String(b.oa_id ?? '')))
  writeTsv(CONFIG.openalexOut, OA_HEADER, out)
  if (ok) stamp('openalex')
  log(`OpenAlex: ${out.length} rows for ${ok}/${tried} lecturers -> data/openalex.tsv`)
}

// cover_date … article_number (2026-11-07) feed the Scopus-style CSV export; rows fetched earlier leave them empty.
const SC_HEADER = ['key', 'year', 'title', 'authors', 'venue', 'cites', 'doi', 'sc_type', 'source_type', 'eid', 'scopus_author_id', 'issn', 'cover_date', 'volume', 'issue', 'page_range', 'article_number']

async function scopusGet(url, key) {
  const headers = { 'X-ELS-APIKey': key, Accept: 'application/json' }
  // An institutional token lets the key work outside the university network.
  if (process.env.SCOPUS_INSTTOKEN) headers['X-ELS-Insttoken'] = process.env.SCOPUS_INSTTOKEN
  return getJson(url, 3, headers)
}

/** A lecturer's OpenAlex author IDs. OpenAlex sometimes keeps one person under several records
 *  (a spelling variant of the surname gets its own), so faculty.csv may list more than one in
 *  openalex_id, separated by ";", the main record first (Tum, 2026-11-12). */
function openalexIds(f) {
  const ids = String(f.openalex_id ?? '').split(/[;|\s]+/).map((x) => x.trim().split('/').pop()).filter(Boolean)
  for (const id of ids) if (!/^A\d+$/.test(id)) throw new Error(`${f.name_en}: openalex_id "${id}" is not an OpenAlex author ID (A followed by digits)`)
  return ids
}

/** Scopus query for one lecturer. The key is not entitled to Elsevier's Author Search
 *  (AUTHORIZATION_ERROR), so the Scopus author ID comes from faculty.csv (scopus_id) or
 *  from the lecturer's OpenAlex record; without one, search by name + Phayao affiliation. */
async function scopusQuery(f) {
  let id = f.scopus_id
  if (!id && f.openalex_id) {
    try {
      const a = await getJson(`https://api.openalex.org/authors/${openalexIds(f)[0]}?select=ids`)
      id = String(a.ids?.scopus ?? '').match(/authorID=(\d+)/)?.[1] ?? ''
    } catch (e) {
      // Not answered is not the same as "has no Scopus ID": the name query can return another set of
      // documents, which would replace this lecturer's rows. Fail, so the previous rows are kept.
      throw new Error(`OpenAlex author lookup for the Scopus ID failed (${e.message})`)
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
        const raw = (d['search-results']?.entry ?? []).filter((e) => !e.error)
        const entries = raw.filter((e) => e['dc:title'])
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
            cover_date: e['prism:coverDate'] ?? '',
            volume: e['prism:volume'] ?? '',
            issue: e['prism:issueIdentifier'] ?? '',
            page_range: e['prism:pageRange'] ?? '',
            article_number: e['article-number'] ?? '',
          })
        }
        const total = Number(d['search-results']?.['opensearch:totalResults'] ?? 0)
        // A page with nothing on it before the end is a cut answer: fail, so the previous rows are kept
        // instead of a shorter list.
        if (!raw.length && total > start) throw new Error(`Scopus returned an empty page at ${start} of ${total}`)
        if (start + 25 >= total || !raw.length) break
        await sleep(200)
      }
      // Same guard as OpenAlex: an empty answer never replaces rows already on file.
      const before = previous.filter((r) => r.key === f.name_en)
      if (!rows.length && before.length) {
        out.push(...before)
        warn(`${f.name_en}: Scopus returned no documents; kept ${before.length} previous rows`)
        continue
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
  if (ok) stamp('scopus')
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

/** "https://doi.org/10.x/y" or "10.x/y" → "10.x/y"; anything else → '' (the form field also accepts URLs). */
const bareDoi = (v) => {
  const d = String(v ?? '').trim().replace(/^(https?:\/\/)?(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '')
  return /^10\.\d{4,}\//.test(d) ? d : ''
}

// Conference decisions form (second Google Form, published responses sheet). Question titles must match.
const DECISION_FORM = {
  timestamp: 'Timestamp',
  email: 'Email Address',
  key: 'รหัสงานประชุม (key)',
  decision: 'ผลการตัดสิน',
  name: 'ชื่องานประชุม (ถ้ายังไม่มีในทะเบียน)',
  association: 'สมาคมที่จัดหรือร่วมจัด',
  note: 'เหตุผล / หลักฐาน (URL)',
}
const DECISION_MAP = { 'นับ (count)': 'count', 'ไม่นับ (no_count)': 'no_count', 'ยกเลิกการตัดสิน (ใช้ผลอัตโนมัติ)': '' }
const CONF_COLS = ['key', 'display_name', 'conference_name', 'organiser', 'association', 'association_role', 'field', 'related_field', 'confidence', 'evidence_url', 'checked_at', 'checked_by', 'note', 'decision', 'decided_by', 'decided_at', 'decision_note']

function readRegister(path) {
  if (!existsSync(path)) return []
  const rows = parseCsv(readFileSync(path, 'utf8'))
  if (!rows.length) return [] // header-less or empty file: start a new register
  const header = rows[0].map((h) => h.trim())
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])))
}
const csvField = (v) => (/[",\r\n]/.test(v ?? '') ? `"${String(v).replace(/"/g, '""')}"` : (v ?? ''))
function writeRegister(path, entries) {
  const lines = [CONF_COLS.join(','), ...entries.sort((a, b) => a.key.localeCompare(b.key)).map((e) => CONF_COLS.map((c) => csvField(e[c])).join(','))]
  writeFileSync(path, lines.join('\n') + '\n')
}

/** Merge admin decisions from the published sheet into data/conferences.csv.
 *  The latest submission per key wins; a key not yet in the register gets a new row. */
async function fetchDecisions(url, admins = []) {
  if (!url) {
    log('Decisions sheet: DECISION_SHEET_CSV_URL not set (form retired); skipped')
    return
  }
  let text
  try {
    if (url.startsWith('/')) text = readFileSync(url, 'utf8') // local file (tests)
    else {
      const res = await fetch(url, { headers: { 'User-Agent': CONFIG.userAgent }, signal: AbortSignal.timeout(TIMEOUT_MS) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      text = await res.text()
    }
  } catch (e) {
    warn(`Decisions sheet fetch failed (${e.message}); data/conferences.csv left unchanged`)
    return
  }
  let rows
  try {
    rows = parseCsv(text)
  } catch (e) {
    warn(`Decisions sheet response is not CSV (${e.message}); data/conferences.csv left unchanged`)
    return
  }
  if (!rows.length) {
    log('Decisions sheet: no responses yet')
    return
  }
  const header = rows[0].map((h) => (h.trim() === 'ประทับเวลา' ? 'Timestamp' : h.trim() === 'ที่อยู่อีเมล' ? 'Email Address' : h.trim()))
  const missing = Object.values(DECISION_FORM).filter((h) => !header.includes(h))
  if (missing.length) {
    warn(`Decisions sheet is missing column(s): ${missing.join(', ')}; data/conferences.csv left unchanged`)
    return
  }
  const col = (r, f) => (r[header.indexOf(DECISION_FORM[f])] ?? '').trim()
  const registerPath = join(ROOT, 'data/conferences.csv')
  const register = readRegister(registerPath)
  let applied = 0
  const skipped = []
  for (const r of rows.slice(1)) {
    const key = col(r, 'key')
    const decisionLabel = col(r, 'decision')
    if (!key || !(Object.hasOwn(DECISION_MAP, decisionLabel))) {
      skipped.push(key || '(no key)')
      continue
    }
    const decision = DECISION_MAP[decisionLabel]
    const by = col(r, 'email') || 'admin form'
    // Only listed admins may decide: DECISION_ADMINS env (GitHub secret, comma-separated e-mails), so
    // the addresses never sit in the public repo. No list = nothing is applied (fail closed).
    if (!admins.length || !admins.map((x) => x.toLowerCase()).includes(by.toLowerCase())) {
      skipped.push(`${key} (${by} not in DECISION_ADMINS)`)
      continue
    }
    const at = col(r, 'timestamp')
    const note = col(r, 'note')
    let e = register.find((x) => x.key === key)
    if (!e) {
      // A conference the automatic check has not seen yet: the admin creates it.
      e = Object.fromEntries(CONF_COLS.map((c) => [c, '']))
      Object.assign(e, { key, display_name: col(r, 'name') || key, conference_name: col(r, 'name'), association: col(r, 'association'), association_role: 'unknown', related_field: 'unknown', confidence: 'low', checked_at: at, checked_by: 'admin form (no automatic check)' })
      register.push(e)
    } else if (col(r, 'association') && !e.association) e.association = col(r, 'association')
    // Responses are in submission order, so a later row for the same key overrides an earlier one.
    Object.assign(e, { decision, decided_by: by, decided_at: at, decision_note: note })
    applied++
  }
  writeRegister(registerPath, register)
  log(`Decisions sheet: ${applied} decision(s) applied to data/conferences.csv${skipped.length ? `; skipped ${skipped.length} row(s) (no key, invalid decision, or sender not in DECISION_ADMINS): ${skipped.slice(0, 5).join(', ')}` : ''}`)
}

/** Conference decisions from the register buttons (login backend, action confList; 2026-11-07,
 *  replaces the decision form). The backend already checked who pressed (level-2 approval key or a
 *  listed admin); the latest press per key wins, "clear" empties the decision. */
async function fetchConfDecisions(loginApiUrl) {
  if (!loginApiUrl) return
  let items
  try {
    const res = await fetch(loginApiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'confList' }), redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) })
    const js = await res.json()
    if (!js.ok || !Array.isArray(js.items)) throw new Error(js.error ?? 'no items')
    items = js.items
  } catch (e) {
    warn(`Conference decisions: could not read the list (${e.message}); data/conferences.csv left unchanged`)
    return
  }
  if (!items.length) {
    log('Conference decisions (buttons): none yet')
    return
  }
  const registerPath = join(ROOT, 'data/conferences.csv')
  const register = readRegister(registerPath)
  const latest = new Map()
  for (const it of [...items].sort((a, b) => whenMs(a.at) - whenMs(b.at))) {
    const key = String(it.key ?? '').trim() // register keys are trimmed on read
    if (/^(venue|work):/.test(key) && ['count', 'no_count', 'clear'].includes(it.decision)) latest.set(key, { ...it, key })
  }
  let applied = 0
  for (const it of latest.values()) {
    let e = register.find((x) => x.key === it.key)
    if (!e) {
      if (it.decision === 'clear') continue
      e = Object.fromEntries(CONF_COLS.map((c) => [c, '']))
      Object.assign(e, { key: it.key, display_name: clean(it.name) || it.key, conference_name: clean(it.name), association_role: 'unknown', related_field: 'unknown', confidence: 'low', checked_at: it.at, checked_by: 'admin (no automatic check)' })
      register.push(e)
    }
    if (it.decision === 'clear') Object.assign(e, { decision: '', decided_by: '', decided_at: '', decision_note: '' })
    else Object.assign(e, { decision: it.decision, decided_by: clean(it.by), decided_at: it.at, decision_note: clean(it.note) })
    applied++
  }
  writeRegister(registerPath, register)
  log(`Conference decisions (buttons): ${applied} applied to data/conferences.csv`)
}

async function fetchManual(faculty, url) {
  if (!url) {
    log('Google Sheet: no manualSheetCsvUrl in data/sources.json; skipped')
    if (!existsSync(CONFIG.manualOut)) writeTsv(CONFIG.manualOut, MANUAL_HEADER, [])
    return
  }
  let text
  try {
    const res = await fetch(url, { headers: { 'User-Agent': CONFIG.userAgent }, signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    text = await res.text()
  } catch (e) {
    warn(`Google Sheet fetch failed (${e.message}); data/manual.tsv left unchanged`)
    return
  }
  let rows
  try {
    rows = parseCsv(text)
  } catch (e) {
    warn(`Google Sheet response is not CSV (${e.message}); data/manual.tsv left unchanged`)
    return
  }
  if (!rows.length) {
    warn('Google Sheet returned no rows (empty body); data/manual.tsv left unchanged')
    return
  }
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
    const type = Object.hasOwn(TYPE_MAP, col(r, 'type')) ? TYPE_MAP[col(r, 'type')] : undefined
    const year = Number(col(r, 'year'))
    if (!names.has(key) || !type || !Number.isInteger(year) || year < 1900 || year > 2100 || !col(r, 'title')) {
      warn(`Google Sheet row ${i + 2} skipped: lecturer, type, year (must be ค.ศ. 1900–2100) or title is missing or not recognised`)
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
      doi: bareDoi(col(r, 'doi')),
      issn: '',
      type,
      is_research: col(r, 'research').startsWith('ใช่') ? 'yes' : 'no',
      submitted: col(r, 'timestamp'),
    })
  }
  const previousManual = readTsv(CONFIG.manualOut).rows
  // A sheet that parses but matches nothing (renamed dropdown option, year format) must not
  // empty the file: the hourly job would commit an empty manual.tsv and every form work would vanish.
  // The same holds for a sheet that comes back with its header only while the file has works.
  if (!out.length && (rows.length > 1 || previousManual.length)) {
    warn(`Google Sheet: ${rows.length - 1} rows, none usable; data/manual.tsv left unchanged (${previousManual.length} rows kept)`)
    return
  }
  for (const r of out) r.issn = await issnByDoi(r.doi, previousManual)
  writeTsv(CONFIG.manualOut, MANUAL_HEADER, out)
  stamp('forms') // hourly, so this stamp is not committed (.gitignore); the build carries it in status.json
  log(`Google Sheet: ${out.length} rows (${out.filter((r) => r.issn).length} with ISSN from DOI) -> data/manual.tsv`)
}

/** Works lecturers added themselves on "ตรวจสอบคุณสมบัติของฉัน" and a level-2 admin approved
 *  (Apps Script backend, action "list"). Written to data/self.tsv in the manual.tsv format, with
 *  submitted = self:<id> so the browser does not count them twice. On any error the file is kept. */
async function fetchSelf(faculty, loginApiUrl) {
  if (!loginApiUrl) {
    log('Self-added works: no loginApiUrl in data/sources.json; skipped')
    return
  }
  let items
  try {
    const res = await fetch(loginApiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'list' }), redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) })
    const js = await res.json()
    if (!js.ok || !Array.isArray(js.items)) throw new Error(js.error ?? 'no items')
    items = js.items
  } catch (e) {
    warn(`Self-added works: could not read the list (${e.message}); data/self.tsv left unchanged`)
    return
  }
  // The backend answers an empty list when its sheet is missing or renamed; that must not empty the file.
  if (!items.length && existsSync(CONFIG.selfOut) && readTsv(CONFIG.selfOut).rows.length) {
    warn('Self-added works: the backend returned an empty list; data/self.tsv left unchanged')
    return
  }
  const names = new Set(faculty.map((f) => f.name_en))
  const out = items
    .filter((s) => s.status === 'approved' && names.has(s.nameEn) && ['journal', 'proceeding', 'poster'].includes(s.type) && Number.isInteger(s.year) && s.title)
    .map((s) => ({
      key: s.nameEn,
      year: s.year,
      title: clean(s.title),
      authors: clean(s.authors),
      venue: `${[clean(s.venue), clean(s.volume)].filter(Boolean).join(' ')}, ${s.year}`,
      cites: 0,
      doi: bareDoi(s.doi ?? ''),
      type: s.type,
      is_research: s.research ? 'yes' : 'no',
      submitted: `self:${s.id}`,
      issn: '',
    }))
  const previous = existsSync(CONFIG.selfOut) ? readTsv(CONFIG.selfOut).rows : []
  for (const r of out) r.issn = await issnByDoi(r.doi, previous)
  writeTsv(CONFIG.selfOut, MANUAL_HEADER, out)
  log(`Self-added works: ${out.length} approved of ${items.length} -> data/self.tsv`)
}

/** Google Scholar rows imported by a level-2 admin on the admin page (Apps Script scholarList),
 *  written to data/scholar_imports.tsv so they survive in the build. The file is rewritten from the
 *  list each run, so an undone import disappears; if the list cannot be read, the file is kept. */
const SCHI_HEADER = ['key', 'year', 'title', 'authors', 'venue', 'cites', 'batch']
async function fetchScholarImports(faculty, loginApiUrl) {
  if (!loginApiUrl) return log('Scholar imports: no loginApiUrl in data/sources.json; skipped')
  let items
  try {
    const res = await fetch(loginApiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'scholarList' }), redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) })
    const js = await res.json()
    if (!js.ok || !Array.isArray(js.items)) throw new Error(js.error ?? 'no items')
    items = js.items
  } catch (e) {
    warn(`Scholar imports: could not read the list (${e.message}); data/scholar_imports.tsv left unchanged`)
    return
  }
  const names = new Set(faculty.map((f) => f.name_en))
  const out = items
    .filter((s) => names.has(s.nameEn) && s.title && /^b[0-9a-f]{9}$/.test(s.batch ?? ''))
    .map((s) => ({ key: s.nameEn, year: Number.isInteger(s.year) ? s.year : '', title: clean(s.title), authors: clean(s.authors), venue: clean(s.venue), cites: Number(s.cites) || 0, batch: s.batch }))
  writeTsv(join(ROOT, 'data/scholar_imports.tsv'), SCHI_HEADER, out)
  log(`Scholar imports: ${out.length} rows -> data/scholar_imports.tsv`)
}

/** Admin-form works a level-2 admin cancelled on the site (Apps Script formCancelList; the latest
 *  press per lecturer + title wins). Only the ones still cancelled are written to
 *  data/form_cancels.tsv; build-data.mjs drops those rows of manual.tsv. */
async function fetchFormCancels(loginApiUrl) {
  if (!loginApiUrl) return log('Form cancels: no loginApiUrl in data/sources.json; skipped')
  let items
  try {
    const res = await fetch(loginApiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'formCancelList' }), redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) })
    const js = await res.json()
    if (!js.ok || !Array.isArray(js.items)) throw new Error(js.error ?? 'no items')
    items = js.items
  } catch (e) {
    warn(`Form cancels: could not read the list (${e.message}); data/form_cancels.tsv left unchanged`)
    return
  }
  const cancelsPath = join(ROOT, 'data/form_cancels.tsv')
  // Every press is kept by the backend, so an empty list after cancels exist means the sheet was not read.
  if (!items.length && existsSync(cancelsPath) && readTsv(cancelsPath).rows.length) {
    warn('Form cancels: the backend returned an empty list; data/form_cancels.tsv left unchanged')
    return
  }
  const latest = new Map()
  for (const it of [...items].sort((a, b) => whenMs(a.at) - whenMs(b.at))) if (it.nameEn && it.titleNorm) latest.set(`${it.nameEn}|${it.titleNorm}`, it)
  const out = [...latest.values()].filter((it) => it.action === 'cancel').map((it) => ({ name_en: it.nameEn, title_norm: it.titleNorm, title: clean(it.title), at: it.at, by: clean(it.by) }))
  writeTsv(join(ROOT, 'data/form_cancels.tsv'), ['name_en', 'title_norm', 'title', 'at', 'by'], out)
  log(`Form cancels: ${out.length} cancelled -> data/form_cancels.tsv`)
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
  const SJ_HEADER = ['issn', 'in_scopus', 'name', 'checked']
  const prev = existsSync(CONFIG.scopusJournalsOut) ? parseCsv(readFileSync(CONFIG.scopusJournalsOut, 'utf8')) : []
  const header = prev.length ? prev[0].map((h) => h.trim()) : SJ_HEADER // an empty file starts a new cache
  const missingCols = SJ_HEADER.filter((h) => !header.includes(h))
  if (missingCols.length) throw new Error(`data/scopus_journals.csv has no column ${missingCols.join(', ')}`)
  let rows = prev.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])))
  // A journal Scopus did not list is asked again after 30 days, so one that Scopus adds later is
  // found; "yes" stays.
  const recheck = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const known = new Set(rows.filter((r) => r.in_scopus === 'yes' || r.checked >= recheck).map((r) => r.issn))
  const seen = new Set()
  for (const f of [CONFIG.openalexOut, CONFIG.scopusOut]) for (const r of readTsv(f).rows) for (const i of (r.issn ?? '').split(';')) if (i) seen.add(i.trim())
  const todo = [...seen].filter((i) => !known.has(i))
  let added = 0
  for (const issn of todo) {
    try {
      const d = await scopusGet(`https://api.elsevier.com/content/search/scopus?query=${encodeURIComponent(`ISSN(${issn})`)}&count=1`, key)
      const total = Number(d['search-results']?.['opensearch:totalResults'] ?? 0)
      const name = d['search-results']?.entry?.[0]?.['prism:publicationName'] ?? ''
      rows = rows.filter((r) => r.issn !== issn) // the old "no" of a journal asked again
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
  log(`Scopus journals: ${rows.length} ISSNs cached (${added} asked), ${rows.filter((r) => r.in_scopus === 'yes').length} in Scopus -> data/scopus_journals.csv`)
}

/** CiteScore quartiles (Tum, 2026-11-08: "แยกตามคุณภาพผลงาน" chart view). For every journal in
 *  scopus_journals.csv that Scopus indexes, the Serial Title API (view=CITESCORE) gives, per
 *  CiteScore year, the journal's percentile in each of its subject areas. The quartile is taken
 *  from the best percentile: >= 75 Q1, >= 50 Q2, >= 25 Q3, else Q4 (Scopus' own CiteScore
 *  quartile rule). One row per ISSN and year in data/scopus_quartiles.csv; ISSNs already in the
 *  file are skipped unless --refresh-quartiles is given. */
const SQ_HEADER = ['issn', 'year', 'status', 'best_percentile', 'quartile', 'checked']
const quartileOf = (pct) => (pct >= 75 ? 'Q1' : pct >= 50 ? 'Q2' : pct >= 25 ? 'Q3' : 'Q4')
async function fetchScopusQuartiles(key, refresh) {
  if (!key) return log('Scopus quartiles: no SCOPUS_API_KEY; skipped')
  if (!existsSync(CONFIG.scopusJournalsOut)) return log('Scopus quartiles: no data/scopus_journals.csv yet; skipped')
  const sj = parseCsv(readFileSync(CONFIG.scopusJournalsOut, 'utf8'))
  const issns = sj.slice(1).filter((r) => r[sj[0].indexOf('in_scopus')] === 'yes').map((r) => r[sj[0].indexOf('issn')])
  // --refresh-quartiles asks every journal again; a journal whose request fails keeps its old rows.
  const prev = existsSync(CONFIG.scopusQuartilesOut) ? parseCsv(readFileSync(CONFIG.scopusQuartilesOut, 'utf8')).slice(1) : []
  const rows = prev.map((r) => Object.fromEntries(SQ_HEADER.map((h, i) => [h, r[i] ?? ''])))
  // Journals that had no CiteScore last time are asked again every run (Tum, 2026-11-08), so a
  // journal that Scopus rates later gets its quartiles without a manual refresh.
  const none = new Set(rows.filter((r) => r.status === 'none').map((r) => r.issn))
  const today = new Date().toISOString().slice(0, 10)
  // A journal is also asked again when its newest complete CiteScore year is older than last year
  // (a new year is published around mid-year) and it was last checked more than 30 days ago, so
  // later years arrive by themselves without asking Scopus about every journal every night.
  const lastYear = thaiYear() - 1
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const newest = new Map()
  const checked = new Map()
  for (const r of rows) {
    if (r.status === 'Complete') newest.set(r.issn, Math.max(newest.get(r.issn) ?? 0, Number(r.year)))
    if (r.checked > (checked.get(r.issn) ?? '')) checked.set(r.issn, r.checked)
  }
  const stale = new Set([...newest].filter(([i, y]) => y < lastYear && (checked.get(i) ?? '') < cutoff).map(([i]) => i))
  const done = new Set(refresh ? [] : rows.filter((r) => r.status !== 'none' && !stale.has(r.issn)).map((r) => r.issn))
  let ok = 0
  let failed = 0
  for (const issn of [...new Set(issns)].filter((i) => i && !done.has(i))) {
    try {
      const d = await scopusGet(`https://api.elsevier.com/content/serial/title/issn/${encodeURIComponent(issn)}?view=CITESCORE`, key)
      const e = d['serial-metadata-response']?.entry?.[0] ?? {}
      // Elsevier returns one year as an object, several as an array.
      // Drop the journal's old rows (the "none" marker, or every year of a stale journal) before adding the fresh ones.
      for (let i = rows.length - 1; i >= 0; i--) if (rows[i].issn === issn) rows.splice(i, 1)
      const years = [].concat(e.citeScoreYearInfoList?.citeScoreYearInfo ?? [])
      let n = 0
      for (const y of years) {
        const infos = [].concat(y.citeScoreInformationList ?? []).flatMap((l) => [].concat(l.citeScoreInfo ?? []))
        const pcts = infos.flatMap((i) => [].concat(i.citeScoreSubjectRank ?? [])).map((r) => Number(r.percentile)).filter(Number.isFinite)
        if (!pcts.length) continue
        const best = Math.max(...pcts)
        rows.push({ issn, year: y['@year'] ?? '', status: y['@status'] ?? '', best_percentile: String(best), quartile: quartileOf(best), checked: today })
        n++
      }
      // Drop last time's "none" marker; it is written again below only if there is still no CiteScore.
      if (!n) rows.push({ issn, year: '', status: 'none', best_percentile: '', quartile: '', checked: today })
      ok++
      await sleep(150)
    } catch (err) {
      failed++
      warn(`Scopus quartiles: ISSN ${issn} failed (${err.message})`)
      if (err.fatal) break
    }
  }
  rows.sort((a, b) => a.issn.localeCompare(b.issn) || a.year.localeCompare(b.year))
  writeFileSync(CONFIG.scopusQuartilesOut, [SQ_HEADER.join(','), ...rows.map((r) => SQ_HEADER.map((h) => csvCell(r[h])).join(','))].join('\n') + '\n')
  log(`Scopus quartiles: ${ok} journals fetched, ${failed} failed, ${new Set(rows.map((r) => r.issn)).size} journals in data/scopus_quartiles.csv`)
}

/** data/tci_tier_history.csv: one row per (journal, certification period). Journals already
 *  in the file are skipped unless --refresh-history is given, so the nightly run only adds
 *  new journals; a full refresh is about 1,700 requests. */
async function fetchTciHistory(refresh) {
  const journals = existsSync(CONFIG.tciOut) ? parseCsv(readFileSync(CONFIG.tciOut, 'utf8')) : []
  if (journals.length < 2) return log('TCI history: no data/tci_journals.csv yet; skipped')
  const jh = journals[0]
  const ids = journals.slice(1).map((r) => r[jh.indexOf('id')]).filter(Boolean)
  const header = ['journal_id', 'tier', 'start_date', 'end_date', 'category', 'fetched']
  // --refresh-history asks every journal again; a journal whose request fails keeps its old rows.
  const prev = existsSync(CONFIG.tciHistoryOut) ? parseCsv(readFileSync(CONFIG.tciHistoryOut, 'utf8')).slice(1) : []
  const rows = prev.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])))
  const today = new Date().toISOString().slice(0, 10)
  // A journal that had no certification round when it was asked is asked again after 30 days.
  const recheck = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const done = new Set(refresh ? [] : rows.filter((r) => r.tier !== '' || r.fetched >= recheck).map((r) => r.journal_id))
  const todo = [...new Set(ids)].filter((id) => !done.has(id))
  let ok = 0
  let failed = 0
  const worker = async () => {
    for (;;) {
      const id = todo.shift()
      if (id === undefined) return
      try {
        const res = await fetch(CONFIG.tciInfoUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': CONFIG.userAgent }, body: JSON.stringify({ journal_id: Number(id) }), signal: AbortSignal.timeout(90000) })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const d = await res.json()
        const hist = Array.isArray(d.tci_tier_history) ? d.tci_tier_history : []
        for (let i = rows.length - 1; i >= 0; i--) if (rows[i].journal_id === id) rows.splice(i, 1) // replaced by this answer
        if (!hist.length) rows.push({ journal_id: id, tier: '', start_date: '', end_date: '', category: '', fetched: today })
        for (const h of hist) rows.push({ journal_id: id, tier: h.tier ?? '', start_date: h.start_date ?? '', end_date: h.end_date ?? '', category: h.journal_catetory ?? h.journal_category ?? '', fetched: today })
        ok++
      } catch (e) {
        failed++
        if (failed <= 5) warn(`TCI history: journal ${id} failed (${e.message})`)
      }
      await sleep(200)
    }
  }
  await Promise.all([worker(), worker(), worker()])
  rows.sort((a, b) => Number(a.journal_id) - Number(b.journal_id) || (a.start_date < b.start_date ? 1 : a.start_date > b.start_date ? -1 : 0))
  writeFileSync(CONFIG.tciHistoryOut, [header.join(','), ...rows.map((r) => header.map((h) => csvCell(r[h])).join(','))].join('\n') + '\n')
  log(`TCI history: ${ok} journals fetched, ${failed} failed, ${new Set(rows.map((r) => r.journal_id)).size} journals in file -> data/tci_tier_history.csv`)
}

const csvCell = (v) => {
  const t = clean(v)
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}

const TA_HEADER = ['key', 'year', 'title', 'authors', 'venue', 'cites', 'tci_id', 'journal_id', 'issn', 'title_eng', 'title_loc']

/** Articles in TCI journals by the lecturer's name, English and Thai (scripts/tci-articles.mjs).
 *  Per lecturer: two searches, then one request per article not yet in the file to read its authors
 *  (and one more for its details when the name matches). A lecturer whose search fails keeps the
 *  rows of the last run. */
async function fetchTciArticles(faculty) {
  const previous = readTsv(CONFIG.tciArticlesOut).rows
  const journals = existsSync(CONFIG.tciOut) ? parseCsv(readFileSync(CONFIG.tciOut, 'utf8')) : []
  const jh = journals[0] ?? []
  const issnOf = new Map(journals.slice(1).map((r) => [r[jh.indexOf('id')], [r[jh.indexOf('issn')], r[jh.indexOf('eissn')]].filter(Boolean).join(';')]))
  // Titles the lecturer's rows in the other sources use, so the same form of the title is stored.
  const normTitle = (t) => String(t ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, '')
  const known = new Map()
  for (const file of [CONFIG.openalexOut, CONFIG.scopusOut, join(ROOT, 'data/publications.tsv'), join(ROOT, 'data/manual.tsv'), join(ROOT, 'data/self.tsv'), join(ROOT, 'data/scholar_imports.tsv')]) {
    for (const r of readTsv(file).rows) {
      if (!known.has(r.key)) known.set(r.key, new Set())
      known.get(r.key).add(normTitle(r.title))
    }
  }
  const text = async (url, init = {}) => {
    const res = await fetch(url, { ...init, headers: { 'User-Agent': CONFIG.userAgent, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return JSON.parse(await res.text())
  }
  const search = async (name) => {
    const body = new URLSearchParams()
    for (const [k, v] of [['cur_page', '1'], ['page_size', '100'], ['perform_advance_search', 'true'], ['keyword[]', name], ['criteria[]', 'author'], ['year_filter', ''], ['year_num', '10'], ['get_all_article_id', 'true']]) body.append(k, v)
    const d = await text(`${CONFIG.tciSearch}/advance_search.php`, { method: 'POST', body })
    return [...new Set([...(d.article_ids ?? []), ...(Array.isArray(d.all_article_id) ? d.all_article_id : [])].map(String))]
  }
  const out = []
  let ok = 0
  let tried = 0
  let added = 0
  for (const f of faculty) {
    const names = lecturerNames(f)
    if (!names.length) continue
    tried++
    const before = previous.filter((r) => r.key === f.name_en)
    try {
      const ids = new Set()
      for (const name of names) {
        for (const id of await search(name)) ids.add(id)
        await sleep(400)
      }
      const rows = []
      for (const id of ids) {
        const had = before.find((r) => r.tci_id === id)
        if (had) {
          rows.push(had)
          continue
        }
        const authors = await text(`${CONFIG.tciSearch}/author_info.php?article_id=${encodeURIComponent(id)}`)
        await sleep(300)
        if (!tciAuthorMatch(authors, f)) continue
        const info = await text(`${CONFIG.tciSearch}/search_result.php?get_article_info=true&article_id=${encodeURIComponent(id)}&search_keyword=`)
        await sleep(300)
        const row = tciRow(f, info[0] ?? {}, authors, issnOf.get(String(info[0]?.journal_id ?? '')) ?? '', known.get(f.name_en))
        if (row && row.year >= CONFIG.firstYear) {
          rows.push(row)
          added++
        }
      }
      out.push(...rows)
      ok++
      if (rows.length) log(`${f.name_en}: ${rows.length} TCI articles`)
    } catch (e) {
      out.push(...before)
      warn(`${f.name_en}: TCI article search failed (${e.message}); kept ${before.length} previous rows`)
    }
  }
  if (tried && !ok) throw new Error('every TCI article search failed; data/tci_articles.tsv left unchanged')
  out.sort((a, b) => a.key.localeCompare(b.key) || Number(b.year) - Number(a.year) || String(a.tci_id).localeCompare(String(b.tci_id)))
  writeTsv(CONFIG.tciArticlesOut, TA_HEADER, out)
  log(`TCI articles: ${out.length} rows (${added} new) for ${ok}/${tried} lecturers -> data/tci_articles.tsv`)
}

/** The TCI journal database: one POST returns every journal (about 1,700 rows). */
async function fetchTci() {
  const res = await fetch(CONFIG.tciUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': CONFIG.userAgent }, body: '{}', signal: AbortSignal.timeout(120000) })
  if (!res.ok) throw new Error(`TCI HTTP ${res.status}`)
  const d = await res.json()
  const js = Array.isArray(d.journals) ? d.journals : []
  if (js.length < 500) throw new Error(`TCI returned only ${js.length} journals; keeping the previous file`)
  const header = ['id', 'name_eng', 'name_local', 'abbrev_name', 'issn', 'eissn', 'tci_tier', 'status', 'main_area']
  const lines = js.map((j) => header.map((h) => csvCell(j[h])).join(','))
  const csv = [header.join(','), ...lines].join('\n') + '\n'
  writeFileSync(CONFIG.tciOut, csv)
  mkdirSync(CONFIG.tciSnapshotDir, { recursive: true })
  writeFileSync(join(CONFIG.tciSnapshotDir, `${thaiYear()}.csv`), csv)
  const tiers = js.reduce((m, j) => ((m[j.tci_tier] = (m[j.tci_tier] ?? 0) + 1), m), {})
  log(`TCI: ${js.length} journals (กลุ่ม 1: ${tiers['1'] ?? 0}, 2: ${tiers['2'] ?? 0}, 3: ${tiers['3'] ?? 0}) -> data/tci_journals.csv`)
}

const faculty = (() => {
  const rows = parseCsv(readFileSync(CONFIG.faculty, 'utf8'))
  const h = rows[0].map((x) => x.trim())
  return rows.slice(1).map((r) => Object.fromEntries(h.map((k, i) => [k, (r[i] ?? '').trim()])))
})()
const sources = existsSync(CONFIG.sources) ? JSON.parse(readFileSync(CONFIG.sources, 'utf8')) : {}

const CR_HEADER = ['doi', 'journal', 'volume', 'issue', 'page_start', 'page_end', 'article_number', 'published', 'published_online', 'fetched']

/** "2026-5-14" from Crossref date-parts; '' when absent. Year-month only when the day is missing. */
const crDate = (d) => {
  const p = d?.['date-parts']?.[0]
  return Array.isArray(p) && p[0] ? p.map((x, i) => (i === 0 ? String(x) : String(x).padStart(2, '0'))).join('-') : ''
}

/** Crossref record of every DOI in the publication files (issue, pages, article number, dates),
 *  for the Scopus-style CSV export. DOIs already in data/crossref.tsv are not asked again
 *  (--refresh-crossref re-asks them all); a failed lookup keeps the row empty for next time. */
async function fetchCrossref(refresh) {
  const dois = new Set()
  for (const f of [CONFIG.openalexOut, CONFIG.scopusOut, CONFIG.manualOut, CONFIG.selfOut]) for (const r of readTsv(f).rows) if (bareDoi(r.doi ?? '')) dois.add(bareDoi(r.doi).toLowerCase())
  const previous = readTsv(CONFIG.crossrefOut).rows
  const byDoi = new Map(previous.filter((r) => r.doi).map((r) => [r.doi.toLowerCase(), r]))
  const todo = [...dois].filter((d) => refresh || !byDoi.get(d)?.fetched)
  let ok = 0
  let failed = 0
  for (const doi of todo) {
    try {
      const js = await getJson(`https://api.crossref.org/works/${encodeURIComponent(doi)}?mailto=${CONFIG.crossrefMailto}`, 2)
      const m = js.message ?? {}
      const pages = String(m.page ?? '').split(/\s*[-–]\s*/)
      byDoi.set(doi, {
        doi,
        journal: clean(unescapeHtml(Array.isArray(m['container-title']) ? m['container-title'][0] : m['container-title'])),
        volume: clean(m.volume),
        issue: clean(m.issue),
        page_start: clean(pages[0]),
        page_end: clean(pages[1] ?? pages[0]),
        article_number: clean(m['article-number']),
        // Issue (print) date first, else the earliest the record gives; online date kept separately.
        published: crDate(m['published-print']) || crDate(m.issued) || crDate(m['published-online']),
        published_online: crDate(m['published-online']),
        fetched: new Date().toISOString().slice(0, 10),
      })
      ok++
    } catch (e) {
      failed++
      // A 404 means Crossref has no record (NRCT DOIs, figshare, zenodo): remember that and stop asking;
      // a network or 5xx error leaves fetched empty so the next run tries again.
      const final = /HTTP 404/.test(e.message)
      if (!byDoi.has(doi) || final) byDoi.set(doi, { doi, journal: '', volume: '', issue: '', page_start: '', page_end: '', article_number: '', published: '', published_online: '', fetched: final ? new Date().toISOString().slice(0, 10) : '' })
      if (failed <= 5) warn(`Crossref: ${doi}: ${e.message}`)
    }
    await sleep(120)
  }
  const out = [...byDoi.values()].filter((r) => dois.has(r.doi.toLowerCase())).sort((a, b) => a.doi.localeCompare(b.doi))
  writeTsv(CONFIG.crossrefOut, CR_HEADER, out)
  log(`Crossref: ${ok} fetched, ${failed} failed, ${out.length} DOIs in data/crossref.tsv`)
}

// --only=openalex|scopus|manual|decisions|tci|tciarticles|crossref runs one source (or several, comma-separated) (the iMac job runs --only=scopus).
// --only accepts a comma-separated list, e.g. --only=manual,decisions (the hourly forms run).
const only = (process.argv.find((a) => a.startsWith('--only='))?.split('=')[1] ?? '').split(',').map((x) => x.trim()).filter(Boolean)
const run = (name) => !only.length || only.includes(name)
// Scopus Search accepts the key from any network (only Author Search is refused), so both
// GitHub Actions and the iMac job (scripts/scopus-daily.sh) can update data/scopus.tsv.
const scopusHere = true

if (run('openalex')) await fetchOpenAlex(faculty)
if (run('scopus')) {
  if (scopusHere) {
    await fetchScopus(faculty, process.env.SCOPUS_API_KEY ?? '')
    await fetchScopusJournals(process.env.SCOPUS_API_KEY ?? '')
    await fetchScopusQuartiles(process.env.SCOPUS_API_KEY ?? '', process.argv.includes('--refresh-quartiles'))
  } else log('Scopus: updated by the iMac job (no SCOPUS_INSTTOKEN in GitHub Actions); skipped here')
}
if (only.includes('quartiles')) await fetchScopusQuartiles(process.env.SCOPUS_API_KEY ?? '', process.argv.includes('--refresh-quartiles'))
if (run('manual')) await fetchManual(faculty, sources.manualSheetCsvUrl ?? '')
if (run('manual') || run('self')) await fetchSelf(faculty, sources.loginApiUrl ?? '')
if (run('manual') || run('self') || run('scholar')) await fetchScholarImports(faculty, sources.loginApiUrl ?? '')
if (run('manual')) await fetchFormCancels(sources.loginApiUrl ?? '')
// Crossref runs after every file that can bring a new DOI (daily full run and the hourly forms run).
if (run('manual') || run('self') || run('crossref')) await fetchCrossref(process.argv.includes('--refresh-crossref'))
// The retired decision form's sheet (it holds respondents' e-mails) is read only from a secret, never from sources.json.
if (run('decisions')) await fetchDecisions(process.env.DECISION_SHEET_CSV_URL ?? '', (process.env.DECISION_ADMINS ?? '').split(',').map((x) => x.trim()).filter(Boolean))
// Button decisions run after the (retired) decision form, so a button press is the latest word.
if (run('decisions')) await fetchConfDecisions(sources.loginApiUrl ?? '')
if (run('tci')) {
  try {
    await fetchTci()
  } catch (e) {
    warn(`TCI: ${e.message}`)
  }
}
if (run('tci') || only.includes('tcihistory')) await fetchTciHistory(process.argv.includes('--refresh-history'))
// After the journal list (it gives the ISSNs) and the other sources (they give the titles already used).
if (run('tciarticles')) {
  try {
    await fetchTciArticles(faculty)
  } catch (e) {
    warn(`TCI articles: ${e.message}`)
  }
}
