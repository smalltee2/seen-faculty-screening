import { describe, expect, it } from 'vitest'
import { ageTh, sourceAges, STALE_HOURS } from './freshness'

const now = Date.parse('2026-11-10T12:00:00Z')
const h = (n: number) => new Date(now - n * 3_600_000).toISOString()
const by = (rows: ReturnType<typeof sourceAges>) => Object.fromEntries(rows.map((r) => [r.key, r]))

describe('sourceAges', () => {
  it('fresh sources are not stale', () => {
    const r = by(sourceAges(h(1), { scopus: h(5), openalex: h(10), scholar: h(2), forms: h(0.5), tci: h(7), crossref: h(7) }, now))
    expect(Object.values(r).some((x) => x.stale)).toBe(false)
    expect(r.scopus.hours).toBe(5)
    expect(r.forms.hours).toBe(0)
  })
  it('a source older than the limit is stale; exactly at the limit is not', () => {
    const r = by(sourceAges(h(1), { scopus: h(STALE_HOURS + 1), openalex: h(STALE_HOURS), scholar: h(1), forms: h(1) }, now))
    expect(r.scopus.stale).toBe(true)
    expect(r.openalex.stale).toBe(false)
  })
  it('a watched source with no stamp, or an unreadable one, is stale', () => {
    const r = by(sourceAges(h(1), { scopus: null, openalex: 'not a date', scholar: h(1), forms: h(1) }, now))
    expect(r.scopus).toMatchObject({ stale: true, hours: null, at: null })
    expect(r.openalex).toMatchObject({ stale: true, hours: null, at: null })
  })
  it('Scholar is refreshed by hand, so it never counts as stale', () => {
    const r = by(sourceAges(h(1), { scopus: h(1), openalex: h(1), scholar: h(24 * 90), forms: h(1) }, now))
    expect(r.scholar.stale).toBe(false)
    expect(r.scholar.hours).toBe(24 * 90)
    expect(by(sourceAges(h(1), { scopus: h(1), openalex: h(1), scholar: null, forms: h(1) }, now)).scholar.stale).toBe(false)
  })
  it('TCI and Crossref are watched like the other daily sources', () => {
    const r = by(sourceAges(h(1), { scopus: h(1), openalex: h(1), scholar: h(1), forms: h(1), tci: h(STALE_HOURS + 1), crossref: h(STALE_HOURS) }, now))
    expect(r.tci.stale).toBe(true)
    expect(r.crossref.stale).toBe(false)
    // A bundle built before they were stamped has no time for them: reported, like any missing stamp.
    const old = by(sourceAges(h(1), { scopus: h(1), openalex: h(1), scholar: h(1), forms: h(1) }, now))
    expect(old.tci).toMatchObject({ stale: true, hours: null })
    expect(old.crossref).toMatchObject({ stale: true, hours: null })
  })
  it('an old build is stale even when the stamps are fresh', () => {
    expect(by(sourceAges(h(72), { scopus: h(1), openalex: h(1), scholar: h(1), forms: h(1) }, now)).build.stale).toBe(true)
  })
  it('a bundle without freshness (older build) reports every watched source', () => {
    expect(sourceAges(h(1), undefined, now).filter((x) => x.stale).map((x) => x.key)).toEqual(['scopus', 'openalex', 'forms', 'tci', 'crossref'])
  })
  it('a stamp in the future (clock skew) counts as 0 hours', () => {
    expect(by(sourceAges(h(-3), undefined, now)).build.hours).toBe(0)
  })
})

describe('ageTh', () => {
  it('words', () => {
    expect(ageTh(null)).toBe('ไม่มีบันทึก')
    expect(ageTh(0)).toBe('ไม่ถึง 1 ชั่วโมงที่แล้ว')
    expect(ageTh(47)).toBe('47 ชั่วโมงที่แล้ว')
    expect(ageTh(49)).toBe('2 วันที่แล้ว')
  })
})

// The backend (apps-script/Code.gs, plain ES5) repeats the rule for the daily e-mail; run it on the
// same cases so the two cannot drift apart.
import gsSource from '../apps-script/Code.gs?raw'
import { WATCHED } from './freshness'

describe('Code.gs staleSources agrees with sourceAges', () => {
  // Code.gs only declares functions and constants at top level, so it can be evaluated as-is.
  const ctx = new Function(`${gsSource}\nreturn { staleSources, STALE_WATCHED, STALE_HOURS }`)() as {
    staleSources: (status: unknown, nowMs: number) => { key: string; hours: number | null }[]
    STALE_WATCHED: string[]
    STALE_HOURS: number
  }
  const gs = ctx.staleSources
  const cases = [
    { builtAt: h(1), freshness: { scopus: h(5), openalex: h(10), scholar: h(2), forms: h(1), tci: h(3), crossref: h(3) } },
    { builtAt: h(1), freshness: { scopus: h(49), openalex: h(48), scholar: h(999), forms: h(1), tci: h(49), crossref: h(48) } },
    { builtAt: h(72), freshness: { scopus: null, openalex: 'x', scholar: null, forms: h(100) } },
    { builtAt: h(1) },
  ]
  it.each(cases)('case %#', (c) => {
    const ts = sourceAges(c.builtAt, c.freshness as never, now).filter((a) => a.stale)
    expect(gs(c, now).map((p) => [p.key, p.hours])).toEqual(ts.map((a) => [a.key, a.hours]))
  })
  it('watches the same sources and limit', () => {
    expect(ctx.STALE_WATCHED).toEqual(WATCHED)
    expect(ctx.STALE_HOURS).toBe(STALE_HOURS)
  })
  it('an unreadable status reports every watched source', () => {
    expect(gs(null, now).map((p) => p.key)).toEqual(WATCHED)
  })
})
