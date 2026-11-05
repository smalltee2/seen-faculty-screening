import raw from './generated/data.json'
import type { DataBundle } from './types'
import { buildTciIndex } from './tci'

/** TCI index built once from the data bundle; charts and pages share it. */
export const TCI = buildTciIndex((raw as DataBundle).tci ?? [], (raw as DataBundle).scopusJournals ?? [])
