// Counting the five years by academic year (June–May) instead of calendar year (Tum, 2026-11-12).
import { describe, expect, it } from 'vitest'
import raw from './generated/data.json'
import { monthOfDate, preparePubs, pubMonthOf } from './classify'
import { academicWindow, evaluatePerson, inWindow, windowText, type Settings } from './rules'
import type { DataBundle, RawPub } from './types'

const cal: Settings = { year: 2026, countPosters: true, strict: true }
const aca: Settings = { ...cal, period: 'academic' }

describe('the month a work was published', () => {
  it('reads a month from a full or a year-month date', () => {
    expect(monthOfDate('2022-06-15')).toBe('2022-06')
    expect(monthOfDate('2022-06')).toBe('2022-06')
    expect(monthOfDate('2022-06-01')).toBe('2022-06')
  })
  it('does not read a month from a year, from 1 January, or from anything else', () => {
    for (const v of ['2022', '2022-01-01', '', undefined, null, '2022-13-01', '2022-00', 'June 2022', '22-06-15']) expect(monthOfDate(v)).toBe('')
    expect(monthOfDate('2022-01-02')).toBe('2022-01') // a real January date still counts
    expect(monthOfDate('2022-01')).toBe('2022-01')
  })
  it('takes the issue date before the online date', () => {
    const row = (o: Partial<RawPub>): RawPub => ({ line: 1, key: 'A B', year: 2022, title: 't', authors: '', venue: '', cites: 0, ...o })
    const scopus = row({ source: 'scopus', biblio: { date: '2022-07-01', volume: '', issue: '', pages: '', articleNumber: '' } })
    const openalex = row({ source: 'openalex', pubDate: '2022-03-10' })
    expect(pubMonthOf([openalex, scopus])).toBe('2022-07')
    expect(pubMonthOf([openalex], { published: '2022-05', publishedOnline: '2022-02-01' })).toBe('2022-05')
    expect(pubMonthOf([openalex], { published: '2022', publishedOnline: '2022-02-01' })).toBe('2022-03') // OpenAlex before Crossref online
    expect(pubMonthOf([row({})], { published: '', publishedOnline: '2021-12-20' })).toBe('2021-12')
    expect(pubMonthOf([row({ source: 'scopus', biblio: { date: '2022-01-01', volume: '', issue: '', pages: '', articleNumber: '' } })])).toBe('')
    expect(pubMonthOf([row({})])).toBe('')
  })
})

describe('five academic years', () => {
  it('run from June of Y−4 to May of Y+1', () => {
    expect(academicWindow(2026)).toEqual(['2022-06', '2027-05'])
    expect(windowText(aca)).toBe('มิ.ย. 2022 – พ.ค. 2027')
    expect(windowText(cal)).toBe('2022–2026')
  })
  it('count a work by its month when a source gives one', () => {
    const at = (pubMonth: string, year = Number(pubMonth.slice(0, 4))) => inWindow({ year, pubMonth }, aca)
    expect(at('2022-05')).toEqual({ in: false, monthUnknown: false }) // expired: published before June 2565
    expect(at('2022-06')).toEqual({ in: true, monthUnknown: false })
    expect(at('2026-12')).toEqual({ in: true, monthUnknown: false })
    expect(at('2027-05')).toEqual({ in: true, monthUnknown: false })
    expect(at('2027-06')).toEqual({ in: false, monthUnknown: false })
    expect(at('2021-12', 2022)).toEqual({ in: false, monthUnknown: false }) // the date decides, not the row's year
  })
  it('count a work with no month when its year could be inside, and say so for an edge year', () => {
    const y = (year: number | null) => inWindow({ year }, aca)
    expect(y(2021)).toEqual({ in: false, monthUnknown: false })
    expect(y(2022)).toEqual({ in: true, monthUnknown: true })
    expect(y(2023)).toEqual({ in: true, monthUnknown: false })
    expect(y(2026)).toEqual({ in: true, monthUnknown: false })
    expect(y(2027)).toEqual({ in: true, monthUnknown: true })
    expect(y(2028)).toEqual({ in: false, monthUnknown: false })
    expect(y(null)).toEqual({ in: false, monthUnknown: false })
  })
  it('leave calendar counting as it was, with or without a month', () => {
    expect(inWindow({ year: 2022, pubMonth: '2022-01' }, cal)).toEqual({ in: true, monthUnknown: false })
    expect(inWindow({ year: 2021, pubMonth: '2021-12' }, cal)).toEqual({ in: false, monthUnknown: false })
    expect(inWindow({ year: 2027, pubMonth: '2027-03' }, cal)).toEqual({ in: false, monthUnknown: false })
    expect(inWindow({ year: 2026 }, { ...cal, period: 'calendar' })).toEqual({ in: true, monthUnknown: false })
  })
  it('on the real data, differ from calendar counting only through the edge years', () => {
    const data = raw as unknown as DataBundle
    const pubs = preparePubs(data.publications, data.overrides, data.conferences ?? [], data.crossref ?? [])
    for (const f of data.faculty) {
      const a = evaluatePerson(f, pubs, { ...aca, screenConferences: data.conferenceScreening === 'on' })
      const c = evaluatePerson(f, pubs, { ...cal, screenConferences: data.conferenceScreening === 'on' })
      const ids = (r: typeof a) => new Set(r.roles.ms_program.used.map((e) => e.pub.id))
      const [ai, ci] = [ids(a), ids(c)]
      const differ = a.pubs.filter((p) => ai.has(p.id) !== ci.has(p.id))
      for (const p of differ) expect([2021, 2022, 2027]).toContain(p.pubMonth ? Number(p.pubMonth.slice(0, 4)) : p.year)
      expect(a.roles.ms_program.window).toEqual([2022, 2027])
      expect(c.roles.ms_program.window).toEqual([2022, 2026])
    }
  })
})
