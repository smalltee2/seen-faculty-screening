import { describe, expect, it } from 'vitest'
import { outputRows } from './charts'
import { evaluatePerson, type Settings } from './rules'
import type { Faculty, Pub } from './types'

const S: Settings = { year: 2026, countPosters: false }
const person: Faculty = { nameEn: 'P', nameTh: 'พ', scholarId: '', rank: 'ผศ.', degree: 'ปริญญาเอก', degreeYear: 2005, programs: [], notes: '' }
let n = 0
const pub = (over: Partial<Pub> = {}): Pub => {
  n++
  return {
    line: n, key: 'P', year: 2025, title: `t${n}`, authors: '', venue: 'J 1 (1), 1-2', cites: 0, id: `P|t${n}`, titleNorm: `t${n}`,
    type: 'journal', typeReason: '', typeUncertain: false, isResearch: true, researchReason: '', researchUncertain: false,
    ownDegree: null, duplicates: 0, sources: ['scholar'], override: null, ...over,
  }
}

describe('outputRows', () => {
  it('counts duties awaiting a check apart from failed duties', () => {
    // Two sure journal articles and one of unknown type: the graduate duties wait for a check.
    const waiting = evaluatePerson(person, [pub(), pub(), pub({ type: 'unknown', typeUncertain: true })], S)
    const [row] = outputRows([waiting], S, 'grad', 'research')
    expect(row.review).toBeGreaterThan(0)
    expect(waiting.roles.ms_program.status).toBe('needs_review')
    // 9.3.1 (อาจารย์ประจำหลักสูตร ป.โท) waits for a check, so it is not among the failed duties.
    expect(row.failed).toBe(0)
  })
  it('a lecturer with no output fails and has nothing awaiting a check', () => {
    const [row] = outputRows([evaluatePerson(person, [], S)], S, 'grad', 'research')
    expect(row.failed).toBeGreaterThan(0)
    expect(row.review).toBe(0)
  })
})
