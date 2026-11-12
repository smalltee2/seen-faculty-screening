// Exact name matching for the OpenAlex fetch (Tum, 2026-11-12: "get every work whose author name
// matches, in Thai and in English"). A work found by a name search is kept only when one of its
// authors is written exactly as the lecturer's name_en or name_th in data/faculty.csv: same words,
// in either order ("Surname, Given"), ignoring case, punctuation, Latin accents and a leading title.
// A different spelling (Suwanpat for Suwannapat) is not a match; those author records are listed by
// hand in openalex_id.

const TITLE = /^(ผู้ช่วยศาสตราจารย์|รองศาสตราจารย์|ศาสตราจารย์|อาจารย์|ผศ|รศ|ศ|ดร|นางสาว|นาง|นาย|assistant professor|associate professor|professor|asst|assoc|prof|dr|mr|mrs|ms)\.?\s*/i

/** The name as a comparable key: words sorted, so the order of given name and surname does not matter. */
export function nameKey(name) {
  let s = String(name ?? '').normalize('NFKC').trim()
  for (let prev = ''; prev !== s; ) {
    prev = s
    s = s.replace(TITLE, '')
  }
  // Latin accents go (é → e); Thai vowels and tone marks are part of the name and stay.
  s = s.normalize('NFD').replace(/(?<![฀-๿])\p{M}/gu, '').normalize('NFC')
  return s.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim().split(' ').filter(Boolean).sort().join(' ')
}

/** The lecturer's names to search for (English, then Thai), without empty ones. */
export const lecturerNames = (f) => [f.name_en, f.name_th].map((x) => String(x ?? '').trim()).filter(Boolean)

/** True when one of the work's authors (OpenAlex authorships) is written exactly as one of `names`. */
export function namedOn(work, names) {
  const keys = new Set(names.map(nameKey).filter((k) => k.includes(' '))) // a single word is not a full name
  return (work.authorships ?? []).some((a) => keys.has(nameKey(a.raw_author_name ?? a.author?.display_name ?? '')))
}
