// Outlook for the next evaluation years (Tum, 2026-11-10): which duties a lecturer meets this
// year and stops meeting in year Y+1 or Y+2 as works leave the 5-year window, and how many works
// short. Same engine and the same assumption as nextYearRisk in src/rules.ts: no new work appears.
import { ROLES, evaluatePerson, windowYears, type PersonResult, type RoleSpec, type Settings } from './rules'
import type { Pub } from './types'

export interface OutlookRole {
  role: RoleSpec
  /** First evaluation year (CE) in which the duty is no longer met. */
  lostIn: number
  /** Works short in that year under the regular rule. A research work fills both, so the
   *  number of new works needed is `need`. */
  shortOutputs: number
  shortResearch: number
  need: number
  /** Counted works of this year that are out of the window in `lostIn`. */
  leaving: Pub[]
  /** How the duty is met this year (the new-graduate clause runs out with time, not with works). */
  path: 'regular' | 'new_grad'
  /** The evaluator's own lines for `lostIn` (without the qualification line). */
  reason: string
}

export interface OutlookPerson {
  result: PersonResult
  roles: OutlookRole[]
  /** Earliest `lostIn` among the roles. */
  firstYear: number
}

const outputLines = (reasons: string[]) => reasons.filter((x) => !x.startsWith('คุณวุฒิ:')).join('; ')

/** Duties in `roles` met in year Y and not met in one of the next `horizon` years. */
export function outlookFor(r: PersonResult, s: Settings, horizon = 2, roles: RoleSpec[] = ROLES): OutlookRole[] {
  // Works dated after Y (already in press) would enter a later window; like nextYearRisk, leave them out.
  const known = r.pubs.filter((p) => p.year === null || p.year <= s.year)
  const out: OutlookRole[] = []
  const later = new Map<number, PersonResult>()
  for (const role of roles) {
    const now = r.roles[role.id]
    if (now.status !== 'met') continue
    for (let k = 1; k <= horizon; k++) {
      const year = s.year + k
      if (!later.has(year)) later.set(year, evaluatePerson(r.person, known, { ...s, year }))
      const then = later.get(year)!.roles[role.id]
      if (then.status === 'met') continue
      const c = then.counts
      const shortOutputs = role.researchOnly ? 0 : Math.max(0, role.minOutputs - c.total)
      const shortResearch = Math.max(0, (role.researchOnly ? role.minOutputs : role.minResearch) - c.research)
      const [from] = windowYears(year)
      out.push({
        role,
        lostIn: year,
        shortOutputs,
        shortResearch,
        need: Math.max(shortOutputs, shortResearch),
        leaving: now.used.map((e) => e.pub).filter((p) => p.year !== null && p.year < from),
        path: now.path,
        reason: outputLines(then.reasons),
      })
      break
    }
  }
  return out
}

/** Everyone with at least one duty at risk, soonest first, then by the largest shortfall. */
export function outlook(results: PersonResult[], s: Settings, horizon = 2, roles: RoleSpec[] = ROLES): OutlookPerson[] {
  return results
    .map((result) => {
      const rs = outlookFor(result, s, horizon, roles)
      return { result, roles: rs, firstYear: Math.min(...rs.map((x) => x.lostIn)) }
    })
    .filter((x) => x.roles.length > 0)
    .sort(
      (a, b) =>
        a.firstYear - b.firstYear ||
        Math.max(...b.roles.map((x) => x.need)) - Math.max(...a.roles.map((x) => x.need)) ||
        a.result.person.nameEn.localeCompare(b.result.person.nameEn),
    )
}
