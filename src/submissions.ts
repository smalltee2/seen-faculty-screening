// Works that lecturers add themselves on "ตรวจสอบคุณสมบัติของฉัน" (2026-11-07). They are kept in
// the private login sheet by the Apps Script backend; the site reads the public list (no
// e-mail addresses). Pending works are shown but not counted; approved ones (approved by a
// level-2 admin) are counted like works from the admin form. The hourly data job also copies
// approved works into data/self.tsv (scripts/fetch-sources.mjs), so they survive in the build.
import { api } from './emailLogin'
import { normalizeTitle, preparePubs } from './classify'
import type { ConferenceEntry, Pub, RawPub } from './types'

export type SubmissionStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn'
export type WorkType = 'journal' | 'proceeding' | 'poster'

export interface Submission {
  id: string
  nameEn: string
  year: number
  title: string
  authors: string
  type: WorkType
  venue: string
  volume: string
  doi: string
  research: boolean
  created: string
  status: SubmissionStatus
  decidedAt: string
  note: string
}

export const STATUS_TH: Record<SubmissionStatus, string> = {
  pending: 'รออนุมัติ',
  approved: 'อนุมัติแล้ว',
  rejected: 'ไม่อนุมัติ',
  withdrawn: 'ถอนแล้ว',
}
export const TYPE_TH: Record<WorkType, string> = {
  journal: 'บทความวารสาร',
  proceeding: 'บทความฉบับสมบูรณ์ในงานประชุม (proceedings)',
  poster: 'โปสเตอร์/บทคัดย่อในงานประชุม',
}

/** The public list; null when the backend is not set up or could not be read (so a caller that
 *  already has a list keeps it instead of showing every work as gone). */
export async function fetchSubmissions(): Promise<Submission[] | null> {
  try {
    const r = await api({ action: 'list' })
    return r.ok && Array.isArray(r.items) ? (r.items as Submission[]) : null
  } catch {
    return null
  }
}

const bareDoi = (v: string) => {
  const d = v
    .trim()
    .replace(/^(https?:\/\/)?(dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
  return /^10\.\d{4,}\//.test(d) ? d : ''
}

/** Submission marker kept in RawPub.submitted, so a work is never counted twice. */
export const submittedTag = (id: string) => `self:${id}`

/** One submission as a publication row (same shape as manual-form rows). */
export function submissionRow(s: Submission, i = 0): RawPub {
  return {
    line: i + 1,
    source: 'manual' as const,
    key: s.nameEn,
    year: s.year,
    title: s.title,
    authors: s.authors,
    venue: `${[s.venue, s.volume].filter(Boolean).join(' ')}, ${s.year}`,
    cites: 0,
    doi: bareDoi(s.doi),
    issn: '',
    extType: s.type,
    manualResearch: s.research,
    submitted: submittedTag(s.id),
    live: true,
  }
}

/** Approved works as publication rows, skipping any already in the bundle. */
export function approvedRows(items: Submission[], lecturers: Set<string>, bundled: RawPub[]): RawPub[] {
  const inBundle = new Set(bundled.map((p) => p.submitted).filter(Boolean))
  return items.filter((s) => s.status === 'approved' && lecturers.has(s.nameEn) && !inBundle.has(submittedTag(s.id))).map(submissionRow)
}

/** Bundled rows (data/self.tsv) without the works a level-2 admin has since withdrawn or rejected
 *  on the person page (Tum, 2026-11-07): the hourly job drops them from the file, but the build
 *  in the browser may be older than the decision. A work the backend no longer lists is kept. */
export function dropUnapproved(bundled: RawPub[], items: Submission[]): RawPub[] {
  const status = new Map(items.map((s) => [submittedTag(s.id), s.status]))
  return bundled.filter((p) => {
    const st = p.submitted ? status.get(p.submitted) : undefined
    return st === undefined || st === 'approved'
  })
}

/** The approved self-added submission behind a work, when the level-2 admin may withdraw it. */
export function selfSubmission(pub: { submitted?: string }, items: Submission[]): Submission | null {
  if (!pub.submitted?.startsWith('self:')) return null
  const s = items.find((x) => submittedTag(x.id) === pub.submitted)
  return s && s.status === 'approved' ? s : null
}

/** Each live (pending or approved) conference work classified on its own, with its conference
 *  check, so the register and the approval table can show it before it is approved. */
export function conferenceSubmissions(items: Submission[], conferences: ConferenceEntry[]): { sub: Submission; pub: Pub }[] {
  return items
    .filter((s) => (s.status === 'pending' || s.status === 'approved') && (s.type === 'proceeding' || s.type === 'poster'))
    .map((s) => ({ sub: s, pub: preparePubs([submissionRow(s)], [], conferences)[0] }))
    .filter((x): x is { sub: Submission; pub: Pub } => !!x.pub)
}

/** A work the lecturer is about to add that is already in the system (Tum, 2026-11-08: two works
 *  cannot share a title, so a matching title or DOI is the same work and is not sent again). */
export interface Duplicate {
  title: string
  year: number | null
  /** 'system' = in the lecturer's works from any source; 'pending' / 'approved' = their own submission. */
  kind: 'system' | 'pending' | 'approved'
  sources: string[]
}

const SOURCE_TH: Record<string, string> = { scopus: 'Scopus', openalex: 'OpenAlex', scholar: 'Google Scholar', manual: 'ผลงานที่เพิ่มเองหรือแบบฟอร์มผู้ดูแล' }

export function findDuplicate(work: { title: string; doi: string }, pubs: Pick<Pub, 'title' | 'year' | 'doi' | 'sources'>[], mine: Submission[]): Duplicate | null {
  const t = normalizeTitle(work.title)
  const d = bareDoi(work.doi).toLowerCase()
  if (t.length < 8 && !d) return null
  // Scholar cuts long titles with "…": a stored cut title matches a full title that starts with it.
  const same = (title: string, doi?: string) => {
    if (d && doi && bareDoi(doi).toLowerCase() === d) return true
    const k = normalizeTitle(title)
    if (!k || t.length < 8) return false
    return k === t || (/(…|\.\.\.)\s*$/.test(title) && k.length >= 20 && t.startsWith(k))
  }
  const own = mine.find((s) => (s.status === 'pending' || s.status === 'approved') && same(s.title, s.doi))
  if (own) return { title: own.title, year: own.year, kind: own.status === 'pending' ? 'pending' : 'approved', sources: [] }
  const p = pubs.find((x) => same(x.title, x.doi))
  if (p) return { title: p.title, year: p.year, kind: 'system', sources: [...new Set(p.sources.map((s) => SOURCE_TH[s] ?? s))] }
  return null
}
