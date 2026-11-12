import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import raw from '../generated/data.json'
import { preparePubs } from '../classify'
import { evaluatePerson, nextYearRisk, type Settings } from '../rules'
import { SHOWN_ROLES, isShownLevel } from '../ui'
import type { DataBundle } from '../types'
import { MobileLecturers, lecturerRows } from './MobileLecturers'
import { MobileMe } from './MobileMe'

const data = raw as unknown as DataBundle
const s: Settings = { year: 2026, period: 'academic', countPosters: true, strict: true, screenConferences: data.conferenceScreening === 'on' }
const pubs = preparePubs(data.publications, data.overrides, data.conferences ?? [], data.crossref ?? [])
const results = data.faculty.map((f) => evaluatePerson(f, pubs, s))

describe('phone layout of the lecturer list', () => {
  const rows = lecturerRows(results, s)
  it('has one row per lecturer with the same counts as the rules', () => {
    expect(rows).toHaveLength(results.length)
    for (const r of results) {
      const row = rows.find((x) => x.nameEn === r.person.nameEn)!
      expect(row.passed + row.failed).toBe(SHOWN_ROLES.length)
      expect(row.failed).toBe(SHOWN_ROLES.filter((x) => r.roles[x.id].status !== 'met').length)
      expect(row.risk).toBe(nextYearRisk(r, s).filter((x) => isShownLevel(x.level)).length)
      expect(row.counted).toBe(r.roles[SHOWN_ROLES[0].id].counts.total)
    }
  })
  it('lists lecturers failing a duty first, then those at risk next year', () => {
    const group = (r: (typeof rows)[number]) => (r.failed > 0 ? 0 : r.risk > 0 ? 1 : 2)
    expect(rows.map(group)).toEqual([...rows.map(group)].sort((a, b) => a - b))
  })
  it('renders a link to each lecturer, and only the failing ones under that filter', () => {
    const all = renderToStaticMarkup(<MobileLecturers results={results} settings={s} />)
    expect(all.match(/href="#\/person\//g)).toHaveLength(results.length)
    const failing = renderToStaticMarkup(<MobileLecturers results={results} settings={s} filter="not_met" />)
    expect(failing.match(/href="#\/person\//g) ?? []).toHaveLength(rows.filter((r) => r.failed > 0).length)
    expect(all).toContain(`ไม่ผ่าน ${rows.filter((r) => r.failed > 0).length}`)
  })
  it('a chair sees a lecturer without the sign-out and add-work controls, with a way back', () => {
    const html = renderToStaticMarkup(<MobileMe result={results[0]} settings={s} back="#/lecturers" />)
    expect(html).toContain('href="#/lecturers"')
    expect(html).not.toContain('mme-fab')
    expect(html).not.toContain('mme-logout')
  })
})
