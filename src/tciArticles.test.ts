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
  it('stores the title of a row the lecturer already has for the article, else the local title', () => {
    const th = 'การประเมินศักยภาพการประหยัดพลังงานของระบบปรับอากาศด้วยการใช้อากาศภายนอก'
    const a = { article_loc: th, article_eng: 'Assessment of Energy-Saving Potential of Air Conditioning Systems', title_eng: th }
    expect(tciTitle(a)).toBe(th)
    // 1. the same title in the other language
    expect(tciTitle(a, [{ title: 'Assessment of energy-saving potential of air conditioning systems', year: 2025 }], 2025)).toBe('Assessment of energy-saving potential of air conditioning systems')
    // 2. OpenAlex writes some Thai titles twice
    expect(tciTitle(a, [{ title: `${th} ${th}`, year: 2025 }], 2025)).toBe(`${th} ${th}`)
    // 3. Google Scholar joins the Thai and the English title and cuts the result
    const scholar = 'การ ประเมิน ศักยภาพ การ ประหยัด พลังงาน ของ ระบบ ปรับอากาศ ด้วย การ ใช้ อากาศ ภายนอก Assessment of Energy …'
    expect(tciTitle(a, [{ title: scholar, year: 2025 }], 2025)).toBe(scholar)
    expect(tciTitle(a, [{ title: scholar, year: 2024 }], 2025)).toBe(th) // another year: not taken as the same article
    // a full row is preferred to a cut one
    expect(tciTitle(a, [{ title: scholar, year: 2025 }, { title: `${th} ${th}`, year: 2025 }], 2025)).toBe(`${th} ${th}`)
    // a short title is never matched as the start of a cut one
    expect(tciTitle({ article_loc: 'การประเมิน', article_eng: '' }, [{ title: 'การ ประเมิน ศักยภาพ การ ประหยัด …', year: 2025 }], 2025)).toBe('การประเมิน')
    // a longer, different title that only starts the same way is not a match
    expect(tciTitle(a, [{ title: `${th} ภาคสอง`, year: 2025 }], 2025)).toBe(th)
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
