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

/** The title to store. TCI has the title in English and in the local language; the site treats two
 *  rows as one work when their titles are the same, so the form the lecturer's other rows already
 *  use is taken (`known` = their normalised titles). Otherwise the local title, then the English. */
export function tciTitle(article, known = new Set()) {
  const eng = String(article.article_eng ?? '').trim()
  const loc = String(article.article_loc ?? '').trim() || String(article.title_eng ?? '').trim()
  if (eng && known.has(normTitle(eng))) return eng
  if (loc && known.has(normTitle(loc))) return loc
  return loc || eng
}

/** One row of data/tci_articles.tsv, or null when the record has no title or year. */
export function tciRow(f, article, authors, issn = '', known = new Set()) {
  const title = tciTitle(article, known)
  const year = Number(article.year)
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
