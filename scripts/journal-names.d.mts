export function normName(s: unknown): string
export function venueName(venue: unknown): string
export function namesToAsk(rows: { year?: string | number; venue?: string }[], opts: { sinceYear: number; known: ReadonlySet<string> }): Map<string, string>
export function serialIssns(answer: unknown, name: string): string[]
export function dashIssn(s: unknown): string
