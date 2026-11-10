// "งานรอดำเนินการ" in the web app (sfs_webapp.html): a list on the left and the selected item on the
// right, like a mail inbox. On a phone the list and the detail take turns (the detail has a back button).
// The buttons are the site's own: ConfButtons (confDecide) and the approval table's "decide" call.
import { useState } from 'react'
import { CONFERENCE_TAG } from '../conferences'
import { api, errorText, sessionStore } from '../emailLogin'
import { ConfButtons, LeafSpinner } from '../pages/AdminPage'
import { STATUS_TH, TYPE_TH, type SubmissionStatus } from '../submissions'
import type { Faculty } from '../types'
import { Segmented, displayName } from '../ui'
import type { InboxItem, InboxStatus } from './inboxItems'

export type InboxShow = InboxStatus | 'all'
export type InboxKind = 'all' | 'conference' | 'submission'
/** How the width is shared between the list and the detail (computers and tablets only). */
export const INBOX_LAYOUTS = ['list', 'normal', 'detail'] as const
export type InboxLayout = (typeof INBOX_LAYOUTS)[number]
const LAYOUT_TH: Record<InboxLayout, string> = { list: 'ขยายรายการ', normal: 'แบ่งปกติ', detail: 'ขยายรายละเอียด' }
// Split icons: the shaded part is the side that gets wider.
const LAYOUT_ICON: Record<InboxLayout, string> = { list: 'M12.5 4v12', normal: 'M8 4v12', detail: 'M6 4v12' }
const LAYOUT_FILL: Record<InboxLayout, string> = { list: 'M3.5 4.5h9v11h-9z', normal: '', detail: 'M6 4.5h10.5v11H6z' }

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
  layout = 'normal',
  onLayout = () => undefined,
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
  layout?: InboxLayout
  onLayout?: (l: InboxLayout) => void
}) {
  const ofKind = kind === 'all' ? items : items.filter((i) => i.kind === kind)
  const list = show === 'all' ? ofKind : ofKind.filter((i) => i.status === show)
  const selected = items.find((i) => i.id === selectedId) ?? null
  const n = (s: InboxStatus) => ofKind.filter((i) => i.status === s).length
  const nameOf = (key: string) => {
    const f = faculty.find((x) => x.nameEn === key)
    return f ? displayName(f) : key
  }

  return (
    <div className={`inbox inbox-split-${layout}${selected ? ' has-selection' : ''}`}>
      <section className="inbox-list" aria-label="รายการงาน">
        <div className="inbox-tools">
          <div className="inbox-split" role="group" aria-label="ปรับความกว้างของรายการและรายละเอียด">
            {INBOX_LAYOUTS.map((l) => (
              <button key={l} type="button" className="inbox-split-btn" aria-pressed={layout === l} title={LAYOUT_TH[l]} aria-label={LAYOUT_TH[l]} onClick={() => onLayout(l)}>
                <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4">
                  {LAYOUT_FILL[l] && <path d={LAYOUT_FILL[l]} fill="currentColor" fillOpacity="0.25" stroke="none" />}
                  <rect x="3" y="4" width="14" height="12" rx="1.5" />
                  <path d={LAYOUT_ICON[l]} />
                </svg>
              </button>
            ))}
          </div>
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
