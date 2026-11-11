// Works new in each data source (Tum, 2026-11-11): the admin page's "แหล่งข้อมูล" shows a "ใหม่ N"
// badge after a source's name and lists what came in and for whom. A row is new when it first
// appeared in its source file within the last NEW_DAYS days; its date is the data refresh (commit)
// that brought it. Read from git history at build time, so no extra file has to be kept up to date
// (the deploy workflow checks out the full history for this).
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const NEW_DAYS = 7
/** At most this many rows per source go into the bundle. */
export const NEW_CAP = 200
/** A single refresh that adds more rows than this to one file is a bulk load (the file's first fill,
 *  a lecturer added with their whole record, a re-import), not new works: its rows count as old. */
export const BULK_ROWS = 50

/** Same normalisation as the site's dedupe key: lower case, letters and digits only. */
export const normTitle = (t) => String(t ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
const rowId = (r) => `${r.key}|${normTitle(r.title)}`

/** Rows of a TSV text as objects (header row first). */
export function tsvRows(text) {
  const lines = String(text ?? '').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '')
  if (!lines.length) return []
  const head = lines[0].split('\t').map((h) => h.trim())
  return lines.slice(1).map((l) => {
    const cells = l.split('\t')
    return Object.fromEntries(head.map((h, i) => [h, (cells[i] ?? '').trim()]))
  })
}

/**
 * When each current row first appeared.
 * @param baseline rows of the file just before the window (all treated as old)
 * @param versions [{ at, rows }] the file at each commit inside the window, oldest first
 * @param current  rows of the file now (may include rows not committed yet)
 * @param now      time given to rows that are in `current` but in no commit yet
 * @param bulk     a version adding more rows than this is a bulk load and counts as old; so do the
 *                 first rows of a lecturer who had none in the file before
 * @returns the current rows that are new, each with `at`
 */
export function firstSeen(baseline, versions, current, now, bulk = BULK_ROWS) {
  const seen = new Map()
  const people = new Set(baseline.map((r) => r.key)) // lecturers that already had rows in this file
  for (const r of baseline) seen.set(rowId(r), null)
  for (const v of versions) {
    const added = [...new Map(v.rows.map((r) => [rowId(r), r])).entries()].filter(([id]) => !seen.has(id))
    const bulkLoad = added.length > bulk // a bulk load joins the baseline
    for (const [id, r] of added) {
      // A lecturer's first rows in a file are their existing record arriving (a lecturer added to the
      // system), not new works.
      seen.set(id, bulkLoad || !people.has(r.key) ? null : v.at)
    }
    for (const r of v.rows) people.add(r.key)
  }
  const out = []
  const done = new Set()
  for (const r of current) {
    const id = rowId(r)
    if (done.has(id)) continue
    done.add(id)
    const at = seen.has(id) ? seen.get(id) : now
    if (at) out.push({ ...r, at })
  }
  return out
}

const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

/** New rows of one data file (path relative to `root`), or [] when git history is not available. */
export function newRowsInFile(root, rel, days = NEW_DAYS, nowMs = Date.now()) {
  const file = join(root, rel)
  if (!existsSync(file)) return []
  const since = new Date(nowMs - days * 86400000).toISOString()
  let commits, base
  try {
    commits = git(root, ['log', `--since=${since}`, '--reverse', '--format=%H %cI', '--', rel]).split('\n').filter(Boolean).map((l) => {
      const [hash, at] = l.split(' ')
      return { hash, at }
    })
    base = git(root, ['log', '-1', `--before=${since}`, '--format=%H', '--', rel]).trim()
  } catch {
    return [] // no git (offline copy) or a shallow clone without the window
  }
  const at = (hash) => {
    try {
      return tsvRows(git(root, ['show', `${hash}:${rel}`]))
    } catch {
      return [] // the file did not exist at that commit
    }
  }
  // A file whose history starts inside the window: its first version is the baseline, so a whole
  // new file is not reported as hundreds of new works.
  let baseline = base ? at(base) : []
  let versions = commits.map((c) => ({ at: c.at, rows: at(c.hash) }))
  if (!base && versions.length) {
    baseline = versions[0].rows
    versions = versions.slice(1)
  }
  return firstSeen(baseline, versions, tsvRows(readFileSync(file, 'utf8')), new Date(nowMs).toISOString())
}

/** The sources as the admin page names them, and their files. */
export const NEW_SOURCES = {
  openalex: ['data/openalex.tsv'],
  scopus: ['data/scopus.tsv'],
  forms: ['data/manual.tsv'],
  scholar: ['data/publications.tsv', 'data/scholar_imports.tsv'],
}

/** { source: [{ at, key, title, year, venue, doi }] } newest first, for the data bundle. */
export function newWorks(root, nowMs = Date.now()) {
  const out = {}
  for (const [source, files] of Object.entries(NEW_SOURCES)) {
    const rows = files.flatMap((rel) => newRowsInFile(root, rel, NEW_DAYS, nowMs))
    rows.sort((a, b) => b.at.localeCompare(a.at))
    out[source] = rows.slice(0, NEW_CAP).map((r) => ({ at: r.at, key: r.key, title: r.title, year: r.year, venue: r.venue, doi: r.doi ?? '' }))
  }
  return out
}
