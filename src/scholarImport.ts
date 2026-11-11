// Google Scholar import by a level-2 admin (Tum, 2026-11-08). Scholar has no API and blocks
// automated access, so the admin copies a lecturer's list in their own browser with
// scripts/scholar_export_snippet.js and pastes it on the admin page. The site keeps only rows not
// yet in the system and sends them to the backend (Apps Script scholarImport); the public list
// (scholarList) is read live by the site and copied hourly into data/scholar_imports.tsv.
import { api } from './emailLogin'
import { normalizeTitle, truncatedStem } from './classify'
import type { Pub, RawPub } from './types'
import snippetSource from '../scripts/scholar_export_snippet.js?raw'

export interface ScholarRow {
  key: string
  year: number | null
  title: string
  authors: string
  venue: string
  cites: number
}

export interface ScholarImportItem extends Omit<ScholarRow, 'key'> {
  at: string
  nameEn: string
  by: string
  batch: string
}

/** The export snippet with the lecturer's name_en filled in (no prompt in the console). */
export const snippetFor = (nameEn: string) => snippetSource.replace("const PRESET_KEY = ''", `const PRESET_KEY = ${JSON.stringify(nameEn)}`)

/** Scholar profile list, newest first, 100 rows per page. */
export const scholarUrl = (scholarId: string) => `https://scholar.google.com/citations?user=${encodeURIComponent(scholarId)}&hl=en&pagesize=100&sortby=pubdate`

/** Rows pasted from the snippet: key, year, title, authors, venue, cites (tab-separated). A header
 *  row and blank lines are ignored; rows without a title or with a bad year are reported. */
export function parseScholarTsv(text: string): { rows: ScholarRow[]; bad: number } {
  const rows: ScholarRow[] = []
  let bad = 0
  for (const line of text.replace(/\r/g, '').split('\n')) {
    if (!line.trim()) continue
    const c = line.split('\t').map((x) => x.trim())
    if (c[0] === 'key' && c[2] === 'title') continue
    // Scholar writes 0 for a work without a year.
    const year = c[1] && c[1] !== '0' ? Number(c[1]) : null
    if (c.length < 6 || !c[2] || (year !== null && !(Number.isInteger(year) && year >= 1900 && year <= 2100))) {
      bad++
      continue
    }
    rows.push({ key: c[0], year, title: c[2], authors: c[3], venue: c[4], cites: Number(c[5]) || 0 })
  }
  return { rows, bad }
}

/** Pasted rows not yet in the system for that lecturer (same normalised title as any source, or
 *  repeated in the paste). */
export function newScholarRows(rows: ScholarRow[], nameEn: string, pubs: Pick<Pub, 'key' | 'title'>[]): ScholarRow[] {
  const mine = pubs.filter((p) => p.key === nameEn)
  const seen = new Set(mine.map((p) => normalizeTitle(p.title)))
  // Known titles that Scholar cut with "…": a pasted full title that starts with one is the same work.
  const stems = mine.map((p) => truncatedStem(p.title)).filter((s): s is string => s !== null)
  return rows.filter((r) => {
    const k = normalizeTitle(r.title)
    if (!k || seen.has(k)) return false
    if (stems.some((s) => k.startsWith(s))) return false
    // Scholar cuts long titles with "…": a cut title matches any known title that starts with it.
    if (/(…|\.\.\.)\s*$/.test(r.title) && k.length >= 20 && [...seen].some((t) => t.startsWith(k))) return false
    seen.add(k)
    const stem = truncatedStem(r.title)
    if (stem) stems.push(stem)
    return true
  })
}

/** The public list; [] when the backend is not set up or unreachable. */
export async function fetchScholarImports(): Promise<ScholarImportItem[] | null> {
  try {
    const r = await api({ action: 'scholarList' })
    return r.ok && Array.isArray(r.items) ? (r.items as ScholarImportItem[]) : null
  } catch {
    return null
  }
}

export const scholarTag = (batch: string) => `scholar:${batch}`

/** Imported rows as publication rows (source scholar), skipping batches already in the build. */
export function scholarImportRows(items: ScholarImportItem[], lecturers: Set<string>, bundled: RawPub[]): RawPub[] {
  const inBundle = new Set(bundled.map((p) => p.submitted).filter(Boolean))
  return items
    .filter((s) => lecturers.has(s.nameEn) && !inBundle.has(scholarTag(s.batch)))
    .map((s, i) => ({ line: i + 1, source: 'scholar' as const, key: s.nameEn, year: s.year, title: s.title, authors: s.authors, venue: s.venue, cites: s.cites, submitted: scholarTag(s.batch), live: true }))
}

/** Bundled rows from data/scholar_imports.tsv whose import was undone after the build. Only when
 *  the live list was read (null = backend unreachable, keep everything). */
export function dropRemovedScholar(bundled: RawPub[], items: ScholarImportItem[] | null): RawPub[] {
  if (!items) return bundled
  const live = new Set(items.map((s) => scholarTag(s.batch)))
  return bundled.filter((p) => !p.submitted?.startsWith('scholar:') || live.has(p.submitted))
}

/** "อัปเดตจาก Google Scholar" job (Apps Script scholarRequest / scholarJob; run by the iMac job). */
export interface ScholarJob {
  at: string
  by: string
  status: 'requested' | 'running' | 'done' | 'blocked' | 'failed'
  progress: string
  message: string
  updated: string
}

export async function fetchScholarJob(): Promise<ScholarJob | null> {
  try {
    const r = await api({ action: 'scholarJob' })
    return r.ok ? ((r as { job?: ScholarJob | null }).job ?? null) : null
  } catch {
    return null
  }
}
