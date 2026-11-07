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
  /** Field of the highest degree (e.g. วิศวกรรมสิ่งแวดล้อม); null = not recorded. */
  degreeField?: string | null
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
  /** ISSNs of the venue, ";"-separated (OpenAlex / Scopus rows only). */
  issn?: string
  /** Admin form answer to "เป็นงานวิจัยหรือไม่". */
  manualResearch?: boolean
  submitted?: string
  /** Read live from the form's sheet in the browser; not yet in data/manual.tsv. */
  live?: boolean
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
    /** Conference-decision form (plain, when not yet moved into adminGate). */
    decisionFormUrl?: string
    /** Form link encrypted with the admin passcode (scripts/set-admin-passcode.mjs). */
    adminGate?: { iterations: number; salt: string; iv: string; data: string }
    /** Level-1 passcode (ข้อมูลอาจารย์ only), scripts/set-admin-passcode.mjs --level=1. */
    viewerGate?: { iterations: number; salt: string; iv: string; data: string }
    /** SHA-256 of the approval key inside adminGate (safe to publish; the backend keeps the same value). */
    approvalKeyHash?: string
  }
  faculty: Faculty[]
  publications: RawPub[]
  overrides: Override[]
  /** TCI journal list (data/tci_journals.csv); absent in builds made before it was added. */
  tci?: TciJournal[]
  /** Journals indexed in Scopus, by ISSN (data/scopus_journals.csv). */
  scopusJournals?: { issn: string; name: string }[]
  /** Conference register (data/conferences.csv); see src/conferences.ts. */
  conferences?: ConferenceEntry[]
  /** data/rules.json → conferenceScreening: 'on' applies the register to the counts; 'off' only shows it. */
  conferenceScreening?: 'on' | 'off'
}

/** One row of data/conferences.csv. `key` is `venue:<normalised name>` or `work:<normalised title>`. */
export interface ConferenceEntry {
  key: string
  /** The venue string (or paper title for work keys) the check was run on. */
  displayName: string
  conferenceName: string
  organiser: string
  association: string
  associationRole: 'organiser' | 'co_organiser' | 'none' | 'unknown'
  field: string
  relatedField: 'yes' | 'no' | 'unknown'
  confidence: 'high' | 'medium' | 'low'
  evidenceUrl: string
  checkedAt: string
  checkedBy: string
  note: string
  /** Admin override; empty = use the automatic verdict. */
  decision: 'count' | 'no_count' | ''
  decidedBy: string
  decidedAt: string
  decisionNote: string
}

export interface TciJournal {
  nameEng: string
  nameLocal: string
  abbrev: string
  issn: string
  eissn: string
  /** '1' | '2' | '3' as published by TCI. */
  tier: string
  status: string
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
  /** Conference screening result; only set for proceedings. */
  conference?: import('./conferences').ConferenceMatch
}
