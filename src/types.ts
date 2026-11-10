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
  /** Scopus EID (scopus.tsv rows only), for the Scopus-style export. */
  eid?: string
  /** Scopus cover date, volume, issue, page range and article number (scopus.tsv rows fetched after 2026-11-07). */
  biblio?: { date: string; volume: string; issue: string; pages: string; articleNumber: string }
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
  /** Admin-form works cancelled at build time, as "name_en|title_norm" (data/form_cancels.tsv). */
  formCancelled?: string[]
  /** Crossref record per DOI (data/crossref.tsv), used by the Scopus-style CSV export. */
  crossref?: CrossrefEntry[]
  /** Programme membership (data/programmes.csv), shown in the admin tab's "หลักสูตร" view only. */
  programmes?: Programme[]
  /** CiteScore quartile per Scopus journal and year: [issn, year, 1-4] (data/scopus_quartiles.csv, complete years). */
  quartiles?: [string, number, number][]
}

export interface ProgrammeMember {
  nameEn: string
  role: 'ประธานหลักสูตร' | 'อาจารย์'
  email: string
  ext: string
  /** Listed as อาจารย์ผู้รับผิดชอบหลักสูตร in the programme document (data/programmes.csv → responsible). */
  responsible: boolean
}

export interface Programme {
  id: string
  th: string
  level: 'ba' | 'ms' | 'phd'
  members: ProgrammeMember[]
}

export interface CrossrefEntry {
  doi: string
  journal: string
  volume: string
  issue: string
  pageStart: string
  pageEnd: string
  articleNumber: string
  /** Print/issue date "YYYY-MM-DD" or "YYYY-MM" (or "YYYY"); '' when Crossref has none. */
  published: string
  publishedOnline: string
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
  /** '1' | '2' | '3' as published by TCI today; '' when the journal holds no กลุ่ม now but did before. */
  tier: string
  status: string
  /** Certification periods [start year, end year, กลุ่ม], oldest first (data/tci_tier_history.csv). */
  periods?: [number, number, string][]
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
  /** Longest author list among the merged rows (OpenAlex full names when present). */
  allAuthors?: string
  /** Scopus document type (Article, Conference paper, …) when a Scopus row was merged in. */
  scopusType?: string
  /** Scopus bibliographic details from the merged Scopus row, when fetched. */
  biblio?: RawPub['biblio']
  override: Override | null
  /** Conference screening result; only set for proceedings. */
  conference?: import('./conferences').ConferenceMatch
}
