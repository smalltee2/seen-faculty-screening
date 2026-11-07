import { describe, expect, it } from 'vitest'
import { buildQuartileIndex, quartileOf } from './quality'

const idx = buildQuartileIndex([
  ['0013-9351', 2023, 2],
  ['0013-9351', 2024, 1],
  ['0013-9351', 2025, 1],
  ['1234-5678', 2020, 4],
])

describe('quartileOf (CiteScore, Scopus)', () => {
  it('uses the publication year', () => expect(quartileOf({ issn: '00139351', year: 2023 }, idx)).toBe(2))
  it('falls back to the nearest earlier complete year', () => expect(quartileOf({ issn: '0013-9351', year: 2026 }, idx)).toBe(1))
  it('uses the first year for older works', () => expect(quartileOf({ issn: '0013-9351', year: 2015 }, idx)).toBe(2))
  it('tries each ISSN of the work', () => expect(quartileOf({ issn: '9999-9999;1234-5678', year: 2022 }, idx)).toBe(4))
  it('returns null without CiteScore', () => expect(quartileOf({ issn: '9999-9999', year: 2022 }, idx)).toBeNull())
})
