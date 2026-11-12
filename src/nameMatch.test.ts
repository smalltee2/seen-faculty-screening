import { describe, expect, it } from 'vitest'
import { lecturerNames, nameKey, namedOn } from '../scripts/name-match.mjs'

describe('exact name matching for the OpenAlex fetch', () => {
  it('ignores word order, case, punctuation, Latin accents and a leading title', () => {
    const k = nameKey('Pimsiri Suwannapat')
    for (const v of ['Suwannapat, Pimsiri', 'PIMSIRI SUWANNAPAT', ' pimsiri  suwannapat ', 'Dr. Pimsiri Suwannapat', 'Asst. Prof. Dr. Pimsiri Suwannapat', 'Pimsiri Suwannapát']) expect(nameKey(v)).toBe(k)
  })
  it('does not match another spelling, a part of the name, or a longer name', () => {
    const k = nameKey('Pimsiri Suwannapat')
    for (const v of ['Pimsiri Suwanpat', 'Pimsiri', 'Suwannapat', 'P. Suwannapat', 'Pimsiri Suwannapat Jr', 'Pimsiri K. Suwannapat', '']) expect(nameKey(v)).not.toBe(k)
  })
  it('keeps Thai vowels and tone marks, and drops Thai titles', () => {
    const k = nameKey('พิมพ์ศิริ สุวรรณพัฒน์')
    expect(nameKey('ผศ.ดร.พิมพ์ศิริ สุวรรณพัฒน์')).toBe(k)
    expect(nameKey('อาจารย์ พิมพ์ศิริ สุวรรณพัฒน์')).toBe(k)
    expect(nameKey('พิมพ์ศิริ สุวรรณพัฒน')).not.toBe(k) // a missing mark is another spelling
    expect(nameKey('พิมศิริ สุวรรณพัฒน์')).not.toBe(k)
  })
  it('finds the lecturer among a work\'s authors by either name', () => {
    const f = { name_en: 'Pimsiri Suwannapat', name_th: 'พิมพ์ศิริ สุวรรณพัฒน์' }
    const names = lecturerNames(f)
    expect(names).toEqual(['Pimsiri Suwannapat', 'พิมพ์ศิริ สุวรรณพัฒน์'])
    expect(namedOn({ authorships: [{ raw_author_name: 'A B' }, { raw_author_name: 'Suwannapat, Pimsiri' }] }, names)).toBe(true)
    expect(namedOn({ authorships: [{ raw_author_name: 'พิมพ์ศิริ สุวรรณพัฒน์' }] }, names)).toBe(true)
    expect(namedOn({ authorships: [{ raw_author_name: null, author: { display_name: 'Pimsiri Suwannapat' } }] }, names)).toBe(true)
    expect(namedOn({ authorships: [{ raw_author_name: 'Pimsiri Suwanpat' }] }, names)).toBe(false)
    expect(namedOn({ authorships: [] }, names)).toBe(false)
    expect(namedOn({}, names)).toBe(false)
  })
  it('never matches on a one-word name or an empty one', () => {
    expect(lecturerNames({ name_en: ' ', name_th: '' })).toEqual([])
    expect(namedOn({ authorships: [{ raw_author_name: 'Madonna' }] }, ['Madonna'])).toBe(false)
  })
})
