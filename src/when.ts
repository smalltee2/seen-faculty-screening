// Timestamps from the backend and from git come as ISO strings with different offsets
// ("2026-11-10T23:30:00Z" and "2026-11-11T06:10:00+07:00"), so they are compared as instants, never
// as text (review, 2026-11-11).

/** Milliseconds of an ISO time; 0 when it cannot be read, so such rows sort as oldest. */
export const whenMs = (at: string | undefined | null) => {
  const t = Date.parse(String(at ?? ''))
  return Number.isNaN(t) ? 0 : t
}

/** Oldest first. */
export const byWhenAsc = (a: string, b: string) => whenMs(a) - whenMs(b)
/** Newest first. */
export const byWhenDesc = (a: string, b: string) => whenMs(b) - whenMs(a)
