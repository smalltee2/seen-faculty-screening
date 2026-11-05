export type Rank = 'อาจารย์' | 'ผศ.' | 'รศ.' | 'ศ.'
export type Degree = 'ปริญญาโท' | 'ปริญญาเอก'

export interface Faculty {
  nameEn: string
  nameTh: string
  scholarId: string
  openalexId?: string
  scopusId?: string
  rank: Rank | null
  degree: Degree | null
  degreeYear: number | null
  programs: string[]
  notes: string
}

export type PubSource = 'scholar' | 'openalex' | 'scopus' | 'manual'

/** One publication row from any data file, as parsed by scripts/build-data.mjs. */
export interface RawPub {
  line: number
  /** Which data file the row came from (scholar = data/publications.tsv). */
  source?: PubSource
  key: string
  year: number | null
  title: string
  authors: string
  venue: string
  cites: number
  doi?: string
  /** OpenAlex work type, Scopus subtype, or the type chosen in the admin form. */
  extType?: string
  /** OpenAlex source type / Scopus aggregation type (journal, conference, repository …). */
  sourceType?: string
  /** Admin form answer to "เป็นงานวิจัยหรือไม่". */
  manualResearch?: boolean
  submitted?: string
}

export interface Override {
  key: string
  titleNormalized: string
  type: 'journal' | 'proceeding' | 'poster' | 'exclude' | null
  isResearch: boolean | null
  ownDegree: boolean | null
  note: string
}

export interface DataBundle {
  builtAt: string
  sources: {
    manualSheetCsvUrl?: string
    googleFormUrl?: string
    /** Form link encrypted with the admin passcode (scripts/set-admin-passcode.mjs). */
    adminGate?: { iterations: number; salt: string; iv: string; data: string }
  }
  faculty: Faculty[]
  publications: RawPub[]
  overrides: Override[]
}

/** `unknown` = the classifier could not decide; always needs review. */
export type PubType = 'journal' | 'proceeding' | 'poster' | 'exclude' | 'unknown'

export interface Pub extends RawPub {
  id: string
  titleNorm: string
  type: PubType
  typeReason: string
  /** Type guessed from weak evidence; counted only as "possible". */
  typeUncertain: boolean
  isResearch: boolean
  researchReason: string
  researchUncertain: boolean
  /** From overrides.csv; null = not stated (the rules apply the degree-year check). */
  ownDegree: boolean | null
  /** Number of duplicate rows merged into this one. */
  duplicates: number
  /** Every source that listed this work. */
  sources: PubSource[]
  override: Override | null
}
