import { describe, expect, it } from 'vitest'
import { evaluatePerson, type Settings } from './rules'
import { leavingWorks, outlook, outlookFor } from './outlook'
import type { Faculty, Pub } from './types'

const S: Settings = { year: 2026, countPosters: false, strict: true }
const person = (over: Partial<Faculty> = {}): Faculty => ({
  nameEn: 'P', nameTh: 'พ', scholarId: '', rank: 'ผศ.', degree: 'ปริญญาเอก', degreeYear: 2005, programs: [], notes: '', ...over,
})
let n = 0
const pub = (year: number | null, over: Partial<Pub> = {}): Pub => {
  n++
  return {
    line: n, key: 'P', year, title: `t${n}`, authors: '', venue: 'J 1 (1), 1-2', cites: 0, id: `P|t${n}`, titleNorm: `t${n}`,
    type: 'journal', typeReason: '', typeUncertain: false, isResearch: true, researchReason: '', researchUncertain: false,
    ownDegree: null, duplicates: 0, sources: ['scholar'], override: null, ...over,
  }
}
const run = (years: (number | null)[], p = person(), over: Partial<Pub> = {}) =>
  evaluatePerson(p, years.map((y) => pub(y, { key: p.nameEn, ...over })), S)
const of = (r: ReturnType<typeof run>, id: string, horizon = 2) => outlookFor(r, S, horizon).find((x) => x.role.id === id)

describe('outlookFor', () => {
  it('reports the first year a duty is lost and the works short', () => {
    // window 2026 = 2022–2026 (3 works); 2027 = 2023–2027 (2 works)
    const o = of(run([2022, 2024, 2025]), 'ms_program')!
    expect(o.lostIn).toBe(2027)
    expect(o.shortOutputs).toBe(1)
    expect(o.shortResearch).toBe(0)
    expect(o.need).toBe(1)
    expect(o.leaving.map((p) => p.year)).toEqual([2022])
    expect(o.reason).not.toContain('คุณวุฒิ')
  })
  it('looks two years ahead', () => {
    // 2027 = 2023–2027 still 3 works; 2028 = 2024–2028 has 2
    const r = run([2023, 2024, 2025])
    expect(of(r, 'ms_program', 1)).toBeUndefined()
    const o = of(r, 'ms_program')!
    expect(o.lostIn).toBe(2028)
    expect(o.need).toBe(1)
    expect(o.leaving.map((p) => p.year)).toEqual([2023])
  })
  it('is empty when the works are recent, and for duties not met now', () => {
    expect(outlookFor(run([2024, 2025, 2026]), S)).toHaveLength(0)
    expect(of(run([2022]), 'ms_program')).toBeUndefined()
  })
  it('counts research works for the doctoral duties', () => {
    const o = of(run([2022, 2022, 2025]), 'phd_program')!
    expect(o.lostIn).toBe(2027)
    expect(o.shortOutputs).toBe(0)
    expect(o.shortResearch).toBe(2)
    expect(o.need).toBe(2)
  })
  it('separates the research shortfall from the total', () => {
    // three works, the only research one is from 2022
    const p = person()
    const r = evaluatePerson(p, [pub(2022), pub(2025, { isResearch: false }), pub(2025, { isResearch: false }), pub(2026, { isResearch: false })], S)
    const o = of(r, 'ms_program')!
    expect(o.shortOutputs).toBe(0)
    expect(o.shortResearch).toBe(1)
    expect(o.need).toBe(1)
  })
  it('does not use works dated after the evaluation year', () => {
    // a 2027 work is not in the 2026 window and is not assumed for 2027 either
    const o = of(run([2022, 2024, 2025, 2027]), 'ms_program')!
    expect(o.lostIn).toBe(2027)
  })
  it('flags a new graduate whose clause runs out', () => {
    // doctorate 2021: a new lecturer through 2026 (Y − D ≤ 5), not in 2027
    const r = evaluatePerson(person({ degreeYear: 2021, rank: 'อาจารย์' }), [], S)
    expect(r.roles.ms_teacher.status).toBe('met')
    expect(r.roles.ms_teacher.path).toBe('new_grad')
    const o = outlookFor(r, S).find((x) => x.role.id === 'ms_teacher')!
    expect(o.lostIn).toBe(2027)
    expect(o.path).toBe('new_grad')
    expect(o.need).toBe(1)
    expect(o.leaving).toHaveLength(0)
  })
})

describe('outlook', () => {
  it('lists only people at risk, soonest first', () => {
    const a = run([2023, 2024, 2025], person({ nameEn: 'A' }))
    const b = run([2022, 2024, 2025], person({ nameEn: 'B' }))
    const c = run([2024, 2025, 2026], person({ nameEn: 'C' }))
    const list = outlook([a, b, c], S)
    expect(list.map((x) => x.result.person.nameEn)).toEqual(['B', 'A'])
    expect(list[0].firstYear).toBe(2027)
    expect(list[1].firstYear).toBe(2028)
  })
})

describe('leavingWorks', () => {
  it('lists a work counted for several duties once, oldest first', () => {
    const a = pub(2022, { titleNorm: 'same' })
    const b = pub(2021, { titleNorm: 'same' }) // same title, other source row
    const c = pub(2021, { titleNorm: 'other' })
    expect(leavingWorks([{ leaving: [a, c] }, { leaving: [b, a] }]).map((w) => w.titleNorm)).toEqual(['other', 'same'])
  })
  it('is empty when nothing leaves', () => {
    expect(leavingWorks([{ leaving: [] }])).toEqual([])
  })
})
