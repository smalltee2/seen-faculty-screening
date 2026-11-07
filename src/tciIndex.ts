import type { DataBundle } from './types'
import { buildTciIndex, type TciIndex } from './tci'
import { buildQuartileIndex, type QuartileIndex } from './quality'

/** TCI/Scopus journal index shared by charts and pages. The main site fills it from the
 *  bundled data (src/main.tsx); a personal page fills it from the data.json it fetches
 *  (src/personal.tsx), so that entry never imports the full bundle. */
export let TCI: TciIndex = buildTciIndex([], [])

/** CiteScore quartiles by ISSN (src/quality.ts), filled with the TCI index. */
export let QUARTILES: QuartileIndex = new Map()

export function initTci(data: Pick<DataBundle, 'tci' | 'scopusJournals' | 'quartiles'>): void {
  TCI = buildTciIndex(data.tci ?? [], data.scopusJournals ?? [])
  QUARTILES = buildQuartileIndex(data.quartiles ?? [])
}
