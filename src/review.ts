// Review queue and overrides.csv line generation. The site is static, so it
// only produces lines for the user to paste into data/overrides.csv.
import { ownDegreeRisk, type PersonResult } from './rules'
import type { Faculty, Pub } from './types'

export interface ReviewItem {
  person: Faculty
  pub: Pub
  issues: string[]
}

export function reviewItems(results: PersonResult[]): ReviewItem[] {
  const items: ReviewItem[] = []
  for (const r of results) {
    for (const pub of r.pubs) {
      const issues: string[] = []
      if (pub.typeUncertain) issues.push(`ประเภท: ${pub.typeReason}`)
      const countable = pub.type !== 'exclude' || pub.typeUncertain
      if (countable && pub.researchUncertain) issues.push(`งานวิจัย: ${pub.researchReason}`)
      if (countable && pub.ownDegree === null && ownDegreeRisk(pub, r.person))
        issues.push(`ตีพิมพ์ภายใน 2 ปีก่อนจบ (${r.person.degreeYear}) — เป็นส่วนหนึ่งของการศึกษาเพื่อรับปริญญาหรือไม่`)
      if (countable && pub.year === null) issues.push('ไม่มีปีที่พิมพ์ — แก้ใน publications.tsv')
      if (issues.length) items.push({ person: r.person, pub, issues })
    }
  }
  return items.sort((a, b) => a.person.nameEn.localeCompare(b.person.nameEn) || (b.pub.year ?? 0) - (a.pub.year ?? 0))
}

export function csvField(v: string | number | null | undefined): string {
  let s = v === null || v === undefined ? '' : String(v)
  // A field that a spreadsheet would read as a formula (=, +, -, @) gets a leading apostrophe,
  // the usual guard against CSV injection from free-text titles (review, 2026-11-07).
  if (typeof v === 'string' && /^[=+\-@]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function csvLine(fields: (string | number | null | undefined)[]): string {
  return fields.map(csvField).join(',')
}

export interface OverrideChoice {
  type: '' | 'journal' | 'proceeding' | 'poster' | 'exclude'
  isResearch: '' | 'yes' | 'no'
  ownDegree: '' | 'yes' | 'no'
  note: string
}

/** One line for data/overrides.csv: key,title_normalized,type_override,is_research,part_of_own_degree,note */
export function overrideLine(pub: Pub, c: OverrideChoice): string {
  return csvLine([pub.key, pub.titleNorm, c.type, c.isResearch, c.ownDegree, c.note])
}

export function defaultChoice(item: ReviewItem): OverrideChoice {
  const p = item.pub
  return {
    type: p.type === 'unknown' ? '' : p.type,
    isResearch: p.isResearch ? 'yes' : 'no',
    ownDegree: p.ownDegree === null ? (item.issues.some((i) => i.includes('ก่อนจบ')) ? 'no' : '') : p.ownDegree ? 'yes' : 'no',
    note: '',
  }
}
