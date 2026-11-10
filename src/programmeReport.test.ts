import { describe, expect, it } from 'vitest'
import data from './generated/data.json'
import { preparePubs } from './classify'
import { ROLES, evaluatePerson, type Settings } from './rules'
import { programmeReport, reportHtml, workLine } from './programmeReport'
import type { DataBundle, Pub } from './types'

const bundle = data as unknown as DataBundle
const S: Settings = { year: 2026, countPosters: true, strict: true, screenConferences: bundle.conferenceScreening === 'on' }
const pubs = preparePubs(bundle.publications, bundle.overrides, bundle.conferences ?? [])
const results = bundle.faculty.map((f) => evaluatePerson(f, pubs, S))
const programmes = bundle.programmes ?? []

describe('programmeReport (bundled data)', () => {
  it('has programmes to report on', () => {
    expect(programmes.length).toBeGreaterThan(0)
  })
  it('gives every member a status for each duty of the level, equal to the evaluation', () => {
    for (const prog of programmes) {
      const rep = programmeReport(prog, results, S)
      expect(rep.roles.map((r) => r.id)).toEqual(ROLES.filter((r) => r.level === prog.level).map((r) => r.id))
      expect(rep.rows).toHaveLength(prog.members.length)
      for (const row of rep.rows) {
        const r = results.find((x) => x.person.nameEn === row.member.nameEn)
        for (const role of rep.roles) expect(row.statuses[role.id]).toBe(r ? r.roles[role.id].status : null)
        // every listed work is counted by at least one duty, once, and lies in the window
        expect(new Set(row.works.map((p) => p.id)).size).toBe(row.works.length)
        for (const p of row.works) {
          expect(rep.roles.some((role) => r!.roles[role.id].used.some((e) => e.pub.id === p.id))).toBe(true)
          expect(p.year).toBeGreaterThanOrEqual(rep.window[0])
          expect(p.year).toBeLessThanOrEqual(rep.window[1])
        }
        expect(row.failed.map((f) => f.role.id)).toEqual(rep.roles.filter((role) => r && r.roles[role.id].status !== 'met').map((role) => role.id))
      }
      const named = rep.rows.filter((x) => x.member.responsible)
      const pool = named.length ? named : rep.rows
      expect(rep.responsible.pool).toBe(pool.length)
      expect(rep.responsible.met).toBe(pool.filter((x) => x.statuses[rep.level.responsible] === 'met').length)
    }
  })
})

describe('reportHtml', () => {
  const reps = programmes.map((p) => programmeReport(p, results, S))
  const html = reportHtml(reps, { year: 2026, builtAt: bundle.builtAt, faculty: 'คณะพลังงานและสิ่งแวดล้อม มหาวิทยาลัยพะเยา' })
  it('is a Word-readable document in TH SarabunPSK with one section per programme', () => {
    expect(html).toContain("font-family: 'TH SarabunPSK'")
    expect(html).toContain('urn:schemas-microsoft-com:office:word')
    for (const p of programmes) expect(html).toContain(p.th.replace(/&/g, '&amp;'))
    expect(html.split('page-break-before:always').length - 1).toBe(programmes.length - 1)
    expect(html).toContain('พ.ศ. 2565–2569')
  })
  it('escapes text from the data', () => {
    const p = { authors: 'A <b>', year: 2025, title: 'x & y', venue: 'V', doi: 'https://doi.org/10.1/abc' } as Pub
    expect(workLine(p)).toBe('A <b>. (2025). x & y. V. https://doi.org/10.1/abc')
    expect(html).not.toMatch(/<script/i)
  })
})
