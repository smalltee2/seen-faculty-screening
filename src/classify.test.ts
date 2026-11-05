import { describe, expect, it } from 'vitest'
import { classifyResearch, classifyType, dedupe, normalizeTitle, preparePubs } from './classify'
import type { RawPub } from './types'

const raw = (over: Partial<RawPub>): RawPub => ({
  line: 2, key: 'A', year: 2024, title: 'Some study', authors: 'A', venue: 'Some Journal 1 (2), 3-4, 2024', cites: 0, ...over,
})

describe('normalizeTitle', () => {
  it('ignores case, punctuation and spacing', () => {
    expect(normalizeTitle('Long range transport of PM2. 5')).toBe(normalizeTitle('Long-range transport of PM2.5'))
  })
  it('keeps Thai characters and unifies sara am (ำ vs ํา, common in Scholar)', () => {
    expect(normalizeTitle('การจำลอง  ฝุ่น PM2.5')).toBe(normalizeTitle('การจําลองฝุ่น pm2.5'))
    expect(normalizeTitle('ฝุ่น PM2.5')).toMatch(/^ฝุ่นpm25$/)
  })
})

describe('classifyType', () => {
  const t = (venue: string, title = 'A study') => classifyType(title, venue)
  it.each([
    ['Sustainability 12 (23), 10049, 2020', 'journal'],
    ['Atmospheric Chemistry and Physics 14 (23), 12983-13012, 2014', 'journal'],
    ['Advances in Meteorology 2023, 5580606, 2023', 'journal'],
    ['Geophysical Research Letters, e2022GL100223, 2022', 'journal'],
    ['IOP Conference Series: Earth and Environmental Science 1100 (1), 012001, 2023', 'proceeding'],
    ['E3S Web of Conferences 346, 01001, 2022', 'proceeding'],
    ['AIP Conference Proceedings 2681 (1), 2023', 'proceeding'],
    ['การประชุมวิชาการระดับชาติ ครั้งที่ 10, 2565', 'proceeding'],
    ['AGU Fall Meeting Abstracts 2020, A203-10, 2020', 'poster'],
    ['EGU General Assembly Conference Abstracts, 2021', 'poster'],
    ['arXiv preprint arXiv:2101.00001, 2021', 'exclude'],
    ['Research Square, 2024', 'exclude'],
    ['Springer, 2018', 'exclude'],
    ['CRC Press, 2021', 'exclude'],
    ['PhD Thesis, University of Example, 2015', 'exclude'],
    ['US Patent 10,000,000, 2020', 'exclude'],
    ['Zenodo, 2023', 'exclude'],
    ['', 'exclude'],
  ])('%s → %s', (venue, type) => {
    const r = t(venue)
    expect(r.type).toBe(type)
    expect(r.uncertain).toBe(false)
  })
  it.each([
    ['International Journal of Environmental Technology and Management 7 (3-4 …, 2007', 'journal', false],
    ['เชียงใหม่: บัณฑิต วิทยาลัย มหาวิทยาลัย เชียงใหม่, 2553, 0', 'exclude', false],
    ['Chiang Mai: Graduate School, Chiang Mai University, 2006, 2006', 'exclude', false],
    ['Thailand Science Research and Innovation, 2019', 'exclude', false],
    ['สํา นักงาน คณะ กรรมการ ส่งเสริม วิทยาศาสตร์ วิจัย และ นวัตกรรม, 2018', 'exclude', false],
    ['旭硝子財団助成成果報告書 (Web) 2013, 90, 2013', 'exclude', false],
    ['Cuvillier Verlag, 2007', 'exclude', false],
    ['2024 Geoinformatics for Spatial-Infrastructure Development in Earth and …, 2024', 'proceeding', true],
    ['มหาวิทยาลัย พะเยา, 0', 'exclude', true],
  ])('real Scholar venue %s → %s (uncertain %s)', (venue, type, uncertain) => {
    expect(t(venue)).toMatchObject({ type, uncertain })
  })
  it('flags a journal name without volume/pages as uncertain', () => {
    expect(t('International Journal of Climatology, 2025')).toMatchObject({ type: 'journal', uncertain: true })
  })
  it('treats "<book>, 233-254" as a probable chapter, uncertain', () => {
    expect(t('Vegetation Fires and Pollution in Asia, 531-544, 2023')).toMatchObject({ type: 'exclude', uncertain: true })
  })
  it('sends unrecognised venues to review', () => {
    expect(t('Earth Systems and Environment 2026, 2026')).toMatchObject({ type: 'unknown', uncertain: true })
  })
  it('detects preprints from the title too', () => {
    expect(t('F1000Research 12, 2023', 'Phone use [version 1; peer review: awaiting peer review]').type).toBe('exclude')
  })
})

describe('classifyResearch', () => {
  it('marks review articles as not research', () => {
    expect(classifyResearch('A review of air quality models', 'J 1 (2), 1-2')).toMatchObject({ isResearch: false, uncertain: false })
  })
  it('marks Thai academic articles as not research', () => {
    expect(classifyResearch('บทความวิชาการ เรื่อง ฝุ่น', 'วารสาร 1 (1), 1-5').isResearch).toBe(false)
  })
  it('counts systematic reviews, meta-analyses and perspectives as research (policy 2026-11-05)', () => {
    expect(classifyResearch('X: a systematic review and meta-analysis', '')).toMatchObject({ isResearch: true, uncertain: false })
    expect(classifyResearch('A machine learning perspective on drought', '')).toMatchObject({ isResearch: true, uncertain: false })
    expect(classifyResearch('Trends in X', 'Critical Reviews in Environmental Science 41 (13), 1231')).toMatchObject({ isResearch: true, uncertain: false })
  })
  it('defaults to research', () => {
    expect(classifyResearch('Trends of ozone over Asia', 'ACP 1 (1), 1-2')).toMatchObject({ isResearch: true, uncertain: false })
  })
})

describe('dedupe', () => {
  it('keeps the richest version of a duplicated title', () => {
    const rows = [
      raw({ title: 'Projection of rice in Thailand', venue: 'Research Square, 2021' }),
      raw({ title: 'Projection of Rice in Thailand.', venue: 'Agriculture 11 (1), 23, 2021' }),
    ]
    const out = dedupe(rows)
    expect(out).toHaveLength(1)
    expect(out[0].row.venue).toBe('Agriculture 11 (1), 23, 2021')
    expect(out[0].duplicates).toBe(1)
  })
  it('does not merge the same title across different people', () => {
    expect(dedupe([raw({ key: 'A' }), raw({ key: 'B' })])).toHaveLength(2)
  })
})

describe('preparePubs + overrides', () => {
  it('overrides win over automatic classification', () => {
    const [p] = preparePubs([raw({ venue: 'Research Square, 2024' })], [
      { key: 'A', titleNormalized: 'Some study', type: 'journal', isResearch: false, ownDegree: true, note: 'x' },
    ])
    expect(p).toMatchObject({ type: 'journal', typeUncertain: false, isResearch: false, researchUncertain: false, ownDegree: true })
  })
  it('matches overrides by normalised title', () => {
    const [p] = preparePubs([raw({ title: 'Some Study!' })], [
      { key: 'A', titleNormalized: 'somestudy', type: 'exclude', isResearch: null, ownDegree: null, note: '' },
    ])
    expect(p.type).toBe('exclude')
  })
})
