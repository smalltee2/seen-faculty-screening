// Everything the pages read: the bundled data plus the live lists from the backend (admin-form rows
// since the build, self-added works, Scholar imports, conference decisions, reminders, form cancels).
// Moved out of App.tsx (2026-11-11) so the app-shell prototype (src/proto/) shows the same numbers.
import { useEffect, useMemo, useState } from 'react'
import raw from './generated/data.json'
import { preparePubs } from './classify'
import { demoNoticeOn, demoPubs } from './demoNotice' // DEMO-NOTICE
import type { ConferenceEntry, DataBundle, RawPub } from './types'
import { fetchLiveManual } from './liveManual'
import { approvedRows, dropUnapproved, fetchSubmissions, type Submission } from './submissions'
import { dropRemovedScholar, fetchScholarImports, scholarImportRows, type ScholarImportItem } from './scholarImport'
import { cancelledForms, dropCancelledForms, fetchFormCancels, type FormCancelItem } from './formCancel'
import { applyConfDecisions, fetchConfDecisions, type ConfDecisionItem } from './confDecisions'
import { fetchNotices, type Notice } from './notify'

const data = raw as unknown as DataBundle
const bundledRows = data.publications.filter((p) => data.faculty.some((f) => f.nameEn === p.key))
const makePubs = (bundled: RawPub[], extra: RawPub[], conferences: ConferenceEntry[]) => preparePubs([...bundled, ...extra], data.overrides, conferences, data.crossref ?? [])

/** `extraConfItems` lets the prototype try decisions locally without saving them. */
const NONE: ConfDecisionItem[] = [] // one array, so the memo below is not recomputed on every render
export function useSiteData(extraConfItems: ConfDecisionItem[] = NONE) {
  // Works added through the admin form since the last build, read live from its sheet.
  const [liveRows, setLiveRows] = useState<RawPub[]>([])
  useEffect(() => {
    let on = true
    void fetchLiveManual(data.sources.manualSheetCsvUrl, data.faculty, bundledRows).then((rows) => {
      if (on && rows.length) setLiveRows(rows)
    })
    return () => {
      on = false
    }
  }, [])
  // Works lecturers added themselves (src/submissions.ts): approved ones count, pending ones are only shown.
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const refreshSubmissions = () => fetchSubmissions().then((v) => setSubmissions((prev) => v ?? prev))
  useEffect(() => {
    void refreshSubmissions()
  }, [])
  const lecturerNames = useMemo(() => new Set(data.faculty.map((f) => f.nameEn)), [])
  const selfRows = useMemo(() => approvedRows(submissions, lecturerNames, bundledRows), [submissions, lecturerNames])
  // Google Scholar rows a level-2 admin imported (src/scholarImport.ts); null = list not read.
  const [scholarItems, setScholarItems] = useState<ScholarImportItem[] | null>(null)
  const refreshScholar = () => {
    void fetchScholarImports().then((v) => setScholarItems((prev) => v ?? prev))
  }
  useEffect(refreshScholar, [])
  const scholarRows = useMemo(() => scholarImportRows(scholarItems ?? [], lecturerNames, bundledRows), [scholarItems, lecturerNames])
  // Conference decisions from the register buttons (src/confDecisions.ts), applied live.
  const [confItems, setConfItems] = useState<ConfDecisionItem[]>([])
  // Returns the reload, so the register's buttons can keep their spinner until the new result shows.
  const refreshConf = () => fetchConfDecisions().then((v) => setConfItems((prev) => v ?? prev))
  useEffect(() => {
    void refreshConf()
  }, [])
  const conferences = useMemo(() => applyConfDecisions(data.conferences ?? [], [...confItems, ...extraConfItems]), [confItems, extraConfItems])
  // A list that could not be read (null) never replaces one already shown: after a save, a failed
  // reload must not make every decision, work or reminder look undone.
  // Reminder e-mails sent to lecturers (src/notify.ts): when each was last notified.
  const [notices, setNotices] = useState<Notice[]>([])
  const refreshNotices = () => {
    void fetchNotices().then((v) => setNotices((prev) => v ?? prev))
  }
  useEffect(refreshNotices, [])
  // Admin-form works a level-2 admin cancelled on the site (src/formCancel.ts); null = list not read.
  const [formCancels, setFormCancels] = useState<FormCancelItem[] | null>(null)
  const refreshFormCancels = () => fetchFormCancels().then((v) => setFormCancels((prev) => v ?? prev))
  useEffect(() => {
    void refreshFormCancels()
  }, [])
  const cancelled = useMemo(() => cancelledForms(formCancels ?? []), [formCancels])
  // When the list cannot be read, the keys known at build time still apply to the live form rows.
  const cancelKeys = useMemo(() => (formCancels ? cancelled : new Set(data.formCancelled ?? [])), [formCancels, cancelled])
  // Bundled self-added works withdrawn since the build are dropped (src/submissions.ts).
  // Bundled Scholar imports undone since the build are dropped too.
  const keptBundled = useMemo(() => dropCancelledForms(dropRemovedScholar(dropUnapproved(bundledRows, submissions), scholarItems), cancelKeys), [submissions, scholarItems, cancelKeys])
  const keptLive = useMemo(() => dropCancelledForms(liveRows, cancelKeys), [liveRows, cancelKeys])
  const allPubs = useMemo(() => makePubs(keptBundled, [...keptLive, ...selfRows, ...scholarRows], conferences), [keptBundled, keptLive, selfRows, scholarRows, conferences])
  const pubs = useMemo(() => (demoNoticeOn() ? demoPubs(allPubs) : allPubs), [allPubs]) // DEMO-NOTICE: remove, and name allPubs pubs again
  return { pubs, submissions, refreshSubmissions, scholarItems, refreshScholar, confItems, refreshConf, conferences, notices, refreshNotices, formCancels, refreshFormCancels, cancelled }
}
