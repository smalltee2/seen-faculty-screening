import type { DataBundle } from './types'
import { buildTciIndex, type TciIndex } from './tci'

/** TCI/Scopus journal index shared by charts and pages. The main site fills it from the
 *  bundled data (src/main.tsx); a personal page fills it from the data.json it fetches
 *  (src/personal.tsx), so that entry never imports the full bundle. */
export let TCI: TciIndex = buildTciIndex([], [])

export function initTci(data: Pick<DataBundle, 'tci' | 'scopusJournals'>): void {
  TCI = buildTciIndex(data.tci ?? [], data.scopusJournals ?? [])
}
