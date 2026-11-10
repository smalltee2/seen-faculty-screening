// "งานรอดำเนินการ" in the web app (sfs_webapp.html): a list on the left and the selected item on the
// right, like a mail inbox. On a phone the list and the detail take turns (the detail has a back button).
// The buttons are the site's own: ConfButtons (confDecide) and the approval table's "decide" call.
import { useRef, useState, type PointerEvent } from 'react'
import { CONFERENCE_TAG } from '../conferences'
import { api, errorText, sessionStore } from '../emailLogin'
import { ConfButtons, LeafSpinner } from '../pages/AdminPage'
import { STATUS_TH, TYPE_TH, type SubmissionStatus } from '../submissions'
import type { Faculty } from '../types'
import { Segmented, displayName } from '../ui'
import type { InboxItem, InboxStatus } from './inboxItems'

export type InboxShow = InboxStatus | 'all'
export type InboxKind = 'all' | 'conference' | 'submission'

// List width in px, dragged by the divider and kept per browser.
const LIST_WIDTH_KEY = 'seen-webapp-inbox-width'
export const DEFAULT_LIST = 400
export const MIN_LIST = 240
export const MIN_DETAIL = 360
function readListWidth(): number {
  try {
    const v = Number(localStorage.getItem(LIST_WIDTH_KEY))
    return Number.isFinite(v) && v >= MIN_LIST ? v : DEFAULT_LIST
  } catch {
    return DEFAULT_LIST
  }
}

const KIND_TH = { conference: 'งานประชุม', submission: 'ผลงานที่อาจารย์เพิ่มเอง' } as const

export function Inbox({
  items,
  faculty,
  selectedId,
  show,
  kind,
  onShow,
  onKind,
  approvalKey,
  onConfChanged,
  onSubChanged,
}: {
  items: InboxItem[]
  faculty: Faculty[]
  selectedId: string | null
  show: InboxShow
  kind: InboxKind
  onShow: (s: InboxShow) => void
  onKind: (k: InboxKind) => void
  approvalKey?: string
  onConfChanged: () => unknown
  onSubChanged: () => unknown
}) {
  const box = useRef<HTMLDivElement>(null)
  const [listW, setListW] = useState(readListWidth)
  const maxList = () => Math.max(MIN_LIST, (box.current?.getBoundingClientRect().width ?? 1200) - MIN_DETAIL)
  const clamp = (w: number) => Math.round(Math.min(maxList(), Math.max(MIN_LIST, w)))
  const saveW = (w: number) => {
    const v = clamp(w)
    setListW(v)
    try {
      localStorage.setItem(LIST_WIDTH_KEY, String(v))
    } catch {
      /* not remembered */
    }
  }
  const startDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    const left = box.current?.getBoundingClientRect().left ?? 0
    const handle = e.currentTarget
    handle.setPointerCapture(e.pointerId)
    document.body.classList.add('is-resizing')
    let last = listW
    const move = (ev: globalThis.PointerEvent) => {
      last = clamp(ev.clientX - left)
      setListW(last)
    }
    const up = () => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
      handle.removeEventListener('pointercancel', up)
      document.body.classList.remove('is-resizing')
      saveW(last)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up)
    handle.addEventListener('pointercancel', up)
  }
  const ofKind = kind === 'all' ? items : items.filter((i) => i.kind === kind)
  const list = show === 'all' ? ofKind : ofKind.filter((i) => i.status === show)
  const selected = items.find((i) => i.id === selectedId) ?? null
  const n = (s: InboxStatus) => ofKind.filter((i) => i.status === s).length
  const nameOf = (key: string) => {
    const f = faculty.find((x) => x.nameEn === key)
    return f ? displayName(f) : key
  }

  return (
    <div ref={box} className={`inbox${selected ? ' has-selection' : ''}`} style={{ gridTemplateColumns: `max(${MIN_LIST}px, min(${listW}px, calc(100% - ${MIN_DETAIL}px))) minmax(0, 1fr)` }}>
      <section className="inbox-list" aria-label="รายการงาน">
        {/* Drag this edge to share the width between the list and the detail (Tum, 2026-11-11).
            Arrow keys move it too; a double click goes back to the default width. */}
        <div
          className="inbox-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="ปรับความกว้างของรายการ"
          aria-valuenow={listW}
          aria-valuemin={MIN_LIST}
          aria-valuemax={maxList()}
          tabIndex={0}
          title="ลากเพื่อปรับความกว้าง · ดับเบิลคลิกเพื่อกลับค่าเดิม"
          onPointerDown={startDrag}
          onDoubleClick={() => saveW(DEFAULT_LIST)}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 80 : 24
            if (e.key === 'ArrowLeft') saveW(listW - step)
            else if (e.key === 'ArrowRight') saveW(listW + step)
            else if (e.key === 'Home') saveW(MIN_LIST)
            else if (e.key === 'End') saveW(maxList())
            else return
            e.preventDefault()
          }}
        />
        <div className="inbox-tools">
          <Segmented
            label="สถานะ"
            value={show}
            onChange={onShow}
            options={[
              { id: 'pending' as const, label: `รอดำเนินการ (${n('pending')})` },
              { id: 'decided' as const, label: `ตัดสินแล้ว (${n('decided')})` },
              { id: 'all' as const, label: `ทั้งหมด (${ofKind.length})` },
            ]}
          />
          <div className="chip-row" role="group" aria-label="ประเภทงาน">
            {(['all', 'conference', 'submission'] as const).map((k) => (
              <button key={k} type="button" className="chip-btn" aria-pressed={kind === k} onClick={() => onKind(k)}>
                {k === 'all' ? 'ทุกประเภท' : KIND_TH[k]}
              </button>
            ))}
          </div>
        </div>
        {list.length === 0 ? (
          <p className="inbox-empty">{show === 'pending' ? 'ไม่มีงานค้าง ดำเนินการครบแล้ว' : 'ไม่มีรายการ'}</p>
        ) : (
          <ul className="inbox-items">
            {list.map((i) => (
              <li key={i.id}>
                <a className="inbox-item" href={`#/inbox/${encodeURIComponent(i.id)}`} aria-current={i.id === selectedId ? 'true' : undefined}>
                  <span className="inbox-item-top">
                    <span className={`kind-dot kind-${i.kind}`} aria-hidden="true" />
                    <span className="inbox-item-kind">{KIND_TH[i.kind]}</span>
                    <StatusPill item={i} />
                  </span>
                  <span className="inbox-item-title">{i.title}</span>
                  <span className="inbox-item-sub">{subLine(i, nameOf)}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="inbox-detail" aria-label="รายละเอียด">
        {selected ? (
          <>
            <a className="inbox-back" href="#/inbox">
              ‹ กลับไปที่รายการ
            </a>
            {selected.kind === 'conference' ? (
              <ConfDetail item={selected} nameOf={nameOf} approvalKey={approvalKey} onChanged={onConfChanged} />
            ) : (
              <SubDetail item={selected} nameOf={nameOf} approvalKey={approvalKey} onChanged={onSubChanged} />
            )}
          </>
        ) : (
          <div className="inbox-placeholder">
            <p>เลือกรายการทางซ้ายเพื่อดูรายละเอียดและตัดสิน</p>
          </div>
        )}
      </section>
    </div>
  )
}

function subLine(i: InboxItem, nameOf: (k: string) => string): string {
  if (i.kind === 'submission') return `${nameOf(i.sub.nameEn)} · ${TYPE_TH[i.sub.type]} · ${i.sub.year}`
  const ps = i.group.pubs
  const works = new Set(ps.map((p) => p.titleNorm)).size
  const people = [...new Set(ps.map((p) => p.key))]
  const years = [...new Set(ps.map((p) => p.year).filter(Boolean))].sort().join(', ')
  return `${works} ผลงาน · ${people.length} คน · ปี ${years}`
}

function StatusPill({ item }: { item: InboxItem }) {
  if (item.kind === 'submission') {
    const s = item.sub.status
    return <span className={`pill pill-${s === 'approved' ? 'ok' : s === 'rejected' ? 'no' : 'wait'}`}>{STATUS_TH[s]}</span>
  }
  const m = item.group.match
  if (item.status === 'decided') return <span className={`pill pill-${m.verdict === 'count' ? 'ok' : 'no'}`}>{m.verdict === 'count' ? 'นับ' : 'ไม่นับ'}</span>
  return <span className="pill pill-wait">รอตัดสิน</span>
}

function ConfDetail({ item, nameOf, approvalKey, onChanged }: { item: Extract<InboxItem, { kind: 'conference' }>; nameOf: (k: string) => string; approvalKey?: string; onChanged: () => unknown }) {
  const { match, pubs } = item.group
  const e = match.entry
  const works = [...new Map(pubs.map((p) => [p.titleNorm, p])).values()]
  return (
    <article className="detail">
      <header className="detail-head">
        <p className="detail-kind">
          <span className="kind-dot kind-conference" aria-hidden="true" /> งานประชุม · <StatusPill item={item} />
        </p>
        <h2>{item.title}</h2>
        {match.key.startsWith('work:') ? null : <p className="muted small">{pubs[0]?.venue}</p>}
      </header>

      <div className="detail-actions" role="group" aria-label="ตัดสินงานประชุม">
        <ConfButtons ckey={match.key} name={item.title} decided={!!e?.decision} approvalKey={approvalKey} onChanged={onChanged} />
      </div>

      <dl className="detail-facts">
        <div>
          <dt>ผลตรวจอัตโนมัติ</dt>
          <dd>
            {CONFERENCE_TAG[match.verdict]} · {match.reason}
          </dd>
        </div>
        <div>
          <dt>ผู้จัด</dt>
          <dd>{e?.organiser || '—'}</dd>
        </div>
        <div>
          <dt>สมาคม</dt>
          <dd>{e?.association ? `${e.association} (${e.associationRole === 'organiser' ? 'จัด' : e.associationRole === 'co_organiser' ? 'ร่วมจัด' : 'ไม่ชัดเจน'})` : '—'}</dd>
        </div>
        <div>
          <dt>สาขา</dt>
          <dd>{e ? `${e.field || '—'} (${e.relatedField === 'yes' ? 'เกี่ยวข้อง' : e.relatedField === 'no' ? 'ไม่เกี่ยวข้อง' : 'ไม่แน่ใจ'})` : '—'}</dd>
        </div>
        <div>
          <dt>ตรวจโดย</dt>
          <dd>{match.by === 'admin' ? e?.decidedBy || 'ผู้ดูแล' : e ? `AI (${e.checkedAt.slice(0, 10)}) ความมั่นใจ ${e.confidence}` : 'ยังไม่ได้ตรวจ'}</dd>
        </div>
        {e?.evidenceUrl && (
          <div>
            <dt>หลักฐาน</dt>
            <dd>
              <a href={e.evidenceUrl} target="_blank" rel="noreferrer">
                เปิดหลักฐาน ↗
              </a>
            </dd>
          </div>
        )}
      </dl>

      <h3 className="detail-sub">ผลงานในงานประชุมนี้ ({works.length})</h3>
      <ul className="detail-works">
        {works.map((w) => (
          <li key={w.titleNorm}>
            <span className="detail-work-title">{w.title}</span>
            <span className="muted small">
              {w.year ?? '—'} ·{' '}
              {[...new Set(pubs.filter((p) => p.titleNorm === w.titleNorm).map((p) => p.key))].map((k, i) => (
                <span key={k}>
                  {i > 0 && ', '}
                  <a href={`#/person/${encodeURIComponent(k)}`}>{nameOf(k)}</a>
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </article>
  )
}

function SubDetail({ item, nameOf, approvalKey, onChanged }: { item: Extract<InboxItem, { kind: 'submission' }>; nameOf: (k: string) => string; approvalKey?: string; onChanged: () => unknown }) {
  const s = item.sub
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Same call as the approval table on sfs.html (ApproveWorks in src/pages/AdminPage.tsx).
  const decide = async (status: SubmissionStatus) => {
    setBusy(true)
    setError('')
    try {
      const r = await api({ action: 'decide', session: sessionStore.get(), adminKey: approvalKey ?? '', id: s.id, status })
      if (r.ok) await onChanged() // spinner stays until the list shows the new status
      else setError(errorText(r.error))
    } catch {
      setError(errorText(''))
    } finally {
      setBusy(false)
    }
  }
  return (
    <article className="detail">
      <header className="detail-head">
        <p className="detail-kind">
          <span className="kind-dot kind-submission" aria-hidden="true" /> ผลงานที่อาจารย์เพิ่มเอง · <StatusPill item={item} />
        </p>
        <h2>{s.title}</h2>
        <p className="muted small">
          <a href={`#/person/${encodeURIComponent(s.nameEn)}`}>{nameOf(s.nameEn)}</a> · ส่งเมื่อ {s.created.slice(0, 10)}
        </p>
      </header>
      <div className="detail-actions" role="group" aria-label="อนุมัติผลงาน">
        <button type="button" className="btn btn-primary" disabled={busy || s.status === 'approved'} onClick={() => void decide('approved')}>
          อนุมัติ
        </button>
        <button type="button" className="btn" disabled={busy || s.status === 'rejected'} onClick={() => void decide('rejected')}>
          ไม่อนุมัติ
        </button>
        {s.status !== 'pending' && (
          <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => void decide('pending')}>
            ยกเลิกการตัดสิน
          </button>
        )}
        {busy && <LeafSpinner />}
        {error && <span className="gate-error small">{error}</span>}
      </div>
      <dl className="detail-facts">
        <div>
          <dt>ประเภท</dt>
          <dd>
            {TYPE_TH[s.type]} · {s.research ? 'งานวิจัย' : 'ไม่ใช่งานวิจัย'}
          </dd>
        </div>
        <div>
          <dt>ปี</dt>
          <dd>{s.year}</dd>
        </div>
        <div>
          <dt>แหล่งตีพิมพ์</dt>
          <dd>
            {s.venue}
            {s.volume && ` · ${s.volume}`}
          </dd>
        </div>
        <div>
          <dt>ผู้แต่ง</dt>
          <dd>{s.authors || '—'}</dd>
        </div>
        <div>
          <dt>DOI</dt>
          <dd>{s.doi ? <a href={`https://doi.org/${s.doi}`} target="_blank" rel="noreferrer">{s.doi} ↗</a> : '—'}</dd>
        </div>
        {s.note && (
          <div>
            <dt>หมายเหตุ</dt>
            <dd>{s.note}</dd>
          </div>
        )}
      </dl>
    </article>
  )
}
