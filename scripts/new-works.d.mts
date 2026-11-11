// Types for scripts/new-works.mjs, so src/newWorks.test.ts can import it.
export const NEW_DAYS: number
export const NEW_CAP: number
export const BULK_ROWS: number
export function normTitle(t: string): string
export function utcIso(at: string): string
export function tsvRows(text: string): Record<string, string>[]
export function firstSeen<R extends { key: string; title: string }>(
  baseline: R[],
  versions: { at: string; rows: R[] }[],
  current: R[],
  now: string,
  bulk?: number,
): (R & { at: string })[]
export function newRowsInFile(root: string, rel: string, days?: number, nowMs?: number): (Record<string, string> & { at: string })[]
export const NEW_SOURCES: Record<string, string[]>
export function newWorks(root: string, nowMs?: number): Record<string, { at: string; key: string; title: string; year: string; venue: string; doi: string }[]>
