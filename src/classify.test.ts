import { describe, expect, it } from 'vitest'
import { classifyResearch, classifyRow, classifyType, dedupe, normalizeTitle, preparePubs } from './classify'
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
    ['Heliyon 9, e12019, 2023', 'journal'], // article number ending in a year-like digit run
    ['Science of the Total Environment 912, 142019, 2024', 'journal'],
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

describe('classifyRow on proceedings series and title words (review, 2026-11-07)', () => {
  it('an OpenAlex or Scopus "article in a journal" whose venue is a proceedings series is a proceeding', () => {
    expect(classifyRow(raw({ source: 'openalex', extType: 'article', sourceType: 'journal', venue: 'Materials Today: Proceedings 47, 3525-3528, 2021' })).type).toBe('proceeding')
    expect(classifyRow(raw({ source: 'openalex', extType: 'article', sourceType: 'journal', venue: 'E3S Web of Conferences 346, 01001, 2022' })).type).toBe('proceeding')
    expect(classifyRow(raw({ source: 'scopus', extType: 'Article', sourceType: 'Journal', venue: 'IOP Conference Series: Earth and Environmental Science 1234, 012001, 2023' })).type).toBe('proceeding')
    expect(classifyRow(raw({ source: 'openalex', extType: 'article', sourceType: 'journal', venue: 'Atmospheric Environment 300, 119000, 2023' })).type).toBe('journal')
  })
  it('"discussions" or "abstract" in a title does not exclude or demote a journal article', () => {
    expect(classifyType('Policy discussions on PM2.5 in Thailand', 'Atmospheric Environment 300, 119000, 2023').type).toBe('journal')
    expect(classifyType('Abstract reasoning about air quality', 'Atmospheric Environment 300, 119000, 2023').type).toBe('journal')
    expect(classifyType('A study', 'Atmospheric Chemistry and Physics Discussions 12, 1-20, 2023').type).toBe('exclude')
    expect(classifyType('A study', 'EGU General Assembly Abstracts 2023').type).toBe('poster')
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
  it('merges a Scholar title truncated with "…" into the full title from Scopus', () => {
    const full = 'Using excel solver’s parameter function in predicting and interpretation for kinetic adsorption model via batch experiments of lead removal'
    const rows = [
      raw({ source: 'scholar', title: full.slice(0, 120) + ' …' }),
      raw({ source: 'scopus', title: full, doi: '10.1/x' }),
    ]
    const out = dedupe(rows)
    expect(out).toHaveLength(1)
    expect(out[0].row.source).toBe('scopus')
  })
  it('does not merge a short truncated stem or one that belongs to another paper', () => {
    expect(dedupe([raw({ title: 'Rice yield …' }), raw({ title: 'Rice yield under climate change in Phayao' })])).toHaveLength(2)
    expect(dedupe([raw({ title: 'Projection of rice yield under climate change in northern Thailand …' }), raw({ title: 'Projection of maize yield under climate change in northern Thailand' })])).toHaveLength(2)
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

describe('structured sources', () => {
  const oa = (extType: string, sourceType: string, venue = 'Some Venue 1 (1), 1-2, 2024') => classifyRow(raw({ source: 'openalex', extType, sourceType, venue }))
  it('maps OpenAlex types', () => {
    expect(oa('article', 'journal').type).toBe('journal')
    expect(oa('review', 'journal').type).toBe('journal')
    expect(oa('article', 'conference').type).toBe('proceeding')
    expect(oa('article', 'conference', 'AGU Fall Meeting Abstracts 2024').type).toBe('poster')
    expect(oa('preprint', 'repository').type).toBe('exclude')
    expect(oa('book-chapter', 'book series').type).toBe('exclude')
    expect(oa('dissertation', '').type).toBe('exclude')
    expect(oa('article', 'repository').type).toBe('exclude')
  })
  it('maps Scopus subtypes', () => {
    const sc = (extType: string, sourceType: string) => classifyRow(raw({ source: 'scopus', extType, sourceType })).type
    expect(sc('Article', 'Journal')).toBe('journal')
    expect(sc('Conference Paper', 'Conference Proceeding')).toBe('proceeding')
    expect(sc('Book Chapter', 'Book')).toBe('exclude')
  })
  it('trusts the type chosen in the admin form', () => {
    expect(classifyRow(raw({ source: 'manual', extType: 'poster', venue: 'Anything, 2025' })).type).toBe('poster')
  })
  it('merges the same work from Scholar and OpenAlex and keeps the structured row', () => {
    const rows = [
      raw({ source: 'scholar', title: 'Heat Extremes in Asia', venue: 'Int J Climatol, 2025' }),
      raw({ source: 'openalex', title: 'Heat extremes in Asia', venue: 'International Journal of Climatology 45 (3), e8907, 2025', extType: 'article', sourceType: 'journal', doi: '10.1002/joc.8907' }),
    ]
    const [p] = preparePubs(rows, [])
    expect(p.source).toBe('openalex')
    expect(p.sources.sort()).toEqual(['openalex', 'scholar'])
    expect(p.type).toBe('journal')
  })
  it('merges by DOI when titles differ', () => {
    const rows = [
      raw({ source: 'openalex', title: 'Old title', doi: '10.1/x', extType: 'article', sourceType: 'journal' }),
      raw({ source: 'scopus', title: 'Revised title', doi: '10.1/X', extType: 'Article', sourceType: 'Journal' }),
    ]
    expect(dedupe(rows)).toHaveLength(1)
  })
  it('an override written for the Scholar title still applies after the merge', () => {
    const rows = [
      raw({ source: 'scholar', title: 'Scholar Title', venue: 'X, 2024' }),
      raw({ source: 'openalex', title: 'Different OpenAlex Title', doi: '10.1/y', extType: 'article', sourceType: 'journal' }),
      raw({ source: 'openalex', title: 'Scholar Title', doi: '10.1/y', extType: 'article', sourceType: 'journal' }),
    ]
    const [p] = preparePubs(rows, [{ key: 'A', titleNormalized: 'scholartitle', type: 'exclude', isResearch: null, ownDegree: null, note: '' }])
    expect(p.type).toBe('exclude')
  })
})

describe('errata', () => {
  it('a correction notice is not counted, from any source', () => {
    expect(classifyType('Correction to: effect of heating time', 'Silicon 15 (11), 4773-4774, 2023').type).toBe('exclude')
    const rows = [
      raw({ source: 'scholar', title: 'Correction to: X', venue: 'Silicon 15 (11), 4773-4774, 2023' }),
      raw({ source: 'openalex', title: 'Correction to: X', extType: 'erratum', sourceType: 'journal', doi: '10.1/c' }),
    ]
    expect(preparePubs(rows, [])[0].type).toBe('exclude')
  })
  it('recognises publisher wording without a colon', () => {
    for (const t of ['Author Correction: Heat and PM2.5 in Chiang Mai', 'Publisher Correction: Heat and PM2.5', 'Correction to “Heat and PM2.5 in Chiang Mai”', 'Erratum: Heat and PM2.5'])
      expect(classifyType(t, 'Scientific Reports 13, 1, 2023').type).toBe('exclude')
    expect(classifyType('Correction factors for PM2.5 monitors', 'Atmosphere 14 (1), 1, 2023').type).toBe('journal')
  })
})

describe('errata next to their original', () => {
  const orig = raw({ title: 'Effect of Adding Monohydrocalcite on the Microstructural Change in Cement Hydration', venue: 'ACS Omega 7 (41), 36318-36329, 2022', year: 2022 })
  const corr = raw({
    source: 'scopus', extType: 'Erratum', sourceType: 'Journal', year: 2023, venue: 'ACS Omega 8 (7), 7242, 2023',
    title: 'Correction: Effect of Adding Monohydrocalcite on the Microstructural Change in Cement Hydration (ACS Omega (2022) 7:41 (36318−36329) DOI: 10.1021/acsomega.2c03977)',
  })
  it('shows only the original article', () => {
    const out = preparePubs([orig, corr], [])
    expect(out).toHaveLength(1)
    expect(out[0].type).toBe('journal')
  })
  it('keeps an erratum whose original is not listed (shown as not counted)', () => {
    const out = preparePubs([corr], [])
    expect(out).toHaveLength(1)
    expect(out[0].type).toBe('exclude')
  })
  it('does not hide an erratum of another person', () => {
    expect(preparePubs([orig, { ...corr, key: 'B' }], [])).toHaveLength(2)
  })
})


describe('dedupe keeps a counted copy over a weak structured copy (2026-11-07)', () => {
  const base = { line: 1, key: 'A', year: 2015, authors: '', cites: 0 }
  it('a repository copy in OpenAlex does not override the Scholar journal row', () => {
    const scholar = { ...base, source: 'scholar' as const, title: 'Exergetic evaluation of renewability', venue: 'Environment and Natural Resources Journal 13 (1), 39-46' }
    const oa = { ...base, source: 'openalex' as const, title: 'Exergetic evaluation of renewability', venue: 'NRCT Data Center 13 (1), 39-46', extType: 'article', sourceType: 'repository', doi: '' }
    const [p] = preparePubs([scholar, oa], [])
    expect(p.type).toBe('journal')
  })
  it('a positive exclusion (book chapter) still wins over a Scholar row', () => {
    const scholar = { ...base, source: 'scholar' as const, title: 'Estimation of PM10', venue: 'Air Quality Handbook, 12-30' }
    const oa = { ...base, source: 'openalex' as const, title: 'Estimation of PM10', venue: 'CRC Press eBooks', extType: 'book-chapter', sourceType: 'book series', doi: '' }
    const [p] = preparePubs([scholar, oa], [])
    expect(p.type).toBe('exclude')
  })
})
