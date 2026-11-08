// Google Scholar refresh, started by the "อัปเดตจาก Google Scholar" button on the admin page
// (Tum, 2026-11-08) and run by the iMac job (scripts/scholar-poll.sh). Scholar has no API: this
// reads each lecturer's public profile list page by page, slowly (a few seconds between pages),
// with an honest User-Agent. If Scholar answers with a bot check or an error, it stops at once and
// reports "blocked"; it never tries to get around the check. Rows are written in the Scholar
// export format of data/publications.tsv (key, year, title, authors, venue, cites).
//
// Merge per lecturer: the fresh list replaces the old rows when it is complete and not much
// shorter (>= 90 % of the old count, or at most 3 fewer); otherwise only new titles are added,
// so a short or partial answer never deletes works.
//
//   node scripts/fetch-scholar.mjs            all lecturers with a scholar_id
//   node scripts/fetch-scholar.mjs --only=Name_En --dry-run
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCsv } from './csv.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PUB_FILE = join(ROOT, 'data/publications.tsv')
const HEADER = ['key', 'year', 'title', 'authors', 'venue', 'cites']
const UA = 'seen-faculty-screening (University of Phayao; https://github.com/smalltee2/seen-faculty-screening)'
const PAGE = 100
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const pause = () => sleep(4000 + Math.random() * 4000)

export class BlockedError extends Error {}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…' }
export const decode = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) =>
    e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENT[e.toLowerCase()] ?? m),
  )
const text = (html) => decode(String(html ?? '').replace(/<[^>]*>/g, '')).replace(/[\t\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
export const normTitle = (t) => String(t).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, '')

/** Rows of one Scholar profile page (the HTML of /citations?user=…). */
export function parseProfilePage(html, key) {
  if (!/id="gsc_prf_in"/.test(html)) throw new BlockedError('no profile on the page (bot check or changed layout)')
  return html
    .split('<tr class="gsc_a_tr">')
    .slice(1)
    .map((tr) => {
      const title = text(tr.match(/class="gsc_a_at"[^>]*>([\s\S]*?)<\/a>/)?.[1])
      const grays = [...tr.matchAll(/<div class="gs_gray">([\s\S]*?)<\/div>/g)].map((m) => text(m[1]))
      const year = text(tr.match(/class="gsc_a_h gsc_a_hc gs_ibl">([\s\S]*?)<\/span>/)?.[1])
      const cites = text(tr.match(/class="gsc_a_ac gs_ibl"[^>]*>([\s\S]*?)<\/a>/)?.[1]).replace(/\D/g, '') || '0'
      return { key, year: /^\d{4}$/.test(year) ? year : '', title, authors: grays[0] ?? '', venue: grays[1] ?? '', cites }
    })
    .filter((r) => r.title)
}

async function getPage(scholarId, cstart) {
  const url = `https://scholar.google.com/citations?user=${encodeURIComponent(scholarId)}&hl=en&cstart=${cstart}&pagesize=${PAGE}&sortby=pubdate`
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' }, redirect: 'manual', signal: AbortSignal.timeout(60000) })
  // Scholar's bot check answers with a redirect to /sorry, 429 or 403.
  if (res.status !== 200) throw new BlockedError(`HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const cs = /charset=([\w-]+)/i.exec(res.headers.get('content-type') ?? '')?.[1] ?? 'utf-8'
  const html = new TextDecoder(cs.toLowerCase() === 'iso-8859-1' ? 'latin1' : cs).decode(buf)
  if (/unusual traffic|recaptcha|not a robot/i.test(html)) throw new BlockedError('bot check')
  return html
}

/** Whole list of one profile, page by page. */
export async function fetchProfile(scholarId, key) {
  const rows = []
  for (let cstart = 0; cstart < 2000; cstart += PAGE) {
    if (cstart) await pause()
    const page = parseProfilePage(await getPage(scholarId, cstart), key)
    rows.push(...page)
    if (page.length < PAGE) break
  }
  return rows
}

/** New rows for one lecturer: replace when complete and not much shorter, else add new titles only. */
export function mergeRows(old, fresh) {
  if (!fresh.length) return { rows: old, added: 0, removed: 0, mode: 'kept' }
  const oldKeys = new Set(old.map((r) => normTitle(r.title)))
  const added = fresh.filter((r) => !oldKeys.has(normTitle(r.title))).length
  if (fresh.length >= old.length * 0.9 || old.length - fresh.length <= 3) {
    const freshKeys = new Set(fresh.map((r) => normTitle(r.title)))
    return { rows: fresh, added, removed: old.filter((r) => !freshKeys.has(normTitle(r.title))).length, mode: 'replaced' }
  }
  const seen = new Set(oldKeys)
  const extra = fresh.filter((r) => {
    const k = normTitle(r.title)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  return { rows: [...old, ...extra], added: extra.length, removed: 0, mode: 'added-only' }
}

const readPubs = () => {
  const lines = readFileSync(PUB_FILE, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim())
  return lines.slice(1).map((l) => Object.fromEntries(HEADER.map((h, i) => [h, l.split('\t')[i] ?? ''])))
}
const clean = (s) => String(s ?? '').replace(/[\t\r\n]+/g, ' ').trim()

/** Refresh every lecturer (or `only`), calling onProgress(done, total, name) after each one.
 *  On a block it stops and keeps what was fetched so far. Writes publications.tsv unless dryRun. */
export async function runScholar({ only = '', dryRun = false, onProgress = () => {} } = {}) {
  const fac = parseCsv(readFileSync(join(ROOT, 'data/faculty.csv'), 'utf8').replace(/^﻿/, ''))
  const h = fac[0]
  const people = fac.slice(1).map((r) => Object.fromEntries(h.map((c, i) => [c, r[i] ?? '']))).filter((f) => f.scholar_id && (!only || f.name_en === only))
  let pubs = readPubs()
  const stats = { people: 0, added: 0, removed: 0, addedOnly: [], blocked: '', total: people.length }
  for (const [i, f] of people.entries()) {
    if (i) await pause()
    let fresh
    try {
      fresh = await fetchProfile(f.scholar_id, f.name_en)
    } catch (e) {
      if (e instanceof BlockedError) {
        stats.blocked = `${f.name_en}: ${e.message}`
        break
      }
      throw e
    }
    const old = pubs.filter((p) => p.key === f.name_en)
    const m = mergeRows(old, fresh)
    const at = pubs.findIndex((p) => p.key === f.name_en)
    const rest = pubs.filter((p) => p.key !== f.name_en)
    pubs = at < 0 ? [...rest, ...m.rows] : [...rest.slice(0, at), ...m.rows, ...rest.slice(at)]
    stats.people++
    stats.added += m.added
    stats.removed += m.removed
    if (m.mode === 'added-only') stats.addedOnly.push(f.name_en)
    onProgress(i + 1, people.length, f.name_en)
  }
  if (!dryRun && stats.people) writeFileSync(PUB_FILE, [HEADER.join('\t'), ...pubs.map((p) => HEADER.map((c) => clean(p[c])).join('\t'))].join('\n') + '\n')
  return stats
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7) ?? ''
  const stats = await runScholar({ only, dryRun: process.argv.includes('--dry-run'), onProgress: (d, t, n) => console.log(`[scholar] ${d}/${t} ${n}`) })
  console.log(`[scholar] ${JSON.stringify(stats)}`)
  if (stats.blocked) process.exitCode = 2
}
