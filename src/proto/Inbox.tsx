// "งานรอดำเนินการ" in the app-shell prototype: a list on the left and the selected item on the right,
// like a mail inbox. On a phone the list and the detail take turns (the detail has a back button).
// Decisions here are local to the prototype and are never sent to the backend.
import { CONFERENCE_TAG } from '../conferences'
import { STATUS_TH, TYPE_TH, type SubmissionStatus } from '../submissions'
import type { Faculty } from '../types'
import { Segmented, displayName } from '../ui'
import type { InboxItem, InboxStatus } from './inboxItems'

export type InboxShow = InboxStatus | 'all'
export type InboxKind = 'all' | 'conference' | 'submission'

const KIND_TH = { conference: 'งานประชุม', submission: 'ผลงานที่อาจารย์เพิ่มเอง' } as const

export function Inbox({
  items,
  faculty,
  selectedId,
  show,
  kind,
  onShow,
  onKind,
  onConf,
  onSub,
}: {
  items: InboxItem[]
  faculty: Faculty[]
  selectedId: string | null
  show: InboxShow
  kind: InboxKind
  onShow: (s: InboxShow) => void
  onKind: (k: InboxKind) => void
  onConf: (key: string, name: string, decision: 'count' | 'no_count' | 'clear') => void
  onSub: (id: string, status: SubmissionStatus) => void
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
    <div className={`inbox${selected ? ' has-selection' : ''}`}>
      <section className="inbox-list" aria-label="รายการงาน">
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
            {selected.kind === 'conference' ? <ConfDetail item={selected} nameOf={nameOf} onConf={onConf} /> : <SubDetail item={selected} nameOf={nameOf} onSub={onSub} />}
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

function ConfDetail({ item, nameOf, onConf }: { item: Extract<InboxItem, { kind: 'conference' }>; nameOf: (k: string) => string; onConf: (key: string, name: string, d: 'count' | 'no_count' | 'clear') => void }) {
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
        <button type="button" className="btn btn-primary" aria-pressed={match.by === 'admin' && match.verdict === 'count'} onClick={() => onConf(match.key, item.title, 'count')}>
          นับ
        </button>
        <button type="button" className="btn" aria-pressed={match.by === 'admin' && match.verdict === 'no_count'} onClick={() => onConf(match.key, item.title, 'no_count')}>
          ไม่นับ
        </button>
        {item.status === 'decided' && (
          <button type="button" className="btn btn-quiet" onClick={() => onConf(match.key, item.title, 'clear')}>
            ยกเลิกการตัดสิน
          </button>
        )}
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

function SubDetail({ item, nameOf, onSub }: { item: Extract<InboxItem, { kind: 'submission' }>; nameOf: (k: string) => string; onSub: (id: string, s: SubmissionStatus) => void }) {
  const s = item.sub
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
        <button type="button" className="btn btn-primary" aria-pressed={s.status === 'approved'} onClick={() => onSub(s.id, 'approved')}>
          อนุมัติ
        </button>
        <button type="button" className="btn" aria-pressed={s.status === 'rejected'} onClick={() => onSub(s.id, 'rejected')}>
          ไม่อนุมัติ
        </button>
        {s.status !== 'pending' && (
          <button type="button" className="btn btn-quiet" onClick={() => onSub(s.id, 'pending')}>
            ยกเลิกการตัดสิน
          </button>
        )}
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
