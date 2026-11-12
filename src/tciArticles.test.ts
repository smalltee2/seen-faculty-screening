import { describe, expect, it } from 'vitest'
import { tciAuthorMatch, tciRow, tciTitle } from '../scripts/tci-articles.mjs'
import { classifyRow } from './classify'

const f = { name_en: 'Sukthai Pongpattanasiri', name_th: 'สุขทัย พงศ์พัฒนศิริ' }
const article = { id: '882358', year: '2026', issue_num: '2', volume: '7', journal_id: '11798', page_number: '122-136', cited: '0', journal_eng: 'The Journal of Spatial Innovation Development', journal_loc: 'วารสารวิชาการเพื่อการพัฒนานวัตกรรมเชิงพื้นที่', article_loc: 'การประเมินเพื่อจัดลำดับความสำคัญ', article_eng: 'Assessment to Determine Urgent Plan Priorities', title_eng: 'การประเมินเพื่อจัดลำดับความสำคัญ' }

describe('TCI articles found by the author\'s name', () => {
  it('keeps an article only when an author is written exactly as the lecturer, in English or Thai', () => {
    expect(tciAuthorMatch([{ name: 'Parinya Sopitpinyo', name_loc: 'ปริญญา โสภิตภิญโญ' }, { name: 'Sukthai Pongpattanasiri', name_loc: '' }], f)).toBe(true)
    expect(tciAuthorMatch([{ name: 'S. Pongpattanasiri', name_loc: 'สุขทัย พงศ์พัฒนศิริ' }], f)).toBe(true)
    expect(tciAuthorMatch([{ name: 'S. Pongpattanasiri', name_loc: '' }], f)).toBe(false) // initials are not the full name
    expect(tciAuthorMatch([{ name: 'Sukthai Pongpattansiri', name_loc: null }], f)).toBe(false) // another spelling
    expect(tciAuthorMatch([], f)).toBe(false)
    expect(tciAuthorMatch(undefined, f)).toBe(false)
  })
  it('stores the title in the form the lecturer\'s other rows use, else the local title', () => {
    const norm = (t: string) => t.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, '')
    expect(tciTitle(article)).toBe('การประเมินเพื่อจัดลำดับความสำคัญ')
    expect(tciTitle(article, new Set([norm('Assessment to determine urgent plan priorities')]))).toBe('Assessment to Determine Urgent Plan Priorities')
    expect(tciTitle({ article_loc: '', article_eng: 'Only English', title_eng: 'Only English' })).toBe('Only English')
  })
  it('makes a row the site classifies as a journal article', () => {
    const row = tciRow(f, article, [{ name: 'Parinya Sopitpinyo' }, { name: 'Sukthai Pongpattanasiri' }], '2730-1818')!
    expect(row).toMatchObject({ key: 'Sukthai Pongpattanasiri', year: 2026, tci_id: '882358', journal_id: '11798', issn: '2730-1818', authors: 'Parinya Sopitpinyo, Sukthai Pongpattanasiri' })
    expect(row.venue).toBe('The Journal of Spatial Innovation Development 7 (2), 122-136, 2026')
    expect(classifyRow({ line: 1, source: 'tci', key: f.name_en, year: 2026, title: String(row.title), authors: '', venue: String(row.venue), cites: 0, extType: 'article', sourceType: 'journal' }).type).toBe('journal')
  })
  it('gives no row without a title or a year', () => {
    expect(tciRow(f, { ...article, year: '' }, [])).toBeNull()
    expect(tciRow(f, { year: '2026' }, [])).toBeNull()
  })
})
