import { describe, expect, it } from 'vitest'
import {
  evaluatePerson,
  nextYearRisk,
  programmeCheck,
  qualifies,
  rule_9_1_1_gdProgramLecturer,
  rule_9_1_2_gdResponsibleLecturer,
  rule_9_1_3_gdTeacher,
  rule_9_2_1_hgdProgramLecturer,
  rule_9_2_2_hgdResponsibleLecturer,
  rule_9_2_3_hgdTeacher,
  rule_9_3_1_msProgramLecturer,
  rule_9_3_2_msResponsibleLecturer,
  rule_9_3_3_msMainAdvisor,
  rule_9_3_4_msInternalExaminer,
  rule_9_3_5_msTeacher,
  rule_9_4_1_phdProgramLecturer,
  rule_9_4_2_phdResponsibleLecturer,
  rule_9_4_3_phdMainAdvisor,
  rule_9_4_4_phdInternalExaminer,
  rule_9_4_5_phdTeacher,
  windowYears,
  type Settings,
} from './rules'
import type { Faculty, Pub } from './types'

const Y = 2026
const S: Settings = { year: Y, countPosters: false }

const person = (over: Partial<Faculty> = {}): Faculty => ({
  nameEn: 'P', nameTh: 'พ', scholarId: '', rank: 'ผศ.', degree: 'ปริญญาเอก', degreeYear: 2005, programs: [], notes: '', ...over,
})

let n = 0
const pub = (over: Partial<Pub> = {}): Pub => {
  n++
  return {
    line: n, key: 'P', year: 2025, title: `t${n}`, authors: '', venue: 'J 1 (1), 1-2', cites: 0, id: `P|t${n}`, titleNorm: `t${n}`,
    type: 'journal', typeReason: '', typeUncertain: false, isResearch: true, researchReason: '', researchUncertain: false,
    ownDegree: null, duplicates: 0, sources: ['scholar'], override: null, ...over,
  }
}
const journals = (k: number, over: Partial<Pub> = {}) => Array.from({ length: k }, () => pub(over))

describe('window', () => {
  it('covers Y−4 to Y inclusive', () => {
    expect(windowYears(2026)).toEqual([2022, 2026])
  })
  it('an output in Y−5 is outside the window', () => {
    const pubs = [...journals(2, { year: 2022 }), pub({ year: 2021 })]
    expect(rule_9_3_1_msProgramLecturer(person(), pubs, S).status).toBe('not_met')
  })
  it('an output in Y−4 is inside the window', () => {
    expect(rule_9_3_1_msProgramLecturer(person(), journals(3, { year: 2022 }), S).status).toBe('met')
  })
})

describe('9.3 master’s', () => {
  it('9.3.1 met with exactly 3 outputs including 1 research', () => {
    const pubs = [pub(), pub({ isResearch: false }), pub({ isResearch: false })]
    const r = rule_9_3_1_msProgramLecturer(person({ degree: 'ปริญญาโท', rank: 'อาจารย์' }), pubs, S)
    expect(r.status).toBe('met')
    expect(r.counts).toMatchObject({ total: 3, research: 1 })
  })
  it('9.3.1 not met with 2 outputs', () => {
    expect(rule_9_3_1_msProgramLecturer(person(), journals(2), S).status).toBe('not_met')
  })
  it('9.3.1 not met with 3 outputs and no research', () => {
    expect(rule_9_3_1_msProgramLecturer(person(), journals(3, { isResearch: false }), S).status).toBe('not_met')
  })
  it('9.3.2 master’s + รศ. qualifies; master’s + ผศ. does not', () => {
    expect(rule_9_3_2_msResponsibleLecturer(person({ degree: 'ปริญญาโท', rank: 'รศ.' }), journals(3), S).status).toBe('met')
    expect(rule_9_3_2_msResponsibleLecturer(person({ degree: 'ปริญญาโท', rank: 'ผศ.' }), journals(3), S).status).toBe('not_met')
  })
  it('9.3.2 doctorate with any rank qualifies', () => {
    expect(rule_9_3_2_msResponsibleLecturer(person({ rank: 'อาจารย์' }), journals(3), S).status).toBe('met')
  })
  it('9.3.3 (1) and 9.3.4 (1) follow 9.3.2', () => {
    const m = person({ degree: 'ปริญญาโท', rank: 'รศ.' })
    expect(rule_9_3_3_msMainAdvisor(m, journals(3), S).status).toBe('met')
    expect(rule_9_3_4_msInternalExaminer(m, journals(3), S).status).toBe('met')
    expect(rule_9_3_3_msMainAdvisor(person({ degree: 'ปริญญาโท', rank: 'อาจารย์' }), journals(3), S).status).toBe('not_met')
  })
  it('9.3.5 teacher needs 1 output of any kind', () => {
    const m = person({ degree: 'ปริญญาโท', rank: 'อาจารย์' })
    expect(rule_9_3_5_msTeacher(m, [pub({ isResearch: false })], S).status).toBe('met')
    expect(rule_9_3_5_msTeacher(m, [], S).status).toBe('not_met')
  })
})

describe('9.4 doctoral', () => {
  it('9.4.1 counts research outputs only: a review article does not count', () => {
    const pubs = [...journals(2), pub({ isResearch: false })]
    const r = rule_9_4_1_phdProgramLecturer(person(), pubs, S)
    expect(r.status).toBe('not_met')
    expect(r.counts.research).toBe(2)
  })
  it('9.4.1 met with exactly 3 research outputs', () => {
    expect(rule_9_4_1_phdProgramLecturer(person(), journals(3), S).status).toBe('met')
  })
  it('9.4.1 master’s + รศ. qualifies', () => {
    expect(rule_9_4_1_phdProgramLecturer(person({ degree: 'ปริญญาโท', rank: 'รศ.' }), journals(3), S).status).toBe('met')
  })
  it('9.4.2 master’s needs ศ.; รศ. is not enough', () => {
    expect(rule_9_4_2_phdResponsibleLecturer(person({ degree: 'ปริญญาโท', rank: 'ศ.' }), journals(3), S).status).toBe('met')
    expect(rule_9_4_2_phdResponsibleLecturer(person({ degree: 'ปริญญาโท', rank: 'รศ.' }), journals(3), S).status).toBe('not_met')
  })
  it('9.4.3 (1) and 9.4.4 (1) need 3 research outputs', () => {
    expect(rule_9_4_3_phdMainAdvisor(person(), journals(3), S).status).toBe('met')
    expect(rule_9_4_4_phdInternalExaminer(person(), journals(3, { isResearch: false }), S).status).toBe('not_met')
  })
  it('9.4.5 teacher: 1 output of any kind, doctorate or master’s + รศ.', () => {
    expect(rule_9_4_5_phdTeacher(person(), [pub({ isResearch: false })], S).status).toBe('met')
    expect(rule_9_4_5_phdTeacher(person({ degree: 'ปริญญาโท', rank: 'ผศ.' }), [pub()], S).status).toBe('not_met')
    expect(rule_9_4_5_phdTeacher(person({ degree: 'ปริญญาโท', rank: 'รศ.' }), [pub()], S).status).toBe('met')
  })
})

describe('9.1 / 9.2 graduate diplomas', () => {
  it('9.1.1 master’s, 3 outputs with 1 research', () => {
    expect(rule_9_1_1_gdProgramLecturer(person({ degree: 'ปริญญาโท', rank: 'อาจารย์' }), journals(3), S).status).toBe('met')
  })
  it('9.1.2 needs doctorate or master’s + รศ.', () => {
    expect(rule_9_1_2_gdResponsibleLecturer(person({ degree: 'ปริญญาโท', rank: 'ผศ.' }), journals(3), S).status).toBe('not_met')
  })
  it('9.1.3 teacher: master’s + 1 output', () => {
    expect(rule_9_1_3_gdTeacher(person({ degree: 'ปริญญาโท', rank: 'อาจารย์' }), [pub()], S).status).toBe('met')
  })
  it('9.2.1 needs doctorate or master’s + รศ.; 9.2.2 needs ศ. for master’s', () => {
    const m = person({ degree: 'ปริญญาโท', rank: 'รศ.' })
    expect(rule_9_2_1_hgdProgramLecturer(m, journals(3), S).status).toBe('met')
    expect(rule_9_2_2_hgdResponsibleLecturer(m, journals(3), S).status).toBe('not_met')
  })
  it('9.2.3 teacher: master’s + ผศ. is not enough', () => {
    expect(rule_9_2_3_hgdTeacher(person({ degree: 'ปริญญาโท', rank: 'ผศ.' }), [pub()], S).status).toBe('not_met')
  })
})

describe('poster switch', () => {
  const pubs = [...journals(2), pub({ type: 'poster' })]
  it('posters do not count when the switch is off', () => {
    const r = rule_9_3_1_msProgramLecturer(person(), pubs, S)
    expect(r.status).toBe('not_met')
    expect(r.counts.total).toBe(2)
  })
  it('posters count when the switch is on', () => {
    const r = rule_9_3_1_msProgramLecturer(person(), pubs, { ...S, countPosters: true })
    expect(r.status).toBe('met')
    expect(r.counts.total).toBe(3)
  })
  it('a full proceedings paper always counts', () => {
    expect(rule_9_3_1_msProgramLecturer(person(), [...journals(2), pub({ type: 'proceeding' })], S).status).toBe('met')
  })
})

describe('own degree and uncertainty', () => {
  it('an output marked part_of_own_degree never counts', () => {
    expect(rule_9_3_1_msProgramLecturer(person(), [...journals(2), pub({ ownDegree: true })], S).status).toBe('not_met')
  })
  it('an output within 2 years before the degree year needs review', () => {
    const p = person({ degreeYear: 2024 })
    const r = rule_9_3_1_msProgramLecturer(p, [...journals(2, { year: 2025 }), pub({ year: 2023 })], S)
    expect(r.status).toBe('needs_review')
  })
  it('override part_of_own_degree = no clears that flag', () => {
    const p = person({ degreeYear: 2024 })
    const r = rule_9_3_1_msProgramLecturer(p, [...journals(2, { year: 2025 }), pub({ year: 2023, ownDegree: false })], S)
    expect(r.status).toBe('met')
  })
  it('an uncertain classification gives needs review only when it decides the result', () => {
    expect(rule_9_3_1_msProgramLecturer(person(), [...journals(2), pub({ type: 'unknown', typeUncertain: true })], S).status).toBe('needs_review')
    expect(rule_9_3_1_msProgramLecturer(person(), [...journals(3), pub({ type: 'unknown', typeUncertain: true })], S).status).toBe('met')
  })
  it('an uncertain research flag gives needs review under 9.4', () => {
    expect(rule_9_4_1_phdProgramLecturer(person(), [...journals(2), pub({ isResearch: false, researchUncertain: true })], S).status).toBe('needs_review')
  })
  it('missing degree data gives needs review', () => {
    expect(qualifies(person({ degree: null }), 'master').ok).toBe('maybe')
    expect(rule_9_3_1_msProgramLecturer(person({ degree: null }), journals(3), S).status).toBe('needs_review')
  })
})

describe('new doctoral graduate (9.3.6 / 9.4.6)', () => {
  const fresh = person({ rank: 'อาจารย์', degreeYear: 2024 })
  it('may teach without outputs (needs review: "อาจารย์ใหม่" is undefined)', () => {
    const r = rule_9_3_5_msTeacher(fresh, [], S)
    expect(r.status).toBe('needs_review')
    expect(r.path).toBe('new_grad')
  })
  it('1 output within 2 years after graduating opens the other roles (needs review)', () => {
    const r = rule_9_3_1_msProgramLecturer(fresh, [pub({ year: 2026 })], S)
    expect(r.status).toBe('needs_review')
    expect(r.path).toBe('new_grad')
  })
  it('1 output 3 years after graduating does not satisfy any tier', () => {
    const p = person({ rank: 'อาจารย์', degreeYear: 2023 })
    expect(rule_9_3_1_msProgramLecturer(p, [pub({ year: 2026 })], S).status).toBe('not_met')
  })
  it('2 outputs within 4 years satisfies the second tier', () => {
    const p = person({ rank: 'อาจารย์', degreeYear: 2022 })
    const r = rule_9_3_2_msResponsibleLecturer(p, journals(2, { year: 2026 }), S)
    expect(r.path).toBe('new_grad')
  })
  it('9.4.6 needs research outputs: a review article does not open the path', () => {
    expect(rule_9_4_1_phdProgramLecturer(fresh, [pub({ year: 2026, isResearch: false })], S).status).toBe('not_met')
    expect(rule_9_4_1_phdProgramLecturer(fresh, [pub({ year: 2026 })], S).status).toBe('needs_review')
  })
  it('does not apply more than 5 years after graduating', () => {
    expect(rule_9_3_5_msTeacher(person({ degreeYear: 2020 }), [], S).status).toBe('not_met')
  })
  it('does not apply to master’s holders', () => {
    expect(rule_9_3_5_msTeacher(person({ degree: 'ปริญญาโท', degreeYear: 2025 }), [], S).status).toBe('not_met')
  })
})

describe('programme check', () => {
  const ppl = (k: number, programs: string[]) =>
    Array.from({ length: k }, (_, i) => person({ nameEn: `P${programs.join()}${i}`, programs }))
  const evalAll = (people: Faculty[], ok: boolean) =>
    people.map((p) => evaluatePerson(p, ok ? journals(3).map((x) => ({ ...x, key: p.nameEn })) : [], S))
  it('passes with at least 3 qualified responsible lecturers in the programme', () => {
    const res = evalAll(ppl(3, ['M.Sc.']), true)
    expect(programmeCheck('ms', res).status).toBe('met')
  })
  it('fails with only 2', () => {
    const res = [...evalAll(ppl(2, ['M.Sc.']), true), ...evalAll(ppl(1, ['Ph.D.']), false)]
    const c = programmeCheck('ms', res)
    expect(c.status).toBe('not_met')
    expect(c.met).toHaveLength(2)
  })
})

describe('strict mode (site setting)', () => {
  const T: Settings = { ...S, strict: true }
  it('an uncertain publication is not counted, so the role is not met instead of needs review', () => {
    const r = rule_9_3_1_msProgramLecturer(person(), [...journals(2), pub({ type: 'unknown', typeUncertain: true })], T)
    expect(r.status).toBe('not_met')
    expect(r.counts.totalPossible).toBe(2)
  })
  it('an output within 2 years before the degree year is not counted', () => {
    // master's holder, so the new-graduate clause does not apply
    const r = rule_9_3_1_msProgramLecturer(person({ degree: 'ปริญญาโท', degreeYear: 2024 }), [...journals(2, { year: 2025 }), pub({ year: 2023 })], T)
    expect(r.status).toBe('not_met')
  })
  it('missing degree data does not qualify', () => {
    expect(rule_9_3_1_msProgramLecturer(person({ degree: null }), journals(3), T).status).toBe('not_met')
  })
  it('the new-graduate clause is applied as written', () => {
    const r = rule_9_3_5_msTeacher(person({ rank: 'อาจารย์', degreeYear: 2024 }), [], T)
    expect(r.status).toBe('met')
    expect(r.path).toBe('new_grad')
  })
  it('treats an unconfirmed research flag as not research', () => {
    const p = person()
    const pubs = [...journals(2), pub({ researchUncertain: true })]
    expect(rule_9_4_1_phdProgramLecturer(p, pubs, T).status).toBe('not_met')
    expect(rule_9_4_1_phdProgramLecturer(p, pubs, S).status).toBe('needs_review')
  })
  it('never returns needs review', () => {
    const p = person({ degree: null, degreeYear: 2025 })
    const pubs = [pub({ type: 'unknown', typeUncertain: true }), pub({ researchUncertain: true, isResearch: false }), pub({ year: 2024 })]
    const all = [rule_9_3_1_msProgramLecturer, rule_9_3_2_msResponsibleLecturer, rule_9_3_5_msTeacher, rule_9_4_1_phdProgramLecturer, rule_9_4_5_phdTeacher]
    for (const f of all) expect(f(p, pubs, T).status).not.toBe('needs_review')
  })
})

describe('next-year risk', () => {
  const T: Settings = { ...S, strict: true }
  const mk = (years: number[], research = true) => years.map((y) => pub({ year: y, isResearch: research }))
  it('flags a role met now that depends on an output from the oldest window year', () => {
    const r = evaluatePerson(person(), mk([2022, 2024, 2025]).map((x) => ({ ...x, key: 'P' })), T)
    expect(r.roles.ms_program.status).toBe('met')
    expect(nextYearRisk(r, T).map((x) => x.id)).toContain('ms_program')
  })
  it('does not flag when the outputs are recent', () => {
    const r = evaluatePerson(person(), mk([2024, 2025, 2026]).map((x) => ({ ...x, key: 'P' })), T)
    expect(nextYearRisk(r, T)).toHaveLength(0)
  })
  it('does not flag roles that are already not met', () => {
    const r = evaluatePerson(person(), mk([2022]).map((x) => ({ ...x, key: 'P' })), T)
    expect(nextYearRisk(r, T).map((x) => x.id)).not.toContain('ms_program')
  })
})

