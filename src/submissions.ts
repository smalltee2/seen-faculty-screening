// Works that lecturers add themselves on "ตรวจสอบคุณสมบัติของฉัน" (2026-11-07). They are kept in
// the private login sheet by the Apps Script backend; the site reads the public list (no
// e-mail addresses). Pending works are shown but not counted; approved ones (approved by a
// level-2 admin) are counted like works from the admin form. The hourly data job also copies
// approved works into data/self.tsv (scripts/fetch-sources.mjs), so they survive in the build.
import { api } from './emailLogin'
import { preparePubs } from './classify'
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

/** The public list; [] when the backend is not set up or unreachable. */
export async function fetchSubmissions(): Promise<Submission[]> {
  try {
    const r = await api({ action: 'list' })
    return r.ok && Array.isArray(r.items) ? (r.items as Submission[]) : []
  } catch {
    return []
  }
}

const bareDoi = (v: string) => {
  const d = v.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
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

/** Each live (pending or approved) conference work classified on its own, with its conference
 *  check, so the register and the approval table can show it before it is approved. */
export function conferenceSubmissions(items: Submission[], conferences: ConferenceEntry[]): { sub: Submission; pub: Pub }[] {
  return items
    .filter((s) => (s.status === 'pending' || s.status === 'approved') && (s.type === 'proceeding' || s.type === 'poster'))
    .map((s) => ({ sub: s, pub: preparePubs([submissionRow(s)], [], conferences)[0] }))
    .filter((x): x is { sub: Submission; pub: Pub } => !!x.pub)
}
