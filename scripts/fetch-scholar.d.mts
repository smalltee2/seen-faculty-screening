// Types for scripts/fetch-scholar.mjs, for the parts src/review.test.ts imports.
export class BlockedError extends Error {}
export function checkLayout(rows: { year?: string | number; authors?: string }[]): void
