// The level-2 pages on a phone (Tum, 2026-11-12: "upgrade mobile version ทั้งหมด", after the
// mail-style personal page): the outlook, the decision history and the admin-form works as lists.
// A row shows what and when; a tap opens the rest. The desktop tables are unchanged.
import { useState, type ReactNode } from 'react'
import { KIND_TH, type HistoryEntry, type HistoryKind } from '../history'
import { leavingWorks, type OutlookPerson } from '../outlook'
import { toBE } from '../rules'
import type { Faculty, Pub } from '../types'
import { TYPE_LABEL, displayName, roleShort, yearLabel } from '../ui'
import { initial } from './MobileLecturers'
import { LEVEL_SHORT } from './MobileMe'

/** Short names of the history groups for the chips. */
export const KIND_SHORT: Record<HistoryKind, string> = { conference: 'งานประชุม', submission: 'อาจารย์เพิ่มเอง', form: 'แบบฟอร์ม', notice: 'อีเมล' }
const KIND_MARK: Record<HistoryKind, string> = { conference: 'P', submission: 'อ', form: 'ฟ', notice: '@' }

/** "12 พ.ย. 19:20" in Thai time; the text itself when it is not a date. */
export function stampShort(iso: string): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return iso || '–'
  return new Date(t).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Bangkok' }).replace(/\s*น\.$/, '')
}

export function Chips<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="mme-chips madm-chips" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" role="tab" aria-selected={value === o.id} className={value === o.id ? 'on' : ''} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Lecturers who first stop meeting a duty in the chosen year. */
export function MobileOutlook({ rows, year }: { rows: OutlookPerson[]; year: number }) {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <ul className="mme-works">
      {rows.length === 0 && <li className="mme-empty">ไม่มีผู้ที่จะเริ่มไม่ผ่านในปี {toBE(year)}</li>}
      {rows.map((p) => {
        const f = p.result.person
        const isOpen = open === f.nameEn
        const need = Math.max(0, ...p.roles.map((o) => o.need))
        const leaving = leavingWorks(p.roles)
        return (
          <li key={f.nameEn}>
            <button type="button" className="mme-work mlist-row" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : f.nameEn)}>
              <span className="mme-type mlist-avatar warn" aria-hidden="true">
                {initial(displayName(f))}
              </span>
              <span className="mme-work-main">
                <span className="mme-title">{displayName(f)}</span>
                <span className="mme-venue mlist-warn">ไม่ผ่าน {p.roles.length} หน้าที่</span>
              </span>
              {need > 0 && (
                <span className="mlist-count">
                  <b>+{need}</b>
                  <small>ต้องเพิ่ม</small>
                </span>
              )}
            </button>
            {isOpen && (
              <div className="mme-detail">
                {p.roles.map((o) => (
                  <p key={o.role.id}>
                    <b>
                      {LEVEL_SHORT[o.role.level] ?? o.role.level} · {roleShort(o.role.id)}
                    </b>{' '}
                    <span className="muted">
                      {o.need > 0 ? `ต้องเพิ่ม ${o.need}${o.shortResearch > 0 ? ` (วิจัย ≥ ${o.shortResearch})` : ''}` : o.reason || '—'}
                      {o.path === 'new_grad' && ' · ข้อยกเว้นผู้สำเร็จการศึกษาใหม่หมดอายุ'}
                    </span>
                  </p>
                ))}
                {leaving.length > 0 && (
                  <>
                    <p className="madm-sub">ผลงานที่พ้นช่วง 5 ปี</p>
                    {leaving.map((w) => (
                      <p key={w.id} className="muted">
                        {w.title} ({w.year})
                      </p>
                    ))}
                  </>
                )}
                <p>
                  <a href={`#/person/${encodeURIComponent(f.nameEn)}`}>ดูผลงานทั้งหมด →</a>
                </p>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** Names an entry across reloads of the lists (same rule as the desktop table). */
const entryId = (e: HistoryEntry) => `${e.at}|${e.kind}|${e.target}|${e.action}`

export function MobileHistoryList({ entries, confirm, busy, onAsk, onUndo, spinner }: { entries: HistoryEntry[]; confirm: HistoryEntry | null; busy: boolean; onAsk: (e: HistoryEntry | null) => void; onUndo: (e: HistoryEntry) => void; spinner?: ReactNode }) {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <ul className="mme-works">
      {entries.length === 0 && <li className="mme-empty">ยังไม่มีประวัติ</li>}
      {entries.map((e, i) => {
        const id = `${entryId(e)}|${i}`
        const isOpen = open === id
        const asking = confirm !== null && entryId(confirm) === entryId(e)
        return (
          <li key={id}>
            <button type="button" className="mme-work" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : id)}>
              <span className={`mme-type madm-k-${e.kind}`} aria-hidden="true">
                {KIND_MARK[e.kind]}
              </span>
              <span className="mme-work-main">
                <span className="mme-title">{e.action}</span>
                <span className="mme-venue">{e.target}</span>
              </span>
              <span className="mme-when">{stampShort(e.at)}</span>
            </button>
            {isOpen && (
              <div className="mme-detail">
                <p>{e.target}</p>
                <p className="muted">
                  {KIND_TH[e.kind]}
                  {e.by && ` · ${e.by}`}
                </p>
                {e.note && <p className="muted">{e.note}</p>}
                {e.undo &&
                  (asking ? (
                    <p className="madm-actions">
                      <span>{e.undoLabel}?</span>
                      <button type="button" className="btn btn-small btn-primary" disabled={busy} onClick={() => onUndo(e)}>
                        ยืนยัน
                      </button>
                      <button type="button" className="btn btn-small" disabled={busy} onClick={() => onAsk(null)}>
                        ไม่ย้อน
                      </button>
                      {busy && spinner}
                    </p>
                  ) : (
                    <p className="madm-actions">
                      <button type="button" className="btn btn-small" disabled={busy} onClick={() => onAsk(e)}>
                        ย้อนกลับ
                      </button>
                    </p>
                  ))}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** Works added through the admin form; `action` draws the cancel button of a work. */
export function MobileFormList({ rows, person, action }: { rows: Pub[]; person: (key: string) => Faculty | undefined; action: (p: Pub) => ReactNode }) {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <ul className="mme-works">
      {rows.length === 0 && <li className="mme-empty">ยังไม่มีผลงานจากแบบฟอร์ม</li>}
      {rows.map((p) => {
        const f = person(p.key)
        const isOpen = open === p.id
        return (
          <li key={p.id}>
            <button type="button" className="mme-work" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : p.id)}>
              <span className="mme-type" aria-hidden="true">
                {initial(f ? displayName(f) : p.key)}
              </span>
              <span className="mme-work-main">
                <span className="mme-title">{p.title}</span>
                <span className="mme-venue">{f ? displayName(f) : p.key}</span>
              </span>
              <span className="mme-when">{yearLabel(p.year)}</span>
            </button>
            {isOpen && (
              <div className="mme-detail">
                {p.venue && <p>{p.venue}</p>}
                <p className="muted">
                  {TYPE_LABEL[p.type]}
                  {p.isResearch ? ' · งานวิจัย' : ''}
                  {p.submitted ? ` · ส่ง ${p.submitted}` : ''}
                </p>
                {p.live && <p className="muted">สด · จะบันทึกในรอบ 03:00</p>}
                <div className="madm-actions">{action(p)}</div>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
