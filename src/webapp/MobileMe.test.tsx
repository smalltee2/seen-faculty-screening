import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import raw from '../generated/data.json'
import { preparePubs } from '../classify'
import { evaluatePerson, type Settings } from '../rules'
import type { DataBundle } from '../types'
import { MobileMe, shortReason, venueShort, whenShort } from './MobileMe'

describe('phone layout of the personal page', () => {
  it('shows the month and year of a work briefly, or the year alone', () => {
    expect(whenShort({ year: 2026, pubMonth: '2026-06' })).toBe('มิ.ย. 69')
    expect(whenShort({ year: 2026, pubMonth: '2027-01' })).toBe('ม.ค. 70')
    expect(whenShort({ year: 2022 })).toBe('2565')
    expect(whenShort({ year: null })).toBe('–')
  })
  it('keeps the venue name and drops the volume, pages and year Scholar adds', () => {
    expect(venueShort('Sustainability 18 (21), 11212, 2026')).toBe('Sustainability')
    expect(venueShort('Journal of Hydrology 681, 136603, 2026')).toBe('Journal of Hydrology')
    expect(venueShort('Earth Systems and Environment')).toBe('Earth Systems and Environment')
    expect(venueShort('')).toBe('')
  })
  it('says what a duty needs and has, without the period', () => {
    const r = shortReason(['คุณวุฒิ: ปริญญาโท', 'ต้องการ ผลงาน ≥ 3 เรื่อง (วิจัย ≥ 1) ในปี มิ.ย. 2022 – พ.ค. 2027; มีผลงาน 2, วิจัย 2'])
    expect(r).toBe('ต้องการ ผลงาน ≥ 3 เรื่อง (วิจัย ≥ 1); มีผลงาน 2, วิจัย 2')
  })
  it('renders the summary, the levels and the counted works of a lecturer', () => {
    const data = raw as unknown as DataBundle
    const s: Settings = { year: 2026, period: 'academic', countPosters: true, strict: true, screenConferences: data.conferenceScreening === 'on' }
    const pubs = preparePubs(data.publications, data.overrides, data.conferences ?? [], data.crossref ?? [])
    const f = data.faculty.find((x) => x.nameEn === 'Teerachai Amnuaylojaroen')!
    const r = evaluatePerson(f, pubs, s)
    const html = renderToStaticMarkup(<MobileMe result={r} settings={s} email="a@up.ac.th" onLogout={() => {}} mine={[]} addWork={<form />} />)
    expect(html).toContain(`<b>${r.roles.ms_program.counts.total}</b>`)
    expect(html).toContain('ป.ตรี')
    expect(html).toContain('ป.เอก')
    expect(html.match(/class="mme-work"/g)?.length).toBe(r.roles.ms_program.used.length + r.roles.ms_program.uncertain.length)
    expect(html).toContain('เพิ่มผลงาน')
    // Less text than the desktop page: no English role names, no reason column.
    expect(html).not.toContain('Programme lecturer')
    expect(html).not.toContain('เหตุผล (Reason)')
  })
})
