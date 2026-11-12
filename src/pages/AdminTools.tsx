// Back-office pages for a level-2 admin (Tum, 2026-11-10): the decision history with undo and
// the outlook for the next two evaluation years.
import { useEffect, useMemo, useState } from 'react'
import type { ConfDecisionItem } from '../confDecisions'
import { api, errorText, sessionStore } from '../emailLogin'
import type { FormCancelItem } from '../formCancel'
import { KIND_TH, buildHistory, fetchDecisionLog, type DecisionLogItem, type HistoryEntry, type HistoryKind } from '../history'
import type { Notice } from '../notify'
import { leavingWorks, outlook } from '../outlook'
import { toBE, yearName, type PersonResult, type Settings } from '../rules'
import type { Submission } from '../submissions'
import type { Faculty } from '../types'
import { SHOWN_ROLES, Segmented, displayName, roleShort } from '../ui'
import { LeafSpinner, PAGE_SIZE, Pager } from './AdminPage'

export type AdminView = 'history' | 'outlook'
export const ADMIN_VIEWS: { id: AdminView; th: string }[] = [
  { id: 'history', th: 'ประวัติการตัดสิน' },
  { id: 'outlook', th: 'แนวโน้ม 1–2 ปีข้างหน้า' },
]
export const isAdminView = (v: string): v is AdminView => ADMIN_VIEWS.some((x) => x.id === v)

const when = (iso: string) => {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? iso || '—' : new Date(t).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' })
}
const personLink = (f: Faculty) => <a href={`#/person/${encodeURIComponent(f.nameEn)}`}>{displayName(f)}</a>
const roleName = (id: string) => {
  const r = SHOWN_ROLES.find((x) => x.id === id)
  return r ? `${roleShort(r.id)} (ข้อ ${r.clause})` : id
}

// ───────────────────────── 1. Decision history ─────────────────────────

/** Names an entry across reloads of the lists (the entry objects are rebuilt each time). */
const entryId = (e: HistoryEntry) => `${e.at}|${e.kind}|${e.target}|${e.action}`

export function HistoryTable({ entries, confirm, busy, onAsk, onUndo }: { entries: HistoryEntry[]; confirm: HistoryEntry | null; busy: boolean; onAsk: (e: HistoryEntry | null) => void; onUndo: (e: HistoryEntry) => void }) {
  if (entries.length === 0) return <p className="note">ยังไม่มีประวัติในหมวดนี้</p>
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>เวลา</th>
            <th>หมวด</th>
            <th>ผู้ตัดสิน</th>
            <th>การตัดสิน</th>
            <th>รายการ</th>
            <th>เหตุผล / หมายเหตุ</th>
            <th className="no-print">ย้อนกลับ</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={`${e.at}|${e.kind}|${e.target}|${i}`}>
              <td className="small">{when(e.at)}</td>
              <td className="small">{KIND_TH[e.kind]}</td>
              <td className="small">{e.by || '—'}</td>
              <td>{e.action}</td>
              <td className="small">{e.target}</td>
              <td className="small">{e.note || '—'}</td>
              <td className="no-print">
                {e.undo &&
                  (confirm !== null && entryId(confirm) === entryId(e) ? (
                    <div className="conf-buttons">
                      <span className="small">{e.undoLabel}?</span>
                      <button type="button" className="btn btn-small btn-primary" disabled={busy} onClick={() => onUndo(e)}>ยืนยัน</button>
                      <button type="button" className="btn btn-small" disabled={busy} onClick={() => onAsk(null)}>ไม่ย้อน</button>
                      {busy && <LeafSpinner />}
                    </div>
                  ) : (
                    <button type="button" className="btn btn-small" disabled={busy} title={e.undoLabel} onClick={() => onAsk(e)}>ย้อนกลับ</button>
                  ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function HistoryPage({ confItems, formCancels, submissions, notices, faculty, approvalKey, onChanged }: { confItems: ConfDecisionItem[]; formCancels: FormCancelItem[]; submissions: Submission[]; notices: Notice[]; faculty: Faculty[]; approvalKey?: string; onChanged: () => unknown }) {
  // undefined = still loading; null = this backend version has no decision log.
  const [log, setLog] = useState<DecisionLogItem[] | null | undefined>(undefined)
  const [kind, setKind] = useState<HistoryKind | 'all'>('all')
  const [page, setPage] = useState(0)
  const [confirm, setConfirm] = useState<HistoryEntry | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // A reload that fails keeps the log already shown.
  const loadLog = () => fetchDecisionLog().then((v) => setLog((prev) => v ?? prev ?? null))
  useEffect(() => {
    void loadLog()
  }, [])
  const all = useMemo(
    () =>
      buildHistory({
        confItems,
        formCancels,
        submissions,
        decisionLog: log ?? null,
        notices,
        nameOf: (n) => {
          const f = faculty.find((x) => x.nameEn === n)
          return f ? displayName(f) : n
        },
      }),
    [confItems, formCancels, submissions, log, notices, faculty],
  )
  const entries = kind === 'all' ? all : all.filter((e) => e.kind === kind)
  const pages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE))
  const cur = Math.min(page, pages - 1)
  const undo = async (e: HistoryEntry) => {
    if (!e.undo) return
    setBusy(true)
    setError('')
    try {
      const r = await api({ ...e.undo, adminKey: approvalKey ?? '', session: sessionStore.get() })
      if (r.ok) {
        await Promise.all([onChanged(), loadLog()])
        setConfirm(null)
      } else setError(errorText(r.error))
    } catch {
      setError(errorText(''))
    } finally {
      setBusy(false)
    }
  }
  const count = (k: HistoryKind) => all.filter((e) => e.kind === k).length
  return (
    <>
      <div className="section-head">
        <div>
          <h1>
            ประวัติการตัดสิน <small className="title-hint">{all.length} รายการ ใหม่สุดอยู่บน</small>
          </h1>
        </div>
      </div>
      <p className="note">
        "ย้อนกลับ" มีเฉพาะการตัดสินครั้งล่าสุดของแต่ละรายการ และตัวการย้อนเองก็ถูกบันทึกเป็นอีกหนึ่งรายการ · การถอนผลงานโดยอาจารย์และอีเมลที่ส่งไปแล้วย้อนไม่ได้
        {log === null && ' · ระบบหลังบ้านรุ่นที่ใช้อยู่ยังไม่ส่งประวัติการอนุมัติผลงานแบบเต็ม จึงแสดงเฉพาะผลการตัดสินล่าสุดของแต่ละผลงาน (ไม่มีชื่อผู้ตัดสิน)'}
      </p>
      <div className="register-tools no-print">
        <Segmented
          label="หมวดของประวัติ"
          value={kind}
          onChange={(v) => {
            setKind(v)
            setPage(0)
            setConfirm(null)
          }}
          options={[{ id: 'all' as const, label: `ทั้งหมด (${all.length})` }, ...(Object.keys(KIND_TH) as HistoryKind[]).map((k) => ({ id: k, label: `${KIND_TH[k]} (${count(k)})` }))]}
        />
        {log === undefined && <LeafSpinner />}
      </div>
      {error && <p className="gate-error" role="alert">{error}</p>}
      <HistoryTable entries={entries.slice(cur * PAGE_SIZE, cur * PAGE_SIZE + PAGE_SIZE)} confirm={confirm} busy={busy} onAsk={setConfirm} onUndo={(e) => void undo(e)} />
      {pages > 1 && (
        <Pager
          page={cur}
          pages={pages}
          onPage={(p) => {
            setPage(p)
            setConfirm(null)
          }}
        />
      )}
    </>
  )
}

// ───────────────────────── 2. Outlook ─────────────────────────

export function OutlookPage({ results, settings }: { results: PersonResult[]; settings: Settings }) {
  const all = useMemo(() => outlook(results, settings, 2, SHOWN_ROLES), [results, settings])
  // One evaluation year at a time (Tum, 2026-11-11): lecturers who first stop meeting a duty that year.
  const years = [settings.year + 1, settings.year + 2]
  const [year, setYear] = useState(years[0])
  const shown = years.includes(year) ? year : years[0]
  const rows = all.filter((r) => r.firstYear === shown)
  return (
    <>
      <div className="section-head">
        <div>
          <h1>
            แนวโน้ม 1–2 ปีข้างหน้า <small className="title-hint">ปีประเมิน {yearName(settings, settings.year + 1)} และ {toBE(settings.year + 2)}</small>
          </h1>
        </div>
      </div>
      <p className="note outlook-note">
        อาจารย์ที่ผ่านเกณฑ์{settings.period === 'academic' ? '' : 'ปี '}{yearName(settings)} แต่จะไม่ผ่านเมื่อผลงานเก่าพ้นช่วง 5 ปี (<b>สมมติไม่มีผลงานใหม่</b> เกณฑ์เดียวกับหน้าข้อมูลอาจารย์)
        · "ต้องเพิ่ม" = จำนวนผลงานขั้นต่ำที่ต้องเพิ่มในปีนั้น
      </p>
      <div className="register-tools no-print">
        <Segmented
          label="ปีที่เริ่มไม่ผ่าน"
          value={String(shown)}
          onChange={(v) => setYear(Number(v))}
          options={years.map((y) => ({ id: String(y), label: `เริ่มไม่ผ่านปี พ.ศ. ${toBE(y)} (${all.filter((r) => r.firstYear === y).length} คน)` }))}
        />
      </div>
      {rows.length === 0 ? (
        <p className="note">ไม่มีอาจารย์ที่จะเริ่มไม่ผ่านเกณฑ์ในปี พ.ศ. {toBE(shown)}</p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>อาจารย์</th>
                <th>หน้าที่</th>
                <th>ไม่ผ่านตั้งแต่ปี</th>
                <th>ต้องเพิ่ม</th>
                <th>ผลงานที่พ้นช่วง 5 ปี</th>
              </tr>
            </thead>
            <tbody>
              {rows.flatMap((p) =>
                p.roles.map((o, i) => (
                  <tr key={`${p.result.person.nameEn}|${o.role.id}`}>
                    {i === 0 && <td className="nowrap" rowSpan={p.roles.length}>{personLink(p.result.person)}</td>}
                    <td className="small">{roleName(o.role.id)}</td>
                    <td className="nowrap">พ.ศ. {toBE(o.lostIn)}</td>
                    <td>
                      {o.need > 0 ? (
                        <>
                          <b>{o.need}</b> รายการ
                          <div className="muted small">
                            {o.shortResearch > 0 && `เป็นงานวิจัยอย่างน้อย ${o.shortResearch}`}
                          </div>
                        </>
                      ) : (
                        <span className="small">{o.reason || '—'}</span>
                      )}
                      {o.path === 'new_grad' && <div className="muted small">ปีนี้ผ่านด้วยข้อยกเว้นผู้สำเร็จการศึกษาใหม่ ซึ่งหมดอายุในปีนั้น</div>}
                    </td>
                    {i === 0 && (
                      <td className="small" rowSpan={p.roles.length}>
                        {leavingWorks(p.roles).length === 0
                          ? '—'
                          : leavingWorks(p.roles).map((w) => (
                              <div key={w.id}>
                                {w.title} <span className="muted">({w.year})</span>
                              </div>
                            ))}
                      </td>
                    )}
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
