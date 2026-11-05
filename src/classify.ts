// Step 1: classify Google Scholar rows into journal / proceeding / poster /
// exclude, tag research vs. review/academic articles, merge duplicates and
// apply overrides.csv. Anything decided on weak evidence is marked uncertain
// and goes to the review queue instead of being guessed.
import type { Override, Pub, PubType, RawPub } from './types'

/** Lowercase, Unicode-normalise, and strip punctuation and whitespace. */
export function normalizeTitle(title: string): string {
  return title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, '')
}

/** Scholar appends ", <year>" to the venue; drop it before pattern matching. */
function stripYear(venue: string): string {
  return venue.replace(/,?\s*(19|20)\d{2}\s*$/, '').trim()
}

const PREPRINT = /arxiv|research\s*square|ssrn|eartharxiv|preprints?\.org|\bpreprints?\b|biorxiv|medrxiv|chemrxiv|essoar|authorea|egusphere|awaiting peer review|\bdiscussions\b/i
const PATENT = /patent|สิทธิบัตร|อนุสิทธิบัตร/i
const DATASET = /zenodo|figshare|pangaea|dryad|mendeley data|\bdata\s?set\b/i
const THESIS = /thesis|dissertation|วิทยานิพนธ์|ปริญญานิพนธ์|การค้นคว้าอิสระ|\bph\.?\s?d\b|master'?s/i
const POSTER = /poster|abstracts?\b|agu fall meeting|egu general assembly|ams annual meeting|goldschmidt|บทคัดย่อ|โปสเตอร์/i
const PROCEEDING = /proceedings?|\bproc\.|conference|symposium|congress|workshop|e3s web of|matec web of|\bspie\b|การประชุมวิชาการ|ประชุมวิชาการ|รายงานสืบเนื่อง/i
const LECTURE_NOTES = /lecture notes in/i
const BOOK = /\bbook\b|chapter|handbook|encyclopedia|\bisbn\b|^in:|หนังสือ|ตำรา|intechopen/i
const PUBLISHER_ONLY = /^(springer( nature)?( international publishing)?|elsevier|wiley|crc press|routledge|taylor\s*&\s*francis|cambridge university press|oxford university press|academic press|iwa publishing)$/i
const REPORT = /\breport\b|technical note|white paper|working paper|policy brief|รายงาน(?!การประชุม|สืบเนื่อง)/i
const UNIVERSITY_ONLY = /^[^\d]*(universit|institute of technology|มหาวิทยาลัย|สถาบัน)[^\d]*$/i
// Volume (issue), page range, or article number, e.g. "12 (3), 45-60", "8, 101234".
const VOL_ISSUE = /\d+\s*\([^)]+\)/
const PAGES = /\d+\s*,\s*[a-z]?\d+\s*[-–]\s*[a-z]?\d+/i
const ARTICLE_NO = /\b\d+\s*,\s*[a-z]?\d{3,}\b/i
// Article number without volume (online first), e.g. "Geophysical Research Letters, e2022GL100223".
const ARTICLE_NO_ONLY = /,\s*(e\d{4}[a-z]{2}\d+|\d{5,})$/i
// "<book title>, 233-254" — a page range with no volume is usually a book chapter.
const PAGES_ONLY = /^[^\d]+,\s*\d+\s*[-–]\s*\d+$/
const JOURNAL_NAME = /journal|วารสาร|letters|transactions|annals|bulletin|reviews?\b|magazine|science of the total environment|atmospheric (environment|research|chemistry and physics)|scientific (reports|data)|plos one|heliyon|chemosphere|sustainability|remote sensing|^atmosphere$|^water$|^toxics$|^climate$|^agriculture$|^forests$|^land$|^hydrology$/i

export interface TypeResult {
  type: PubType
  reason: string
  uncertain: boolean
}

export function hasVolumeOrPages(venue: string): boolean {
  const v = stripYear(venue)
  return VOL_ISSUE.test(v) || PAGES.test(v) || ARTICLE_NO.test(v) || ARTICLE_NO_ONLY.test(v)
}

export function classifyType(title: string, venue: string): TypeResult {
  const v = stripYear(venue)
  const both = `${title} ${venue}`
  if (!v) return { type: 'exclude', reason: 'ไม่มีชื่อแหล่งตีพิมพ์ (no venue)', uncertain: false }
  if (PREPRINT.test(both)) return { type: 'exclude', reason: 'ฉบับก่อนตีพิมพ์ (preprint)', uncertain: false }
  if (PATENT.test(v)) return { type: 'exclude', reason: 'สิทธิบัตร (patent)', uncertain: false }
  if (DATASET.test(v)) return { type: 'exclude', reason: 'ชุดข้อมูล (dataset)', uncertain: false }
  if (THESIS.test(v)) return { type: 'exclude', reason: 'วิทยานิพนธ์ (thesis/dissertation)', uncertain: false }
  if (POSTER.test(both)) return { type: 'poster', reason: 'โปสเตอร์/บทคัดย่อ (poster/abstract)', uncertain: false }
  if (PROCEEDING.test(v)) return { type: 'proceeding', reason: 'รายงานการประชุมวิชาการ (proceedings)', uncertain: false }
  if (LECTURE_NOTES.test(v))
    return { type: 'proceeding', reason: 'Lecture Notes series — อาจเป็น proceedings หรือหนังสือ', uncertain: true }
  if (BOOK.test(v) || PUBLISHER_ONLY.test(v)) return { type: 'exclude', reason: 'หนังสือ/บทในหนังสือ (book/chapter)', uncertain: false }
  if (REPORT.test(v)) return { type: 'exclude', reason: 'รายงาน (report)', uncertain: false }
  if (PAGES_ONLY.test(v)) return { type: 'exclude', reason: 'มีแต่เลขหน้า ไม่มีเล่ม — น่าจะเป็นบทในหนังสือ', uncertain: true }
  if (hasVolumeOrPages(v)) return { type: 'journal', reason: 'มีเล่ม/ฉบับ/หน้า (volume/issue/pages)', uncertain: false }
  if (JOURNAL_NAME.test(v))
    return { type: 'journal', reason: 'ชื่อคล้ายวารสาร แต่ไม่มีเล่ม/หน้า (journal name, no volume/pages)', uncertain: true }
  if (UNIVERSITY_ONLY.test(v)) return { type: 'exclude', reason: 'มีแต่ชื่อมหาวิทยาลัย — อาจเป็นวิทยานิพนธ์', uncertain: true }
  return { type: 'unknown', reason: 'จำแนกไม่ได้ (unrecognised venue)', uncertain: true }
}

const NOT_RESEARCH = /\breview\b|editorial|บทความวิชาการ|บทความปริทัศน์|ปริทัศน์/i
// These words also appear in research titles ("A machine learning perspective on ...").
const MAYBE_NOT_RESEARCH = /overview|perspective|commentary|viewpoint|opinion/i
const SYSTEMATIC = /systematic review|meta-?analys|scoping review|bibliometric/i
const REVIEW_VENUE = /reviews\b/i

export interface ResearchResult {
  isResearch: boolean
  reason: string
  uncertain: boolean
}

/** Clause 9.4 counts only research outputs (ผลงานวิจัย); review/academic articles are not. */
export function classifyResearch(title: string, venue: string): ResearchResult {
  if (SYSTEMATIC.test(title))
    return { isResearch: false, reason: 'systematic review / meta-analysis — ต้องตัดสินว่าเป็นงานวิจัยหรือไม่', uncertain: true }
  if (NOT_RESEARCH.test(title)) return { isResearch: false, reason: 'บทความปริทัศน์/วิชาการ (review/academic article)', uncertain: false }
  if (MAYBE_NOT_RESEARCH.test(title))
    return { isResearch: false, reason: 'ชื่อเรื่องมีคำว่า perspective/overview — อาจไม่ใช่งานวิจัย', uncertain: true }
  if (REVIEW_VENUE.test(stripYear(venue)))
    return { isResearch: false, reason: 'ตีพิมพ์ในวารสารประเภท Reviews', uncertain: true }
  return { isResearch: true, reason: 'งานวิจัย (default)', uncertain: false }
}

/** Higher = richer venue string: prefer a counted type with volume/pages, then the longer venue, then more citations. */
function richness(p: RawPub): number {
  const t = classifyType(p.title, p.venue)
  const typeScore = t.type === 'journal' || t.type === 'proceeding' ? 2 : t.type === 'poster' ? 1 : 0
  return typeScore * 1e6 + (hasVolumeOrPages(p.venue) ? 1e5 : 0) + p.venue.length * 100 + Math.min(p.cites, 99)
}

/** Merge rows with the same person and normalised title; keep the richest venue. */
export function dedupe(rows: RawPub[]): { row: RawPub; duplicates: number }[] {
  const groups = new Map<string, RawPub[]>()
  for (const r of rows) {
    const k = `${r.key}\u0000${normalizeTitle(r.title)}`
    const g = groups.get(k)
    if (g) g.push(r)
    else groups.set(k, [r])
  }
  return [...groups.values()].map((g) => {
    const best = g.reduce((a, b) => (richness(b) > richness(a) ? b : a))
    // A duplicate without a year inherits one from its siblings.
    const year = best.year ?? g.find((r) => r.year !== null)?.year ?? null
    return { row: { ...best, year }, duplicates: g.length - 1 }
  })
}

export function overrideKey(key: string, title: string): string {
  return `${key}\u0000${normalizeTitle(title)}`
}

export function preparePubs(rows: RawPub[], overrides: Override[]): Pub[] {
  const byKey = new Map(overrides.map((o) => [overrideKey(o.key, o.titleNormalized), o]))
  return dedupe(rows).map(({ row, duplicates }) => {
    const titleNorm = normalizeTitle(row.title)
    const t = classifyType(row.title, row.venue)
    const r = classifyResearch(row.title, row.venue)
    const o = byKey.get(overrideKey(row.key, row.title)) ?? null
    const pub: Pub = {
      ...row,
      id: `${row.key}|${titleNorm}`,
      titleNorm,
      type: t.type,
      typeReason: t.reason,
      typeUncertain: t.uncertain,
      isResearch: r.isResearch,
      researchReason: r.reason,
      researchUncertain: r.uncertain,
      ownDegree: null,
      duplicates,
      override: o,
    }
    if (o?.type) Object.assign(pub, { type: o.type, typeReason: `แก้ไขด้วยมือ (override)${o.note ? `: ${o.note}` : ''}`, typeUncertain: false })
    if (o?.isResearch !== null && o?.isResearch !== undefined)
      Object.assign(pub, { isResearch: o.isResearch, researchReason: 'แก้ไขด้วยมือ (override)', researchUncertain: false })
    if (o?.ownDegree !== null && o?.ownDegree !== undefined) pub.ownDegree = o.ownDegree
    return pub
  })
}
