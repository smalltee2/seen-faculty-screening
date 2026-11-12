// Articles in Thai journals from the TCI article search (https://search.tci-thailand.org), found by
// the lecturer's name (Tum, 2026-11-12: Thai-language articles are mostly here and nowhere else).
// The search is loose (it also returns other people with a similar name), so an article is kept only
// when one of its authors is written exactly as the lecturer's English or Thai name (name-match.mjs).
import { nameKey } from './name-match.mjs'

/** True when one of TCI's author records ({ name, name_loc }) is exactly one of the lecturer's names. */
export function tciAuthorMatch(authors, f) {
  const keys = new Set([f.name_en, f.name_th].map(nameKey).filter((k) => k.includes(' ')))
  return (authors ?? []).some((a) => keys.has(nameKey(a.name)) || keys.has(nameKey(a.name_loc)))
}

const normTitle = (t) => String(t ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, '')

const TRUNCATED = /(…|\.\.\.)\s*$/

/** The title to store. The site treats two rows as one work when their titles are the same, so the
 *  title of a row the lecturer already has for this article is taken when there is one (`known` =
 *  [{ title, year }] of their rows in the other sources). Such a row can carry the title
 *    1. as TCI has it, in English or in the local language;
 *    2. written twice (OpenAlex stores some Thai titles as "title title");
 *    3. cut short by Google Scholar ("…") after the local title, which Scholar joins with the
 *       English one or repeats; only for the same year and a title of 30 characters or more.
 *  Otherwise the local title, then the English one. */
export function tciTitle(article, known = [], year = null) {
  const eng = String(article.article_eng ?? '').trim()
  const loc = String(article.article_loc ?? '').trim() || String(article.title_eng ?? '').trim()
  const forms = [...new Set([eng, loc].map(normTitle).filter(Boolean))]
  const rows = known.map((k) => ({ title: String(k.title ?? ''), year: Number(k.year) || null, n: normTitle(String(k.title ?? '').replace(TRUNCATED, '')), cut: TRUNCATED.test(String(k.title ?? '').trim()) }))
  const same = rows.find((k) => !k.cut && forms.includes(k.n))
  if (same) return same.title
  const twice = rows.find((k) => !k.cut && forms.some((f) => k.n === f + f))
  if (twice) return twice.title
  const cut = rows.find((k) => k.cut && year !== null && k.year === year && forms.some((f) => f.length >= 30 && k.n.startsWith(f)))
  if (cut) return cut.title
  return loc || eng
}

/** One row of data/tci_articles.tsv, or null when the record has no title or year. */
export function tciRow(f, article, authors, issn = '', known = []) {
  const year = Number(article.year)
  const title = tciTitle(article, known, Number.isInteger(year) ? year : null)
  if (!title || !Number.isInteger(year) || year < 1900 || year > 2100) return null
  const journal = String(article.journal_eng ?? '').trim() || String(article.journal_loc ?? '').trim()
  const vol = String(article.volume ?? '').trim()
  const issue = String(article.issue_num ?? '').trim()
  const pages = String(article.page_number ?? '').trim()
  // Scholar-like venue string: "Journal 40 (1), 67-76, 2026".
  const venue = [`${journal}${vol ? ` ${vol}` : ''}${issue ? ` (${issue})` : ''}`.trim(), pages, String(year)].filter(Boolean).join(', ')
  const names = (authors ?? []).map((a) => String(a.name ?? '').trim() || String(a.name_loc ?? '').trim()).filter(Boolean)
  return {
    key: f.name_en,
    year,
    title,
    authors: names.slice(0, 6).join(', ') + (names.length > 6 ? ', ...' : ''),
    venue,
    cites: Number(article.cited) || 0,
    tci_id: String(article.id ?? ''),
    journal_id: String(article.journal_id ?? ''),
    issn,
    title_eng: String(article.article_eng ?? '').trim(),
    title_loc: String(article.article_loc ?? '').trim(),
  }
}
