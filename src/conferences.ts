// Conference screening for proceedings and posters/abstracts (decision by Tum, 2026-11-06):
// a conference paper counts only when the conference is organised or co-organised by an
// academic/professional association AND the conference is held for, or its main field is, environment
// or energy (incl. geoinformatics for earth/environmental sciences; decided 2026-11-06). Anything not
// yet checked, not found, or found with low confidence is shown but NOT counted until an
// admin confirms it. The register is data/conferences.csv (filled by
// scripts/screen-conferences.ts, which asks Claude Code to look the conference up; the
// admin can overrule any row with the `decision` column).
import type { ConferenceEntry, Pub } from './types'
import { normName } from './tci'

export type ConferenceVerdict = 'count' | 'no_count' | 'pending'

export interface ConferenceMatch {
  entry: ConferenceEntry | null
  key: string
  verdict: ConferenceVerdict
  /** Short Thai reason shown next to the paper. */
  reason: string
  /** Who decided: the admin, the automatic check, or nobody yet. */
  by: 'admin' | 'auto' | 'none'
}

/** Publisher series that bundle many different conferences: these are keyed per paper. */
const GENERIC_SERIES =
  /^(aip conference proceedings|iop conference series.*|e3s web of conferences|matec web of conferences|materials today:? proceedings|journal of physics:? conference series|conference book|proc(eedings?)?( of)?( the)?|procedia.*|springer proceedings.*|lecture notes.*|environmental science and engineering|advances in .*|smart innovation.*)$/i

/** "The 24th National Environmental Conference, 20-21 May 2568, Bangsaen …" → "national environmental conference".
 *  Ordinals, ครั้งที่ N, volumes, pages, dates and parenthesised acronyms are removed so every
 *  edition of a conference maps to one key. */
export function conferenceName(venue: string): string {
  let v = venue.replace(/…/g, ' ').trim()
  v = v.replace(/^(the\s+)?\d+(st|nd|rd|th)\s+/i, '')
  v = v.replace(/\s*ครั้งที่\s*\d+/g, ' ')
  // Cut at the first comma, "(", or a word that is (or starts with) a number.
  const cut = v.search(/,|\(|\.\s+\d|\s\d/)
  if (cut >= 0) v = v.slice(0, cut)
  // Drop trailing tokens that carry digits ("สวสท.’67", "2024") and trailing punctuation.
  let prev = ''
  while (prev !== v) {
    prev = v
    v = v.replace(/\s*\S*\d\S*\s*$/, '').replace(/[\s:;.\-–]+$/, '')
  }
  return v.trim()
}

export function conferenceKey(pub: Pick<Pub, 'venue' | 'titleNorm'>): string {
  const name = conferenceName(pub.venue)
  if (!name || GENERIC_SERIES.test(name)) return `work:${pub.titleNorm}`
  return `venue:${normName(name)}`
}

export function buildConferenceIndex(list: ConferenceEntry[]): Map<string, ConferenceEntry> {
  return new Map(list.map((e) => [e.key, e]))
}

export function conferenceVerdict(entry: ConferenceEntry | null): Pick<ConferenceMatch, 'verdict' | 'reason' | 'by'> {
  if (!entry) return { verdict: 'pending', reason: 'งานประชุมยังไม่ได้ตรวจสอบสมาคม — ไม่นับจนกว่าผู้ดูแลยืนยัน', by: 'none' }
  if (entry.decision === 'count') return { verdict: 'count', reason: `ผู้ดูแลยืนยัน: งานประชุมมีสมาคมรับรอง${entry.association ? ` (${entry.association})` : ''}`, by: 'admin' }
  if (entry.decision === 'no_count') return { verdict: 'no_count', reason: `ผู้ดูแลยืนยัน: ไม่เข้าเกณฑ์${entry.decisionNote ? ` — ${entry.decisionNote}` : ''}`, by: 'admin' }
  const assoc = entry.associationRole === 'organiser' || entry.associationRole === 'co_organiser'
  if (entry.confidence === 'high' && assoc && entry.relatedField === 'yes')
    return { verdict: 'count', reason: `ตรวจอัตโนมัติ: ${entry.association} ${entry.associationRole === 'organiser' ? 'จัด' : 'ร่วมจัด'} สาขา${entry.field ? ` ${entry.field}` : 'เกี่ยวข้อง'}`, by: 'auto' }
  if (entry.confidence !== 'low' && entry.associationRole === 'none')
    return { verdict: 'no_count', reason: `ตรวจอัตโนมัติ: ไม่มีสมาคมจัดหรือร่วมจัด${entry.organiser ? ` (จัดโดย ${entry.organiser})` : ''}`, by: 'auto' }
  if (entry.confidence !== 'low' && assoc && entry.relatedField === 'no')
    return { verdict: 'no_count', reason: `ตรวจอัตโนมัติ: สาขาไม่ใช่สิ่งแวดล้อม/พลังงาน${entry.field ? ` (${entry.field})` : ''}`, by: 'auto' }
  return { verdict: 'pending', reason: 'ตรวจอัตโนมัติยังไม่ชัดเจน — รอผู้ดูแลยืนยัน ไม่นับ', by: 'auto' }
}

export function matchConference(pub: Pick<Pub, 'venue' | 'titleNorm'>, idx: Map<string, ConferenceEntry>): ConferenceMatch {
  const key = conferenceKey(pub)
  const entry = idx.get(key) ?? null
  return { entry, key, ...conferenceVerdict(entry) }
}

export const CONFERENCE_TAG: Record<ConferenceVerdict, string> = {
  count: 'สมาคมรับรอง',
  no_count: 'ไม่เข้าเกณฑ์',
  pending: 'รอตรวจสอบ',
}
