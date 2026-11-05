// Step 2: clause 9 of ประกาศคณะกรรมการมาตรฐานการอุดมศึกษา เรื่อง เกณฑ์มาตรฐานหลักสูตร
// ระดับบัณฑิตศึกษา พ.ศ. 2565 (ราชกิจจานุเบกษา เล่ม 139 ตอนพิเศษ 212 ง, 9 ก.ย. 2565, หน้า 25–31)
// and clause 10 of เกณฑ์มาตรฐานหลักสูตรระดับปริญญาตรี พ.ศ. 2565 (same issue, หน้า 11–20).
// Pure functions: every result is recomputed in the browser when the evaluation
// year or the poster switch changes.
//
// Three-valued logic: each publication counts "yes", "maybe" (uncertain
// classification) or "no". A rule is met when the certain counts satisfy it,
// not met when even the possible counts fail, and needs review otherwise.
import type { Faculty, Pub, Rank } from './types'

export type Status = 'met' | 'not_met' | 'needs_review'
export type Tri = 'yes' | 'maybe' | 'no'
export type Level = 'ba' | 'gd' | 'hgd' | 'ms' | 'phd'

export interface Settings {
  /** Evaluation year Y (CE). The window is Y−4 … Y inclusive. */
  year: number
  /** Count posters/abstracts as outputs. Off by default: see the warning in the UI. */
  countPosters: boolean
  /** Strict mode (the site's setting): anything that cannot be confirmed is not counted,
   *  missing degree/rank data does not qualify, and no result is left as needs review. */
  strict?: boolean
}

/** Degree/rank requirement of a role. `master_or_asst` = ปริญญาโท หรือ ผศ. ขึ้นไป (clause 10). */
type Qual = 'master_or_asst' | 'master' | 'doc_or_assoc' | 'doc_or_full'

export interface RoleSpec {
  id: string
  level: Level
  clause: string
  labelTh: string
  labelEn: string
  qual: Qual
  minOutputs: number
  /** Of minOutputs, how many must be research (ผลงานวิจัย). */
  minResearch: number
  /** Doctoral roles: only research outputs count at all. */
  researchOnly: boolean
  /** New doctoral graduate clause (9.x.4 / 9.x.6) and how it applies to this role. */
  newGrad: { clause: string; mode: 'teach' | 'outputs' } | null
}

const RANK_ORDER: Rank[] = ['อาจารย์', 'ผศ.', 'รศ.', 'ศ.']

export const ROLES: RoleSpec[] = [
  // 10.1 ปริญญาตรีทางวิชาการ (เกณฑ์มาตรฐานหลักสูตรระดับปริญญาตรี พ.ศ. 2565). The per-person
  // requirements of 10.2 (ทางวิชาชีพหรือปฏิบัติการ) are identical; 10.2's practical-experience
  // quota (2 in 5 responsible lecturers) is a programme-level condition and is not checked here.
  // 10.1.1: ปริญญาโท หรือ ผศ. ขึ้นไป, and ≥ 1 published academic work (not degree work) in the past 5 years.
  { id: 'ba_program', level: 'ba', clause: '10.1.1', labelTh: 'อาจารย์ประจำหลักสูตร', labelEn: 'Programme lecturer', qual: 'master_or_asst', minOutputs: 1, minResearch: 0, researchOnly: false, newGrad: null },
  { id: 'ba_responsible', level: 'ba', clause: '10.1.2', labelTh: 'อาจารย์ผู้รับผิดชอบหลักสูตร', labelEn: 'Responsible lecturer', qual: 'master_or_asst', minOutputs: 1, minResearch: 0, researchOnly: false, newGrad: null },
  // 10.1.3 asks for the degree/rank only; no output requirement.
  { id: 'ba_teacher', level: 'ba', clause: '10.1.3', labelTh: 'อาจารย์ผู้สอน', labelEn: 'Teaching lecturer', qual: 'master_or_asst', minOutputs: 0, minResearch: 0, researchOnly: false, newGrad: null },
  // 9.1 ประกาศนียบัตรบัณฑิต
  { id: 'gd_program', level: 'gd', clause: '9.1.1', labelTh: 'อาจารย์ประจำหลักสูตร', labelEn: 'Programme lecturer', qual: 'master', minOutputs: 3, minResearch: 1, researchOnly: false, newGrad: { clause: '9.1.4', mode: 'outputs' } },
  { id: 'gd_responsible', level: 'gd', clause: '9.1.2', labelTh: 'อาจารย์ผู้รับผิดชอบหลักสูตร', labelEn: 'Responsible lecturer', qual: 'doc_or_assoc', minOutputs: 3, minResearch: 1, researchOnly: false, newGrad: { clause: '9.1.4', mode: 'outputs' } },
  { id: 'gd_teacher', level: 'gd', clause: '9.1.3', labelTh: 'อาจารย์ผู้สอน', labelEn: 'Teaching lecturer', qual: 'master', minOutputs: 1, minResearch: 0, researchOnly: false, newGrad: { clause: '9.1.4', mode: 'teach' } },
  // 9.2 ประกาศนียบัตรบัณฑิตชั้นสูง
  { id: 'hgd_program', level: 'hgd', clause: '9.2.1', labelTh: 'อาจารย์ประจำหลักสูตร', labelEn: 'Programme lecturer', qual: 'doc_or_assoc', minOutputs: 3, minResearch: 1, researchOnly: false, newGrad: { clause: '9.2.4', mode: 'outputs' } },
  { id: 'hgd_responsible', level: 'hgd', clause: '9.2.2', labelTh: 'อาจารย์ผู้รับผิดชอบหลักสูตร', labelEn: 'Responsible lecturer', qual: 'doc_or_full', minOutputs: 3, minResearch: 1, researchOnly: false, newGrad: { clause: '9.2.4', mode: 'outputs' } },
  { id: 'hgd_teacher', level: 'hgd', clause: '9.2.3', labelTh: 'อาจารย์ผู้สอน', labelEn: 'Teaching lecturer', qual: 'doc_or_assoc', minOutputs: 1, minResearch: 0, researchOnly: false, newGrad: { clause: '9.2.4', mode: 'teach' } },
  // 9.3 ปริญญาโท
  { id: 'ms_program', level: 'ms', clause: '9.3.1', labelTh: 'อาจารย์ประจำหลักสูตร', labelEn: 'Programme lecturer', qual: 'master', minOutputs: 3, minResearch: 1, researchOnly: false, newGrad: { clause: '9.3.6', mode: 'outputs' } },
  { id: 'ms_responsible', level: 'ms', clause: '9.3.2', labelTh: 'อาจารย์ผู้รับผิดชอบหลักสูตร', labelEn: 'Responsible lecturer', qual: 'doc_or_assoc', minOutputs: 3, minResearch: 1, researchOnly: false, newGrad: { clause: '9.3.6', mode: 'outputs' } },
  { id: 'ms_advisor', level: 'ms', clause: '9.3.3 (1)', labelTh: 'อาจารย์ที่ปรึกษาวิทยานิพนธ์หลัก', labelEn: 'Main thesis advisor', qual: 'doc_or_assoc', minOutputs: 3, minResearch: 1, researchOnly: false, newGrad: { clause: '9.3.6', mode: 'outputs' } },
  { id: 'ms_examiner', level: 'ms', clause: '9.3.4 (1)', labelTh: 'อาจารย์ผู้สอบวิทยานิพนธ์ (ภายใน)', labelEn: 'Internal thesis examiner', qual: 'doc_or_assoc', minOutputs: 3, minResearch: 1, researchOnly: false, newGrad: { clause: '9.3.6', mode: 'outputs' } },
  { id: 'ms_teacher', level: 'ms', clause: '9.3.5', labelTh: 'อาจารย์ผู้สอน', labelEn: 'Teaching lecturer', qual: 'master', minOutputs: 1, minResearch: 0, researchOnly: false, newGrad: { clause: '9.3.6', mode: 'teach' } },
  // 9.4 ปริญญาเอก
  { id: 'phd_program', level: 'phd', clause: '9.4.1', labelTh: 'อาจารย์ประจำหลักสูตร', labelEn: 'Programme lecturer', qual: 'doc_or_assoc', minOutputs: 3, minResearch: 3, researchOnly: true, newGrad: { clause: '9.4.6', mode: 'outputs' } },
  { id: 'phd_responsible', level: 'phd', clause: '9.4.2', labelTh: 'อาจารย์ผู้รับผิดชอบหลักสูตร', labelEn: 'Responsible lecturer', qual: 'doc_or_full', minOutputs: 3, minResearch: 3, researchOnly: true, newGrad: { clause: '9.4.6', mode: 'outputs' } },
  { id: 'phd_advisor', level: 'phd', clause: '9.4.3 (1)', labelTh: 'อาจารย์ที่ปรึกษาวิทยานิพนธ์หลัก', labelEn: 'Main thesis advisor', qual: 'doc_or_assoc', minOutputs: 3, minResearch: 3, researchOnly: true, newGrad: { clause: '9.4.6', mode: 'outputs' } },
  { id: 'phd_examiner', level: 'phd', clause: '9.4.4 (1)', labelTh: 'อาจารย์ผู้สอบวิทยานิพนธ์ (ภายใน)', labelEn: 'Internal thesis examiner', qual: 'doc_or_assoc', minOutputs: 3, minResearch: 3, researchOnly: true, newGrad: { clause: '9.4.6', mode: 'outputs' } },
  // 9.4.5 asks for at least 1 output of any kind, not only research.
  { id: 'phd_teacher', level: 'phd', clause: '9.4.5', labelTh: 'อาจารย์ผู้สอน', labelEn: 'Teaching lecturer', qual: 'doc_or_assoc', minOutputs: 1, minResearch: 0, researchOnly: false, newGrad: { clause: '9.4.6', mode: 'teach' } },
]

/** `minResponsible`: responsible lecturers a programme needs (10.1.2: 5 คน; 9.x.2: 3 คน). */
export const LEVELS: { id: Level; th: string; en: string; clause: string; responsible: string; minResponsible: number }[] = [
  { id: 'ba', th: 'ปริญญาตรี', en: "Bachelor's", clause: '10.1', responsible: 'ba_responsible', minResponsible: 5 },
  { id: 'ms', th: 'ปริญญาโท', en: "Master's", clause: '9.3', responsible: 'ms_responsible', minResponsible: 3 },
  { id: 'phd', th: 'ปริญญาเอก', en: 'Doctoral', clause: '9.4', responsible: 'phd_responsible', minResponsible: 3 },
  { id: 'gd', th: 'ประกาศนียบัตรบัณฑิต', en: 'Graduate diploma', clause: '9.1', responsible: 'gd_responsible', minResponsible: 3 },
  { id: 'hgd', th: 'ประกาศนียบัตรบัณฑิตชั้นสูง', en: 'Higher graduate diploma', clause: '9.2', responsible: 'hgd_responsible', minResponsible: 3 },
]

export const roleById = (id: string): RoleSpec => {
  const r = ROLES.find((x) => x.id === id)
  if (!r) throw new Error(`unknown role ${id}`)
  return r
}

export function windowYears(year: number): [number, number] {
  return [year - 4, year]
}

const minTri = (...xs: Tri[]): Tri => (xs.includes('no') ? 'no' : xs.includes('maybe') ? 'maybe' : 'yes')

export function rankAtLeast(rank: Rank | null, min: Rank): boolean {
  return rank !== null && RANK_ORDER.indexOf(rank) >= RANK_ORDER.indexOf(min)
}

/** Degree and rank requirement, e.g. "ปริญญาเอก หรือ ปริญญาโท + รศ. ขึ้นไป". */
export function qualifies(p: Faculty, qual: Qual): { ok: Tri; reason: string } {
  if (!p.degree) return { ok: 'maybe', reason: 'ไม่มีข้อมูลวุฒิการศึกษาใน faculty.csv' }
  if (p.degree === 'ปริญญาเอก') return { ok: 'yes', reason: 'วุฒิปริญญาเอก' }
  // Clause 10: ปริญญาโท หรือ ผศ. ขึ้นไป. Every degree in faculty.csv is โท or เอก, so โท satisfies it;
  // a lecturer without a master's would need ผศ. or above.
  if (qual === 'master_or_asst') {
    if (p.degree === 'ปริญญาโท') return { ok: 'yes', reason: 'วุฒิปริญญาโท' }
    if (rankAtLeast(p.rank, 'ผศ.')) return { ok: 'yes', reason: `ตำแหน่ง ${p.rank}` }
    return { ok: 'no', reason: 'ต้องมีวุฒิปริญญาโท หรือตำแหน่ง ผศ. ขึ้นไป' }
  }
  if (qual === 'master') return { ok: 'yes', reason: 'วุฒิปริญญาโท' }
  const min: Rank = qual === 'doc_or_full' ? 'ศ.' : 'รศ.'
  if (!p.rank) return { ok: 'maybe', reason: 'วุฒิปริญญาโท แต่ไม่มีข้อมูลตำแหน่งวิชาการ' }
  if (rankAtLeast(p.rank, min)) return { ok: 'yes', reason: `วุฒิปริญญาโท + ตำแหน่ง ${p.rank}` }
  return { ok: 'no', reason: `วุฒิปริญญาโท ต้องมีตำแหน่ง ${min}${min === 'รศ.' ? ' ขึ้นไป' : ''} (ปัจจุบัน ${p.rank})` }
}

export interface PubEval {
  pub: Pub
  /** Counts as an eligible output (journal / full proceeding paper / poster when switched on). */
  eligible: Tri
  /** Counts as a research output (ผลงานวิจัย). Never stronger than `eligible`. */
  research: Tri
  reasons: string[]
}

/** Two years before the degree year, plus that year itself, may be degree work. */
export function ownDegreeRisk(pub: Pub, p: Faculty): boolean {
  return p.degreeYear !== null && pub.year !== null && pub.year >= p.degreeYear - 2 && pub.year <= p.degreeYear
}

export function evaluatePub(pub: Pub, p: Faculty, s: Settings): PubEval {
  const reasons: string[] = []
  const parts: Tri[] = []
  if (pub.type === 'exclude') {
    parts.push(pub.typeUncertain ? 'maybe' : 'no')
    reasons.push(`ไม่นับ: ${pub.typeReason}`)
  } else if (pub.type === 'unknown') {
    parts.push('maybe')
    reasons.push(pub.typeReason)
  } else if (pub.type === 'poster' && !s.countPosters) {
    parts.push('no')
    reasons.push('โปสเตอร์/บทคัดย่อ — ไม่นับ (ปิดสวิตช์นับโปสเตอร์)')
  } else if (pub.typeUncertain) {
    parts.push('maybe')
    reasons.push(pub.typeReason)
  }
  if (pub.year === null) {
    parts.push('no')
    reasons.push('ไม่มีปีที่พิมพ์ (no year)')
  }
  if (pub.ownDegree === true) {
    parts.push('no')
    reasons.push('เป็นส่วนหนึ่งของการศึกษาเพื่อรับปริญญาของตนเอง (override)')
  } else if (pub.ownDegree === null && ownDegreeRisk(pub, p)) {
    parts.push('maybe')
    reasons.push(`ตีพิมพ์ภายใน 2 ปีก่อนจบ (${p.degreeYear}) — อาจเป็นส่วนหนึ่งของการศึกษาเพื่อรับปริญญา`)
  }
  let eligible = minTri(...parts)
  if (s.strict && eligible === 'maybe') {
    eligible = 'no'
    reasons.unshift('ไม่นับ: ยืนยันประเภทหรือเงื่อนไขไม่ได้')
  }
  let researchSelf: Tri = pub.isResearch ? (pub.researchUncertain ? 'maybe' : 'yes') : pub.researchUncertain ? 'maybe' : 'no'
  // Strict mode has no review queue, so an unconfirmed research flag counts as not research.
  if (s.strict && researchSelf === 'maybe') researchSelf = 'no'
  if (researchSelf !== 'yes') reasons.push(pub.researchReason)
  return { pub, eligible, research: minTri(eligible, researchSelf), reasons }
}

interface Tally {
  total: number
  totalPossible: number
  research: number
  researchPossible: number
}

function tally(evals: PubEval[]): Tally {
  return {
    total: evals.filter((e) => e.eligible === 'yes').length,
    totalPossible: evals.filter((e) => e.eligible !== 'no').length,
    research: evals.filter((e) => e.research === 'yes').length,
    researchPossible: evals.filter((e) => e.research !== 'no').length,
  }
}

function outputsTri(t: Tally, minOutputs: number, minResearch: number, researchOnly: boolean): Tri {
  const need = (total: number, research: number) =>
    researchOnly ? research >= minOutputs : total >= minOutputs && research >= minResearch
  if (need(t.total, t.research)) return 'yes'
  if (need(t.totalPossible, t.researchPossible)) return 'maybe'
  return 'no'
}

export interface RoleResult {
  role: RoleSpec
  status: Status
  reasons: string[]
  counts: Tally
  window: [number, number]
  /** Outputs in the window that count for certain / possibly. */
  used: PubEval[]
  uncertain: PubEval[]
  path: 'regular' | 'new_grad'
}

/** New doctoral graduate tiers: 1 output within 2 years, 2 within 4, or 3 within 5. */
const NEW_GRAD_TIERS: [years: number, outputs: number][] = [
  [2, 1],
  [4, 2],
  [5, 3],
]

export function isNewGraduate(p: Faculty, s: Settings): boolean {
  // TODO(criteria): the announcement says "อาจารย์ใหม่" without defining it. Here a
  // doctorate completed within the last 5 years (Y − degree year ≤ 5) makes the
  // clause applicable, and every result through this path is marked needs review.
  return p.degree === 'ปริญญาเอก' && p.degreeYear !== null && s.year - p.degreeYear >= 0 && s.year - p.degreeYear <= 5
}

function newGradPath(role: RoleSpec, p: Faculty, evals: PubEval[], s: Settings): { ok: Tri; reason: string } | null {
  if (!role.newGrad || !isNewGraduate(p, s)) return null
  const clause = role.newGrad.clause
  if (role.newGrad.mode === 'teach')
    return { ok: 'maybe', reason: `ข้อ ${clause}: อาจารย์ใหม่วุฒิปริญญาเอก อนุโลมให้สอนได้แม้ยังไม่มีผลงาน — ต้องยืนยันว่าเป็น "อาจารย์ใหม่"` }
  // TODO(criteria): "ภายใน 2 ปี" is counted in whole years (pub year − degree year ≤ 2),
  // because Scholar gives only the year; outputs in the degree year itself are included.
  const D = p.degreeYear as number
  const pick = (e: PubEval) => (role.researchOnly ? e.research : e.eligible)
  // The tier is the one that matches the years since the degree (decision by Tum, 2026-11-05):
  // within 2 years 1 output, within 4 years 2, within 5 years 3. Outputs from the degree
  // year through the evaluation year count.
  const elapsed = s.year - D
  const [years, n] = NEW_GRAD_TIERS.find(([y]) => elapsed <= y) ?? NEW_GRAD_TIERS[NEW_GRAD_TIERS.length - 1]
  const after = evals.filter((e) => e.pub.year !== null && e.pub.year >= D && e.pub.year <= s.year)
  const sure = after.filter((e) => pick(e) === 'yes').length
  const possible = after.filter((e) => pick(e) !== 'no').length
  const best: Tri = sure >= n ? 'yes' : possible >= n ? 'maybe' : 'no'
  const kind = role.researchOnly ? 'ผลงานวิจัย' : 'ผลงาน'
  if (best === 'no') return { ok: 'no', reason: `ข้อ ${clause}: จบ ${D} (${elapsed} ปี) ต้องมี${kind}หลังจบอย่างน้อย ${n} เรื่องภายใน ${years} ปี; มี ${sure}` }
  return { ok: 'maybe', reason: `ข้อ ${clause}: อาจผ่านในฐานะอาจารย์ใหม่ (${kind}หลังจบ ${D} มี ${sure} เรื่อง ถึงเกณฑ์ ${n} เรื่องภายใน ${years} ปี) — ต้องยืนยันว่าเป็น "อาจารย์ใหม่"` }
}

export function evaluateRole(role: RoleSpec, p: Faculty, pubs: Pub[], s: Settings): RoleResult {
  const [from, to] = windowYears(s.year)
  const evals = pubs.map((pub) => evaluatePub(pub, p, s))
  const inWindow = evals.filter((e) => e.pub.year !== null && e.pub.year >= from && e.pub.year <= to)
  const counts = tally(inWindow)
  const q0 = qualifies(p, role.qual)
  const q = s.strict && q0.ok === 'maybe' ? { ok: 'no' as Tri, reason: `${q0.reason} — ไม่ผ่าน` } : q0
  const o = outputsTri(counts, role.minOutputs, role.minResearch, role.researchOnly)

  const need = role.researchOnly
    ? `ผลงานวิจัย ≥ ${role.minOutputs} เรื่อง`
    : role.minResearch > 0
      ? `ผลงาน ≥ ${role.minOutputs} เรื่อง (วิจัย ≥ ${role.minResearch})`
      : role.minOutputs === 0
        ? 'ไม่กำหนดจำนวนผลงาน'
        : `ผลงาน ≥ ${role.minOutputs} เรื่อง`
  const have = role.researchOnly
    ? `มีผลงานวิจัย ${counts.research}${counts.researchPossible > counts.research ? ` (อาจถึง ${counts.researchPossible})` : ''}`
    : `มีผลงาน ${counts.total}${counts.totalPossible > counts.total ? ` (อาจถึง ${counts.totalPossible})` : ''}, วิจัย ${counts.research}${counts.researchPossible > counts.research ? ` (อาจถึง ${counts.researchPossible})` : ''}`
  const reasons = [`คุณวุฒิ: ${q.reason}`, role.minOutputs === 0 ? `${need} (ข้อ ${role.clause}); ${have} ในปี ${from}–${to}` : `ต้องการ ${need} ในปี ${from}–${to}; ${have}`]

  let status: Status = q.ok === 'no' || o === 'no' ? 'not_met' : q.ok === 'yes' && o === 'yes' ? 'met' : 'needs_review'
  let path: RoleResult['path'] = 'regular'
  if (status !== 'met' && q.ok !== 'no') {
    const ng = newGradPath(role, p, evals, s)
    if (ng) {
      reasons.push(ng.reason)
      if (ng.ok !== 'no') {
        // TODO(criteria): strict mode applies the new-graduate clause as written.
        status = s.strict ? 'met' : 'needs_review'
        path = 'new_grad'
      }
    }
  }
  const pick = (e: PubEval) => (role.researchOnly ? e.research : e.eligible)
  return {
    role,
    status,
    reasons,
    counts,
    window: [from, to],
    used: inWindow.filter((e) => pick(e) === 'yes'),
    uncertain: inWindow.filter((e) => pick(e) === 'maybe'),
    path,
  }
}

type RuleFn = (p: Faculty, pubs: Pub[], s: Settings) => RoleResult
const rule = (id: string): RuleFn => (p, pubs, s) => evaluateRole(roleById(id), p, pubs, s)

// One function per role, named by clause.
export const rule_10_1_1_baProgramLecturer = rule('ba_program')
export const rule_10_1_2_baResponsibleLecturer = rule('ba_responsible')
export const rule_10_1_3_baTeacher = rule('ba_teacher')
export const rule_9_1_1_gdProgramLecturer = rule('gd_program')
export const rule_9_1_2_gdResponsibleLecturer = rule('gd_responsible')
export const rule_9_1_3_gdTeacher = rule('gd_teacher')
export const rule_9_2_1_hgdProgramLecturer = rule('hgd_program')
export const rule_9_2_2_hgdResponsibleLecturer = rule('hgd_responsible')
export const rule_9_2_3_hgdTeacher = rule('hgd_teacher')
export const rule_9_3_1_msProgramLecturer = rule('ms_program')
export const rule_9_3_2_msResponsibleLecturer = rule('ms_responsible')
export const rule_9_3_3_msMainAdvisor = rule('ms_advisor')
export const rule_9_3_4_msInternalExaminer = rule('ms_examiner')
export const rule_9_3_5_msTeacher = rule('ms_teacher')
export const rule_9_4_1_phdProgramLecturer = rule('phd_program')
export const rule_9_4_2_phdResponsibleLecturer = rule('phd_responsible')
export const rule_9_4_3_phdMainAdvisor = rule('phd_advisor')
export const rule_9_4_4_phdInternalExaminer = rule('phd_examiner')
export const rule_9_4_5_phdTeacher = rule('phd_teacher')

export interface PersonResult {
  person: Faculty
  pubs: Pub[]
  roles: Record<string, RoleResult>
}

export function evaluatePerson(p: Faculty, pubs: Pub[], s: Settings): PersonResult {
  const own = pubs.filter((x) => x.key === p.nameEn)
  return { person: p, pubs: own, roles: Object.fromEntries(ROLES.map((r) => [r.id, evaluateRole(r, p, own, s)])) }
}

/** Roles met this year that would not be met next year if no new output appears:
 *  the oldest year leaves the window and nothing new enters it. */
export function nextYearRisk(r: PersonResult, s: Settings): RoleSpec[] {
  const known = r.pubs.filter((p) => p.year === null || p.year <= s.year)
  const next = evaluatePerson(r.person, known, { ...s, year: s.year + 1 })
  return ROLES.filter((role) => r.roles[role.id].status === 'met' && next.roles[role.id].status !== 'met')
}

const LEVEL_PATTERNS: Record<Level, RegExp> = {
  ba: /bachelor|^b\.|^bs\b|^bsc\b|^beng\b|ป\.?\s?ตรี|ปริญญาตรี|วท\.?บ|วศ\.?บ/i,
  hgd: /higher\s*grad|ป\.?\s?บัณฑิตชั้นสูง|บัณฑิตชั้นสูง/i,
  gd: /^(?!.*(higher|ชั้นสูง)).*(grad\.?\s?dip|ป\.?\s?บัณฑิต)/i,
  ms: /^m\.|master|^ms\b|ป\.?\s?โท|ปริญญาโท|วท\.?ม|วศ\.?ม/i,
  phd: /ph\.?\s?d|d\.?\s?eng|doctor|ป\.?\s?เอก|ปริญญาเอก|ปร\.?ด/i,
}

export function inProgramme(p: Faculty, level: Level): boolean {
  return p.programs.some((x) => LEVEL_PATTERNS[level].test(x))
}

export interface ProgrammeCheck {
  level: (typeof LEVELS)[number]
  status: Status
  listed: number
  met: PersonResult[]
  review: PersonResult[]
  /** Lecturers who meet the criterion but are not listed in this programme. */
  metNotListed: PersonResult[]
  usedAll: boolean
}

/** A programme passes only if enough people meet the responsible-lecturer criterion
 *  (9.x.2: 3 คน; 10.1.2: 5 คน). */
export function programmeCheck(level: Level, results: PersonResult[]): ProgrammeCheck {
  const lv = LEVELS.find((l) => l.id === level)!
  const listedPeople = results.filter((r) => inProgramme(r.person, level))
  const usedAll = listedPeople.length === 0
  const pool = usedAll ? results : listedPeople
  const met = pool.filter((r) => r.roles[lv.responsible].status === 'met')
  const review = pool.filter((r) => r.roles[lv.responsible].status === 'needs_review')
  const n = lv.minResponsible
  const status: Status = met.length >= n ? 'met' : met.length + review.length >= n ? 'needs_review' : 'not_met'
  const metNotListed = usedAll ? [] : results.filter((r) => !inProgramme(r.person, level) && r.roles[lv.responsible].status === 'met')
  return { level: lv, status, listed: listedPeople.length, met, review, metNotListed, usedAll }
}

export const toBE = (ce: number) => ce + 543
