// Journal names for the Scopus check of works known only from Google Scholar (Tum, 2026-11-16).
// A Scholar row has the journal's name and no ISSN, so the journal could not be checked until
// OpenAlex or Scopus listed the article ("ไม่พบในฐานข้อมูล" on an article in a Scopus journal).
// The name is asked once from Scopus' Serial Title API; only a title equal to the name is taken.

/** Same rule as normName in src/tci.ts (a test keeps the two equal). */
export function normName(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/(?<=[฀-๿])\s+(?=[฀-๿])/g, '')
    .replace(/\bthe\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Same rule as venueName in src/tci.ts: "Journal Name 36 (2), 1-10, 2022" → "Journal Name". */
export function venueName(venue) {
  const v0 = String(venue ?? '')
  const cut = v0.search(/\s\d|,\s*(?=[a-z]?\d)/i)
  let v = cut >= 0 ? v0.slice(0, cut) : v0
  v = v.replace(/\s*\([^)]*\)\s*$/, '').replace(/[\s:;.-]+$/, '')
  return v.trim()
}

/** Names to ask: venues of rows from `sinceYear` on, written in Latin letters, not already known
 *  (a Scopus journal's name, or a name asked before). Returns name key → name as written. */
export function namesToAsk(rows, { sinceYear, known }) {
  const out = new Map()
  for (const r of rows) {
    if (!(Number(r.year) >= sinceYear)) continue
    const name = venueName(r.venue)
    const key = normName(name)
    // Thai names are TCI journals (matched from TCI's own list); very short names match too much.
    if (key.length < 6 || /[฀-๿]/.test(key) || known.has(key) || out.has(key)) continue
    out.set(key, name)
  }
  return out
}

/** ISSNs of the serial whose title equals `name`, from a Serial Title API answer; [] when none
 *  has that title ("Environmental Research" must not take "Environmental Research Letters"). */
export function serialIssns(answer, name) {
  const key = normName(name)
  const entries = [].concat(answer?.['serial-metadata-response']?.entry ?? [])
  const hit = entries.filter((e) => normName(e['dc:title']) === key)
  const issns = hit.flatMap((e) => [e['prism:issn'], e['prism:eIssn']]).map(dashIssn).filter(Boolean)
  return [...new Set(issns)]
}

/** "00489697" or "0048-9697" → "0048-9697"; '' when it is not an ISSN. */
export function dashIssn(s) {
  const d = String(s ?? '').replace(/[^0-9Xx]/g, '').toUpperCase()
  return d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4)}` : ''
}
