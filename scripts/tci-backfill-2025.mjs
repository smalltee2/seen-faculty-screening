// One-off: reconstruct the TCI list as it stood in 2025 (รอบที่ 5 initial result, announced
// 4 Feb 2568) from today's list by reversing the two changes TCI published for 2569:
//   - ShMW7Gg5c9: journals re-graded for 2569–2572 (2→1: 64, 3→1: 2, 3→2: 41; others unchanged)
//   - ZuPDWfSMxZ: journals newly admitted for 2569 (removed from the 2025 snapshot)
// Writes data/tci_snapshots/2025.csv. Round 4 (2563–2567) lists are not published on the
// current TCI site, so no earlier snapshot can be built this way.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCsv } from './csv.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'data/tci_journals.csv')
const OUT = join(ROOT, 'data/tci_snapshots/2025.csv')

const page = async (slug) => {
  const res = await fetch('https://tci-thailand.org/backend/content/fetch_content_from_slug', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug }) })
  if (!res.ok) throw new Error(`TCI HTTP ${res.status}`)
  return (await res.json()).content.content_th
}
const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
/** [{heading, rows}] for every table on the page; heading = text just before it. */
function tables(h) {
  const out = []
  let heading = ''
  for (const part of h.split(/(<table[^>]*>[\s\S]*?<\/table>)/)) {
    if (part.startsWith('<table')) {
      const rows = [...part.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => text(c[1])))
      out.push({ heading, rows })
    } else heading = text(part).slice(-120)
  }
  return out
}
const normIssn = (s) => (s ?? '').replace(/[^0-9Xx]/g, '').toUpperCase()
const normName = (s) => (s ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\bthe\b/g, ' ').replace(/\s+/g, ' ').trim()

const rows = parseCsv(readFileSync(SRC, 'utf8'))
const header = rows[0]
const list = rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])))
const byIssn = new Map()
const byName = new Map()
for (const j of list) {
  for (const i of [j.issn, j.eissn]) if (i) byIssn.set(normIssn(i), j)
  for (const n of [j.name_eng, j.name_local]) if (n) byName.set(normName(n), j)
}
const find = (th, en, issn, eissn) => byIssn.get(normIssn(issn)) ?? byIssn.get(normIssn(eissn)) ?? byName.get(normName(en)) ?? byName.get(normName(th))

const moves = [] // [journal, tierIn2025]
let unmatched = 0
for (const { heading, rows: trs } of tables(await page('ShMW7Gg5c9'))) {
  const m = heading.match(/กลุ่มที่ (\d) ได้เลื่อนเป็นวารสาร กลุ่มที่ (\d)/)
  if (!m) continue
  for (const tr of trs.slice(1)) {
    const [, th, en, issn, eissn] = tr
    const j = find(th, en, issn, eissn)
    if (j) moves.push([j, m[1]])
    else unmatched++, console.warn(`[backfill] not in today's list: ${en || th} ${issn} ${eissn}`)
  }
}
const removed = []
for (const { heading, rows: trs } of tables(await page('ZuPDWfSMxZ'))) {
  if (!/รายชื่อวารสารใหม่ ปี พ.ศ. 2569/.test(heading)) continue
  for (const tr of trs.slice(1)) {
    const [, en, th, issn, eissn] = tr
    const j = find(th, en, issn, eissn)
    if (j) removed.push(j)
    else unmatched++, console.warn(`[backfill] new-2569 journal not in today's list: ${en} ${issn}`)
  }
}
const tier2025 = new Map(moves.map(([j, t]) => [j.id, t]))
const drop = new Set(removed.map((j) => j.id))
const out = list.filter((j) => !drop.has(j.id)).map((j) => ({ ...j, tci_tier: tier2025.get(j.id) ?? j.tci_tier }))
const cell = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, [header.join(','), ...out.map((j) => header.map((h) => cell(j[h] ?? '')).join(','))].join('\n') + '\n')
console.log(`[backfill] 2025 snapshot: ${out.length} journals; ${moves.length} tiers reverted, ${removed.length} new-2569 journals removed, ${unmatched} unmatched -> data/tci_snapshots/2025.csv`)
