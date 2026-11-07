import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import data from './generated/data.json'
import { ProgrammePanel } from './ProgrammePanel'
import { evaluatePerson } from './rules'
import type { DataBundle as Bundle } from './types'

const bundle = data as unknown as Bundle
const S = { year: 2026, countPosters: false }
const results = bundle.faculty.map((p) => evaluatePerson(p, [], S))

describe('programmes.csv / ProgrammePanel', () => {
  it('lists the seven programmes and covers every lecturer', () => {
    const progs = bundle.programmes ?? []
    expect(progs.map((p) => [p.id, p.members.length])).toEqual([
      ['beng-enveng', 5], ['bsc-eem', 9], ['meng-enveng', 3], ['msc-emcc', 4], ['meng-emi', 3], ['phd-emi', 3], ['phd-emcc', 5],
    ])
    const listed = new Set(progs.flatMap((p) => p.members.map((m) => m.nameEn)))
    expect(bundle.faculty.filter((f) => !listed.has(f.nameEn)).map((f) => f.nameEn)).toEqual([])
  })

  it('renders each member with role, contact and the level duty', () => {
    const prog = bundle.programmes!.find((p) => p.id === 'phd-emcc')!
    const html = renderToStaticMarkup(<ProgrammePanel programme={prog} results={results} />)
    expect(html).toContain('สาขาเทคโนโลยีการจัดการสิ่งแวดล้อม')
    expect(html).toContain('ข้อ 9.4.2')
    expect(html).toContain('สิทธิชัย พิมลศรี')
    expect(html).toContain('sukthai.po@up.ac.th')
    expect((html.match(/<tr>/g) ?? []).length).toBe(1 + prog.members.length)
  })
})
