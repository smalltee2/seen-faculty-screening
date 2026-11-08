// Talks to the backend for the iMac Scholar job (scripts/scholar-poll.sh).
//   node scripts/scholar-job.mjs waiting          exit 0 if a job is waiting, 1 if not (no token needed)
//   node scripts/scholar-job.mjs run              claim the job, refresh Scholar, write publications.tsv;
//                                                 prints "STATUS<TAB>message" for the finish step
//   node scripts/scholar-job.mjs finish <status> <message>
// The token comes from the SCHOLAR_TOKEN environment variable (Keychain service seen-scholar-token).
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runScholar } from './fetch-scholar.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const API = JSON.parse(readFileSync(join(ROOT, 'data/sources.json'), 'utf8')).loginApiUrl
const token = process.env.SCHOLAR_TOKEN ?? ''
const call = async (body) => {
  const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow', signal: AbortSignal.timeout(60000) })
  return res.json()
}
const update = (status, progress, message) => call({ action: 'scholarJobUpdate', step: 'update', token, status, progress, message }).catch(() => ({}))

const [cmd, ...args] = process.argv.slice(2)
if (cmd === 'waiting') {
  const r = await call({ action: 'scholarJob' }).catch(() => ({}))
  process.exit(r.ok && r.job?.status === 'requested' ? 0 : 1)
} else if (cmd === 'run') {
  const c = await call({ action: 'scholarJobUpdate', step: 'claim', token })
  if (!c.ok) throw new Error(`claim refused: ${c.error}`)
  if (!c.job) {
    console.log('NONE\t')
    process.exit(0)
  }
  try {
    const s = await runScholar({ onProgress: (d, t, name) => void update('running', `${d}/${t}`, name) })
    const summary = `อัปเดต ${s.people}/${s.total} คน · ผลงานใหม่ ${s.added} รายการ · รายการที่ไม่อยู่ใน Scholar แล้ว ${s.removed}${s.addedOnly.length ? ` · เพิ่มอย่างเดียว ${s.addedOnly.length} คน (รายการใหม่สั้นกว่าเดิมมาก)` : ''}`
    if (s.blocked) console.log(`blocked\tGoogle Scholar ขอให้ยืนยันว่าไม่ใช่บอต จึงหยุดที่ ${s.blocked.split(':')[0]} · ${summary} · ลองใหม่ภายหลัง หรือใช้วิธีสำรอง (วางรายการเอง)`)
    else console.log(`done\t${summary}`)
  } catch (e) {
    console.log(`failed\tเกิดข้อผิดพลาด: ${String(e.message).slice(0, 200)}`)
  }
} else if (cmd === 'finish') {
  await update(args[0], '', args.slice(1).join(' '))
} else {
  console.error('usage: scholar-job.mjs waiting | run | finish <status> <message>')
  process.exit(64)
}
