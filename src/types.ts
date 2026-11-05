export type Rank = 'อาจารย์' | 'ผศ.' | 'รศ.' | 'ศ.'
export type Degree = 'ปริญญาโท' | 'ปริญญาเอก'

export interface Faculty {
  nameEn: string
  nameTh: string
  scholarId: string
  rank: Rank | null
  degree: Degree | null
  degreeYear: number | null
  programs: string[]
  notes: string
}

/** One row of data/publications.tsv as parsed by scripts/build-data.mjs. */
export interface RawPub {
  line: number
  key: string
  year: number | null
  title: string
  authors: string
  venue: string
  cites: number
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
  override: Override | null
}
