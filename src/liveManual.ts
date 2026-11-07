// Live rows from the admin Google Form: the site reads the form's published responses
// sheet (CSV, CORS-enabled by Google) when it loads, so a work added through the form
// shows up within minutes instead of after the 03:00 import. The nightly run still
// writes the same rows to data/manual.tsv; rows already in the bundle are skipped here.
// The column titles and the mapping mirror fetchManual in scripts/fetch-sources.mjs.
import type { Faculty, RawPub } from './types'

/** RFC 4180-style CSV parser (same behaviour as scripts/csv.mjs). */
export function parseCsv(text: string): string[][] {
  text = text.replace(/^﻿/, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"' && field === '') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (quoted) throw new Error('unterminated quoted field')
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''))
}

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
} as const
const TYPE_MAP: Record<string, string> = {
  'บทความวารสาร (journal)': 'journal',
  'บทความฉบับสมบูรณ์ในงานประชุม (proceedings)': 'proceeding',
  'โปสเตอร์/บทคัดย่อในงานประชุม (poster)': 'poster',
}

const bareDoi = (v: string) => {
  const d = v.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
  return /^10\.\d{4,}\//.test(d) ? d : ''
}

/** Rows of the responses sheet as RawPub, in the same shape build-data.mjs gives manual.tsv rows. */
export function manualRowsFromCsv(text: string, faculty: Faculty[]): RawPub[] {
  const rows = parseCsv(text)
  if (rows.length < 2) return []
  const header = rows[0].map((h) => (h.trim() === 'ประทับเวลา' ? 'Timestamp' : h.trim()))
  if (Object.values(FORM).some((h) => !header.includes(h))) return []
  const col = (r: string[], f: keyof typeof FORM) => (r[header.indexOf(FORM[f])] ?? '').trim()
  const names = new Set(faculty.map((f) => f.nameEn))
  const out: RawPub[] = []
  rows.slice(1).forEach((r, i) => {
    const key = col(r, 'key').match(/\(([^()]+)\)\s*$/)?.[1].trim() ?? col(r, 'key')
    const type = Object.hasOwn(TYPE_MAP, col(r, 'type')) ? TYPE_MAP[col(r, 'type')] : undefined
    const year = Number(col(r, 'year'))
    if (!names.has(key) || !type || !Number.isInteger(year) || year < 1900 || year > 2100 || !col(r, 'title')) return // a blank year is Number('') = 0
    const venue = [col(r, 'venue'), col(r, 'volume')].filter(Boolean).join(' ')
    out.push({
      line: i + 2,
      source: 'manual',
      key,
      year,
      title: col(r, 'title'),
      authors: col(r, 'authors'),
      venue: `${venue}, ${year}`,
      cites: 0,
      doi: bareDoi(col(r, 'doi')),
      issn: '',
      extType: type,
      manualResearch: col(r, 'research').startsWith('ใช่'),
      submitted: col(r, 'timestamp'),
      live: true,
    })
  })
  return out
}

/** Live rows not yet in the bundle (same lecturer, title and submission time). */
export function newLiveRows(live: RawPub[], bundled: RawPub[]): RawPub[] {
  const norm = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase() // the nightly import collapses whitespace too
  const seen = new Set(bundled.filter((p) => (p.source ?? 'scholar') === 'manual').map((p) => `${p.key}|${norm(p.title)}|${p.submitted ?? ''}`))
  return live.filter((p) => !seen.has(`${p.key}|${norm(p.title)}|${p.submitted ?? ''}`))
}

/** Fetches the published responses sheet; [] when offline, on file://, or when anything fails. */
export async function fetchLiveManual(url: string | undefined, faculty: Faculty[], bundled: RawPub[]): Promise<RawPub[]> {
  if (!url || window.location.protocol === 'file:') return []
  try {
    const res = await fetch(`${url}&t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return []
    return newLiveRows(manualRowsFromCsv(await res.text(), faculty), bundled)
  } catch {
    return []
  }
}
