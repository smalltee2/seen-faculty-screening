// Daily data refresh, run by GitHub Actions (and by hand with `npm run fetch`).
//   1. OpenAlex: works of every lecturer with an openalex_id in data/faculty.csv
//      -> data/openalex.tsv
//   2. Scopus (Elsevier Search API): works of every lecturer with a scopus_id, or found
//      by name + University of Phayao affiliation -> data/scopus.tsv. The API key is
//      read from the SCOPUS_API_KEY environment variable (a GitHub Actions secret);
//      it is never written to the repository. Without a key this step is skipped.
//   3. Admin Google Form: the response sheet published as CSV (URL in data/sources.json)
//      -> data/manual.tsv
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
      if (res.status === 401 || res.status === 403) throw Object.assign(new Error(`HTTP ${res.status} (key not accepted from this network?)`), { fatal: true })
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

const OA_HEADER = ['key', 'year', 'title', 'authors', 'venue', 'cites', 'doi', 'oa_type', 'source_type', 'oa_id']

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

const SC_HEADER = ['key', 'year', 'title', 'authors', 'venue', 'cites', 'doi', 'sc_type', 'source_type', 'eid', 'scopus_author_id']

async function scopusGet(url, key) {
  return getJson(url, 3, { 'X-ELS-APIKey': key, Accept: 'application/json' })
}

/** Scopus author ID from faculty.csv, or a unique name match at University of Phayao. */
async function scopusAuthorId(f, key) {
  if (f.scopus_id) return f.scopus_id
  const parts = f.name_en.split(' ')
  const q = `AUTHLASTNAME(${parts.slice(1).join(' ')}) AND AUTHFIRST(${parts[0]}) AND AFFIL(Phayao)`
  const d = await scopusGet(`https://api.elsevier.com/content/search/author?query=${encodeURIComponent(q)}&count=5`, key)
  const hits = d['search-results']?.entry?.filter((e) => e['dc:identifier']) ?? []
  if (hits.length !== 1) {
    warn(`${f.name_en}: Scopus author search found ${hits.length} matches; add scopus_id to faculty.csv`)
    return ''
  }
  const id = hits[0]['dc:identifier'].replace('AUTHOR_ID:', '')
  log(`${f.name_en}: Scopus author ${id} (found by name; add it to faculty.csv scopus_id to pin it)`)
  return id
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
      const aid = await scopusAuthorId(f, key)
      if (!aid) {
        out.push(...previous.filter((r) => r.key === f.name_en))
        continue
      }
      const rows = []
      for (let start = 0; ; start += 25) {
        const q = `AU-ID(${aid}) AND PUBYEAR > ${CONFIG.firstYear - 1}`
        const d = await scopusGet(`https://api.elsevier.com/content/search/scopus?query=${encodeURIComponent(q)}&count=25&start=${start}`, key)
        const entries = (d['search-results']?.entry ?? []).filter((e) => e['dc:title'])
        for (const e of entries) {
          const year = Number(String(e['prism:coverDate'] ?? '').slice(0, 4))
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
          })
        }
        const total = Number(d['search-results']?.['opensearch:totalResults'] ?? 0)
        if (start + 25 >= total || !entries.length) break
        await sleep(200)
      }
      out.push(...rows)
      ok++
      log(`${f.name_en}: ${rows.length} Scopus documents`)
    } catch (e) {
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
const MANUAL_HEADER = ['key', 'year', 'title', 'authors', 'venue', 'cites', 'doi', 'type', 'is_research', 'submitted']

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
  const header = rows[0].map((h) => h.trim())
  const missing = Object.values(FORM).filter((h) => !header.includes(h))
  if (missing.length) {
    warn(`Google Sheet is missing column(s): ${missing.join(', ')}; data/manual.tsv left unchanged`)
    return
  }
  const col = (r, k) => clean(r[header.indexOf(FORM[k])])
  const names = new Set(faculty.map((f) => f.name_en))
  const out = []
  for (const [i, r] of rows.slice(1).entries()) {
    const key = col(r, 'key')
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
      type,
      is_research: col(r, 'research').startsWith('ใช่') ? 'yes' : 'no',
      submitted: col(r, 'timestamp'),
    })
  }
  writeTsv(CONFIG.manualOut, MANUAL_HEADER, out)
  log(`Google Sheet: ${out.length} rows -> data/manual.tsv`)
}

const faculty = (() => {
  const rows = parseCsv(readFileSync(CONFIG.faculty, 'utf8'))
  const h = rows[0].map((x) => x.trim())
  return rows.slice(1).map((r) => Object.fromEntries(h.map((k, i) => [k, (r[i] ?? '').trim()])))
})()
const sources = existsSync(CONFIG.sources) ? JSON.parse(readFileSync(CONFIG.sources, 'utf8')) : {}

await fetchOpenAlex(faculty)
await fetchScopus(faculty, process.env.SCOPUS_API_KEY ?? '')
await fetchManual(faculty, sources.manualSheetCsvUrl ?? '')
