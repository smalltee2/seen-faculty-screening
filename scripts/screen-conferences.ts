// Conference screening for proceedings: finds conferences not yet in data/conferences.csv,
// asks Claude Code (headless `claude -p` with web search, structured JSON output) who
// organises each one, and appends the answers to the register. The site then counts a
// proceedings paper only when an academic/professional association organises or
// co-organises the conference and the field is environment or energy; anything unclear is
// shown but not counted until an admin fills the `decision` column (Tum, 2026-11-06).
//
//   npx tsx scripts/screen-conferences.ts            # check every new conference
//   npx tsx scripts/screen-conferences.ts --list     # only print the queue
//   npx tsx scripts/screen-conferences.ts --limit 3  # at most 3 lookups this run
//   npx tsx scripts/screen-conferences.ts --model sonnet
//
// Needs `claude` on PATH and a signed-in session (`claude login`). Run after
// scripts/build-data.mjs so src/generated/data.json is current.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCsv } from './csv.mjs'
import { preparePubs } from '../src/classify'
import { conferenceKey } from '../src/conferences'
import type { ConferenceEntry, DataBundle, Pub, RawPub } from '../src/types'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const REGISTER = join(ROOT, 'data/conferences.csv')
const COLS = ['key', 'display_name', 'conference_name', 'organiser', 'association', 'association_role', 'field', 'related_field', 'confidence', 'evidence_url', 'checked_at', 'checked_by', 'note', 'decision', 'decided_by', 'decided_at', 'decision_note'] as const

const args = process.argv.slice(2)
const flag = (name: string) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const LIST_ONLY = args.includes('--list')
const LIMIT = Number(flag('--limit') ?? Infinity)
const MODEL = flag('--model') ?? 'sonnet'

const SCHEMA = {
  type: 'object',
  properties: {
    conference_name: { type: 'string' },
    organiser: { type: 'string' },
    association: { type: 'string' },
    association_role: { type: 'string', enum: ['organiser', 'co_organiser', 'none', 'unknown'] },
    field: { type: 'string' },
    related_field: { type: 'string', enum: ['yes', 'no', 'unknown'] },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    evidence_url: { type: 'string' },
    note: { type: 'string' },
  },
  required: ['conference_name', 'organiser', 'association', 'association_role', 'field', 'related_field', 'confidence', 'evidence_url', 'note'],
  additionalProperties: false,
}
type Answer = {
  conference_name: string
  organiser: string
  association: string
  association_role: ConferenceEntry['associationRole']
  field: string
  related_field: ConferenceEntry['relatedField']
  confidence: ConferenceEntry['confidence']
  evidence_url: string
  note: string
}

function readRegister(): ConferenceEntry[] {
  if (!existsSync(REGISTER)) return []
  const rows = parseCsv(readFileSync(REGISTER, 'utf8'))
  const header = rows[0].map((h) => h.trim())
  return rows.slice(1).map((r) => {
    const rec: Record<string, string> = {}
    header.forEach((h, i) => (rec[h] = (r[i] ?? '').trim()))
    return {
      key: rec.key, displayName: rec.display_name, conferenceName: rec.conference_name, organiser: rec.organiser, association: rec.association,
      associationRole: rec.association_role as ConferenceEntry['associationRole'], field: rec.field, relatedField: rec.related_field as ConferenceEntry['relatedField'],
      confidence: rec.confidence as ConferenceEntry['confidence'], evidenceUrl: rec.evidence_url, checkedAt: rec.checked_at, checkedBy: rec.checked_by, note: rec.note,
      decision: rec.decision as ConferenceEntry['decision'], decidedBy: rec.decided_by, decidedAt: rec.decided_at, decisionNote: rec.decision_note,
    }
  })
}

const csvField = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
function writeRegister(entries: ConferenceEntry[]): void {
  const toRow = (e: ConferenceEntry) => [e.key, e.displayName, e.conferenceName, e.organiser, e.association, e.associationRole, e.field, e.relatedField, e.confidence, e.evidenceUrl, e.checkedAt, e.checkedBy, e.note, e.decision, e.decidedBy, e.decidedAt, e.decisionNote]
  const lines = [COLS.join(','), ...entries.sort((a, b) => a.key.localeCompare(b.key)).map((e) => toRow(e).map(csvField).join(','))]
  writeFileSync(REGISTER, lines.join('\n') + '\n')
}

/** Proceedings grouped by conference key, newest first. */
function queue(pubs: Pub[], known: Set<string>): { key: string; pubs: Pub[] }[] {
  const groups = new Map<string, Pub[]>()
  // Only conferences that can still fall in an evaluation window (this year's and next year's).
  const minYear = new Date().getFullYear() - 5
  for (const p of pubs) {
    if ((p.type !== 'proceeding' && p.type !== 'poster') || (p.year ?? 0) < minYear) continue
    const k = conferenceKey(p)
    if (known.has(k)) continue
    groups.set(k, [...(groups.get(k) ?? []), p])
  }
  return [...groups].map(([key, ps]) => ({ key, pubs: ps.sort((a, b) => (b.year ?? 0) - (a.year ?? 0)) })).sort((a, b) => (b.pubs[0].year ?? 0) - (a.pubs[0].year ?? 0))
}

function prompt(key: string, pubs: Pub[]): string {
  const sample = pubs.slice(0, 3).map((p) => `- "${p.title}" (${p.year ?? 'n.d.'}) in "${p.venue}"${p.doi ? `, DOI ${p.doi}` : ''}; author: ${p.key}, University of Phayao, Thailand`).join('\n')
  const byWork = key.startsWith('work:')
  return `You are checking an academic conference for a Thai university's lecturer-qualification screening (เกณฑ์มาตรฐานหลักสูตร พ.ศ. 2565).
${byWork ? 'This paper appeared in a publisher series that bundles many conferences, so first identify the actual conference it was presented at (use the DOI or title).' : 'Identify this conference (every edition counts as the same conference).'}
Paper(s):
${sample}

Search the web for the conference's official page or proceedings front matter and report, as structured JSON only:
- conference_name: the full official name (without edition number)
- organiser: who organises it (institutions, companies, associations), as listed on the official page
- association: the academic or professional association (สมาคมวิชาการ/วิชาชีพ, e.g. "Environmental Engineering Association of Thailand", "Thai Society of Agricultural Engineering", "IEEE") that organises or co-organises it, or "" if none
- association_role: "organiser" if an association organises it, "co_organiser" if an association co-organises or co-hosts it with others, "none" if no association is involved (e.g. a university, a company, a government agency, or a commercial conference organiser runs it alone), "unknown" if you could not find who organises it
- field: the conference's subject field in a few words
- related_field: "yes" if the conference is held for, or its main field is, environment (environmental science/engineering/technology/management, pollution, climate, ecology, natural resources, geoinformatics/remote sensing for earth and environmental sciences) or energy (renewable energy, energy technology/engineering/management, power); this includes conferences whose stated purpose or scope serves environmental or energy work even if the name does not say so; "no" when the main field is something else (e.g. general multidisciplinary university conferences, business/IT, materials science, mechanical engineering) even if a minor track touches environment or energy; "unknown" if unclear
- confidence: "high" only when an official page or the proceedings front matter states the organisers; "medium" when inferred from a reliable secondary source (publisher page, university news); "low" otherwise
- evidence_url: the single page you relied on most
- note: one sentence of context (e.g. "co-hosted by X and Y"; or why it could not be found)
Do not guess an association that the sources do not name. If nothing reliable is found, say so with association_role "unknown" and confidence "low".`
}

function ask(key: string, pubs: Pub[]): Answer {
  const out = execFileSync(
    'claude',
    ['-p', '--model', MODEL, '--allowedTools', 'WebSearch,WebFetch', '--max-turns', '15', '--output-format', 'json', '--json-schema', JSON.stringify(SCHEMA), prompt(key, pubs)],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 10 * 60 * 1000 },
  )
  const res = JSON.parse(out) as { is_error?: boolean; result?: string; structured_output?: Answer }
  if (res.is_error) throw new Error(`claude: ${res.result}`)
  if (!res.structured_output) throw new Error(`claude returned no structured output: ${String(res.result).slice(0, 200)}`)
  return res.structured_output
}

/** Proceedings/posters lecturers added on "ตรวจสอบคุณสมบัติของฉัน" (pending or approved), read from the
 *  login backend's public list, so their conferences are checked before an admin approves them. */
async function submittedRows(data: DataBundle): Promise<RawPub[]> {
  const url = (data.sources as { loginApiUrl?: string }).loginApiUrl
  if (!url) return []
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'list' }), redirect: 'follow' })
    const js = (await res.json()) as { ok: boolean; items?: { id: string; nameEn: string; year: number; title: string; authors: string; type: string; venue: string; volume: string; status: string }[] }
    return (js.items ?? [])
      .filter((s) => (s.status === 'pending' || s.status === 'approved') && (s.type === 'proceeding' || s.type === 'poster'))
      .map((s, i) => ({ line: i + 1, source: 'manual' as const, key: s.nameEn, year: s.year, title: s.title, authors: s.authors, venue: `${[s.venue, s.volume].filter(Boolean).join(' ')}, ${s.year}`, cites: 0, extType: s.type, submitted: `self:${s.id}` }))
  } catch (e) {
    console.log(`[screen-conferences] could not read lecturer-added works (${(e as Error).message}); continuing without them`)
    return []
  }
}

async function main(): Promise<void> {
  const data = JSON.parse(readFileSync(join(ROOT, 'src/generated/data.json'), 'utf8')) as DataBundle
  const own = data.publications.filter((p) => data.faculty.some((f) => f.nameEn === p.key))
  const known = new Set(own.map((p) => p.submitted).filter(Boolean))
  const extra = (await submittedRows(data)).filter((r) => !known.has(r.submitted))
  const pubs = preparePubs([...own, ...extra], data.overrides, [])
  const register = readRegister()
  const todo = queue(pubs, new Set(register.map((e) => e.key)))
  console.log(`[screen-conferences] ${register.length} in register, ${todo.length} conference(s) to check`)
  for (const t of todo) console.log(`  ${t.key}  (${t.pubs.length} paper(s), ${t.pubs[0].year})`)
  if (LIST_ONLY || !todo.length) return

  let n = 0
  for (const t of todo) {
    if (n >= LIMIT) break
    n++
    const label = t.key.startsWith('work:') ? t.pubs[0].title : t.pubs[0].venue
    process.stdout.write(`[screen-conferences] ${n}/${Math.min(LIMIT, todo.length)} ${label.slice(0, 70)} … `)
    try {
      const a = ask(t.key, t.pubs)
      register.push({
        key: t.key, displayName: label, conferenceName: a.conference_name, organiser: a.organiser, association: a.association,
        associationRole: a.association_role, field: a.field, relatedField: a.related_field, confidence: a.confidence, evidenceUrl: a.evidence_url,
        checkedAt: new Date().toISOString(), checkedBy: `claude-code (${MODEL})`, note: a.note, decision: '', decidedBy: '', decidedAt: '', decisionNote: '',
      })
      writeRegister(register) // save after each answer so an interrupted run keeps its work
      console.log(`${a.association_role} / ${a.related_field} / ${a.confidence}${a.association ? ` — ${a.association}` : ''}`)
    } catch (e) {
      console.log(`FAILED: ${(e as Error).message.split('\n')[0]}`)
    }
  }
}

main().catch((e) => {
  console.error(`[screen-conferences] ${(e as Error).message}`)
  process.exit(1)
})
