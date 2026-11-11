// Tests for the bugs fixed in the full code review of 2026-11-11, one per fix that a unit test fits.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dedupe, normDoi } from './classify'
import { applyConfDecisions, fetchConfDecisions, type ConfDecisionItem } from './confDecisions'
import type { ConferenceMatch } from './conferences'
import { api } from './emailLogin'
import { authorList, parseVenue } from './exportScopus'
import { groupNewWorks, unseen } from './newWorks'
import { conferenceGroups } from './pending'
import { newScholarRows, parseScholarTsv } from './scholarImport'
import { buildTciIndex, inScopusJournal, matchTci } from './tci'
import type { ConferenceEntry, NewWork, Pub, RawPub, TciJournal } from './types'
import { parseWebAppHash } from './webapp/WebApp'
import { byWhenAsc, byWhenDesc, whenMs } from './when'
import { firstSeen, normTitle, utcIso } from '../scripts/new-works.mjs'
import { BlockedError, checkLayout } from '../scripts/fetch-scholar.mjs'
import code from '../apps-script/Code.gs?raw'

// The same instant written two ways, and one 20 minutes later that sorts first as text.
const BKK = '2026-11-11T06:10:00+07:00' // 2026-11-10T23:10Z
const UTC_LATER = '2026-11-10T23:30:00Z'

describe('times with different offsets are compared as instants', () => {
  it('whenMs reads both forms and gives 0 for text that is not a time', () => {
    expect(whenMs(BKK)).toBe(Date.parse('2026-11-10T23:10:00Z'))
    expect(whenMs('')).toBe(0)
    expect(whenMs(undefined)).toBe(0)
    expect(whenMs('yesterday')).toBe(0)
  })
  it('sorts by instant, not by text', () => {
    expect([BKK, UTC_LATER].sort()).toEqual([UTC_LATER, BKK]) // text order is wrong
    expect([BKK, UTC_LATER].sort(byWhenDesc)).toEqual([UTC_LATER, BKK])
    expect([UTC_LATER, BKK].sort(byWhenAsc)).toEqual([BKK, UTC_LATER])
  })
  it('utcIso (scripts/new-works.mjs) rewrites a commit time in UTC and leaves other text alone', () => {
    expect(utcIso(BKK)).toBe('2026-11-10T23:10:00.000Z')
    expect(utcIso('d1')).toBe('d1')
  })
})

describe('DOI as a key', () => {
  it('drops the resolver prefix and the case', () => {
    expect(normDoi('https://doi.org/10.1016/J.X.2026.1')).toBe('10.1016/j.x.2026.1')
    expect(normDoi('http://dx.doi.org/10.1/a')).toBe('10.1/a')
    expect(normDoi('doi: 10.1/A')).toBe('10.1/a')
    expect(normDoi(' 10.1/a ')).toBe('10.1/a')
    expect(normDoi(undefined)).toBe('')
  })
  it('dedupe joins a row whose DOI is written as a link with the bare one', () => {
    const row = (title: string, doi: string): RawPub => ({ key: 'A', year: 2025, title, authors: '', venue: 'J 1 (1), 1-2', cites: 0, doi }) as RawPub
    const out = dedupe([row('A study of haze', 'https://doi.org/10.1/X'), row('Haze: a study (preprint title)', '10.1/x')])
    expect(out).toHaveLength(1)
    expect(out[0].members).toHaveLength(2)
  })
})

describe('ISSN cells without digits', () => {
  const tci: TciJournal[] = [{ nameEng: 'Journal Without An ISSN', nameLocal: '', abbrev: '', issn: '-', eissn: 'n/a', tier: '1', status: 'active' }]
  const idx = buildTciIndex(tci, [{ issn: '-', name: 'Scopus Journal Without An ISSN' }])
  it('match nothing', () => {
    expect(inScopusJournal({ venue: 'Some other venue 1 (1), 2025', issn: '-' }, idx)).toBe(false)
    expect(inScopusJournal({ venue: 'Some other venue 1 (1), 2025', issn: '1234-5678;—' }, idx)).toBe(false)
    expect(matchTci({ venue: 'Some other venue 1 (1), 2025', issn: '-' }, idx)).toBeNull()
  })
  it('the journal is still found by its name', () => {
    expect(matchTci({ venue: 'Journal Without An ISSN 3 (1), 1-9, 2025', issn: '' }, idx)?.by).toBe('name')
  })
})

describe('Scholar paste', () => {
  it('year 0 is a work without a year, not a bad line', () => {
    const { rows, bad } = parseScholarTsv('A B\t0\tA work with no year\tA B\tSome venue\t0')
    expect(bad).toBe(0)
    expect(rows[0].year).toBeNull()
  })
  it('a full title is not new when the system holds the same title cut with "…"', () => {
    const known = [{ key: 'A B', title: 'Seasonal variation of fine particulate matter over northern Thailand during the biomass …' }]
    const { rows } = parseScholarTsv('A B\t2025\tSeasonal variation of fine particulate matter over northern Thailand during the biomass burning season\tA B\tJ\t0')
    expect(newScholarRows(rows, 'A B', known)).toEqual([])
  })
})

describe('conference decisions', () => {
  const entry = (key: string): ConferenceEntry => ({
    key, displayName: key, conferenceName: key, organiser: '', association: '', associationRole: 'unknown', field: '', relatedField: 'unknown',
    confidence: 'low', evidenceUrl: '', checkedAt: '', checkedBy: 'claude', note: '', decision: '', decidedBy: '', decidedAt: '', decisionNote: '',
  })
  const item = (key: string, decision: ConfDecisionItem['decision'], at: string): ConfDecisionItem => ({ key, decision, at, by: 'ผู้ดูแลระดับ 2', note: '', name: 'Conf' })
  it('a key listed twice in the register gets the decision on both rows and no extra row', () => {
    const out = applyConfDecisions([entry('venue:a'), entry('venue:a')], [item('venue:a', 'count', UTC_LATER)])
    expect(out.map((e) => e.decision)).toEqual(['count', 'count'])
  })
  it('the latest press wins when the times carry different offsets', () => {
    const out = applyConfDecisions([entry('venue:a')], [item('venue:a', 'count', UTC_LATER), item('venue:a', 'no_count', BKK)])
    expect(out[0].decision).toBe('count')
  })
})

describe('conferences to check', () => {
  let n = 0
  const conf = (key: string): ConferenceMatch => ({ entry: null, key, verdict: 'pending', reason: '', by: 'none' as ConferenceMatch['by'] })
  const pub = (year: number, key: string): Pub => {
    n++
    return {
      line: n, key: 'P', year, title: `t${n}`, authors: '', venue: 'Conf', cites: 0, id: `P|t${n}`, titleNorm: `t${n}`,
      type: 'proceeding', typeReason: '', typeUncertain: false, isResearch: true, researchReason: '', researchUncertain: false,
      ownDegree: null, duplicates: 0, sources: ['scholar'], override: null, conference: conf(key),
    }
  }
  it('are ordered by their newest work, whichever row comes first', () => {
    const g = conferenceGroups([pub(2022, 'a'), pub(2025, 'b'), pub(2026, 'a')], [], 2022)
    expect(g.map((x) => x.match.key)).toEqual(['a', 'b'])
  })
})

describe('Scopus export, venue text', () => {
  it('drops the year Scholar puts last when it is one off the work year, or the work has no year', () => {
    expect(parseVenue('Atmosphere 16 (2), 100, 2025', 2024)).toMatchObject({ source: 'Atmosphere', volume: '16', issue: '2', artNo: '100' })
    expect(parseVenue('Atmosphere 16 (2), 100, 2025', null)).toMatchObject({ source: 'Atmosphere', volume: '16', issue: '2', artNo: '100' })
  })
  it('reads lettered page ranges, counting pages only when the letters agree', () => {
    expect(parseVenue('Journal 12 (S1), S12-S20, 2025', 2025)).toMatchObject({ pageStart: 'S12', pageEnd: 'S20', pageCount: '9' })
    expect(parseVenue('Journal 12 (1), A5-B9, 2025', 2025)).toMatchObject({ pageStart: 'A5', pageEnd: 'B9', pageCount: '' })
  })
  it('keeps the comma inside a name when names are separated by ";"', () => {
    expect(authorList('Ptak, M.; Amnuaylojaroen, T.')).toBe('Ptak, M.; Amnuaylojaroen, T.')
    expect(authorList('M Ptak, T Amnuaylojaroen')).toBe('M Ptak; T Amnuaylojaroen')
  })
})

describe('new works', () => {
  const w = (key: string, title: string, at: string, doi = ''): NewWork => ({ key, title, at, doi, year: '2026', venue: 'J' })
  it('a row with DOI and title joins a DOI group and a title group into one work', () => {
    const g = groupNewWorks([w('A', 'First title', BKK, '10.1/x'), w('B', 'Second title', BKK), w('C', 'Second title', UTC_LATER, 'https://doi.org/10.1/X')])
    expect(g).toHaveLength(1)
    expect(g[0].keys).toEqual(['A', 'B', 'C'])
    expect(g[0].at).toBe(UTC_LATER)
  })
  it('Thai titles that differ only in a tone mark are two works', () => {
    expect(groupNewWorks([w('A', 'การศึกษาน้ำ', BKK), w('B', 'การศึกษานำ', BKK)])).toHaveLength(2)
    expect(normTitle('น้ำ')).not.toBe(normTitle('นำ'))
  })
  it('newest first by instant', () => {
    expect(groupNewWorks([w('A', 'Early', BKK), w('B', 'Late', UTC_LATER)]).map((x) => x.title)).toEqual(['Late', 'Early'])
  })
  it('a work opened under the old title id (marks stripped) stays opened', () => {
    const g = groupNewWorks([w('A', 'การศึกษาน้ำ', BKK)])
    const old = `t:${'การศึกษาน้ำ'.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')}`
    expect(unseen(g, new Set([old]))).toEqual([])
    expect(unseen(g, new Set())).toHaveLength(1)
  })
})

describe('firstSeen (scripts/new-works.mjs)', () => {
  type Row = { key: string; title: string }
  const r = (key: string, title: string): Row => ({ key, title })
  const baseline = [r('A', 'one')]
  it('a bulk load still in the working tree is not new', () => {
    const many = Array.from({ length: 5 }, (_, i) => r('A', `bulk ${i}`))
    expect(firstSeen(baseline, [], [...baseline, ...many], 'now', 3)).toEqual([])
    expect(firstSeen(baseline, [], [...baseline, ...many.slice(0, 2)], 'now', 3)).toHaveLength(2)
  })
  it("a new lecturer's first rows are their record arriving, committed or not", () => {
    expect(firstSeen(baseline, [{ at: 'd1', rows: [...baseline, r('N', 'old work')] }], [...baseline, r('N', 'old work')], 'now')).toEqual([])
    expect(firstSeen(baseline, [], [...baseline, r('N', 'old work')], 'now')).toEqual([])
  })
  it('a line without a lecturer or a title is skipped', () => {
    const out = firstSeen(baseline, [], [...baseline, r('', 'no lecturer'), r('A', ' - '), r('A', 'real')], 'now')
    expect(out.map((x) => x.title)).toEqual(['real'])
  })
})

describe('Scholar page layout check (scripts/fetch-scholar.mjs)', () => {
  const rows = (over: object) => Array.from({ length: 5 }, () => ({ year: '2025', authors: 'A B', ...over }))
  it('stops when no row has a year or no row has authors', () => {
    expect(() => checkLayout(rows({ year: '' }))).toThrow(BlockedError)
    expect(() => checkLayout(rows({ authors: '' }))).toThrow(BlockedError)
  })
  it('passes a normal page and a short profile', () => {
    expect(() => checkLayout(rows({}))).not.toThrow()
    expect(() => checkLayout(rows({ year: '' }).slice(0, 4))).not.toThrow()
  })
})

describe('web app links', () => {
  it('a query value is decoded once', () => {
    expect(parseWebAppHash('#/lecturers?q=%2526').query?.get('q')).toBe('%26')
    expect(parseWebAppHash('#/lecturers?q=a%26b&prog=x').query?.get('q')).toBe('a&b')
  })
})

describe('backend lists', () => {
  afterEach(() => vi.unstubAllGlobals())
  const answer = (body: object) => new Response(JSON.stringify(body), { status: 200 })
  it('"me" is retried after a network error like the other reads', async () => {
    const f = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(answer({ ok: true, email: 'x' }))
    vi.stubGlobal('fetch', f)
    await expect(api({ action: 'me', session: 's' }, [0, 0])).resolves.toMatchObject({ ok: true })
    expect(f).toHaveBeenCalledTimes(2)
  })
  it('a list that could not be read is null, never an empty list', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer({ ok: false, error: 'not_configured' })))
    await expect(fetchConfDecisions()).resolves.toBeNull()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer({ ok: true, items: [] })))
    await expect(fetchConfDecisions()).resolves.toEqual([])
  })
  it('Code.gs answers not_configured, not an empty list, when a list has no sheet', () => {
    for (const fn of ['confList', 'noticeList', 'scholarList', 'formCancelList']) {
      const start = code.indexOf(`function ${fn}(`)
      expect(start, fn).toBeGreaterThan(-1)
      const body = code.slice(start, code.indexOf('\nfunction ', start + 1))
      expect(body, fn).toContain("{ ok: false, error: 'not_configured' }")
      expect(body.indexOf('not_configured'), fn).toBeLessThan(body.indexOf('items'))
    }
  })
})
