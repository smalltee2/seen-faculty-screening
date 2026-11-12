// "ตรวจสอบคุณสมบัติของฉัน" on a phone (Tum, 2026-11-12: "like Gmail, different from the desktop",
// "cut text that is not needed"). A short summary, one row per level that opens to its duties, the
// works as a mail-style list (tap a row for the details), and a floating button that opens the
// add-work form full screen. The desktop page (PersonPage + AddWork) is unchanged.
import { useState, type ReactNode } from 'react'
import { evaluatePub, inWindow, toBE, type PersonResult, type PubEval, type Settings } from '../rules'
import { SHOWN_LEVELS, SHOWN_ROLES, roleShort } from '../ui'
import { journalLevel, journalTag } from '../tci'
import { TCI } from '../tciIndex'
import { CONFERENCE_TAG } from '../conferences'
import { failReason } from '../notify'
import type { Submission } from '../submissions'

const TH_MONTH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const LEVEL_SHORT: Record<string, string> = { ba: 'ป.ตรี', ms: 'ป.โท', phd: 'ป.เอก', gd: 'ป.บัณฑิต', hgd: 'ป.บัณฑิตชั้นสูง' }
const SRC = { scholar: 'Scholar', openalex: 'OpenAlex', scopus: 'Scopus', tci: 'TCI', manual: 'แบบฟอร์ม' } as const

/** "มิ.ย. 69" when the month is known, else the Buddhist year. */
export function whenShort(pub: { year: number | null; pubMonth?: string }): string {
  if (pub.pubMonth) return `${TH_MONTH[Number(pub.pubMonth.slice(5, 7)) - 1]} ${String(Number(pub.pubMonth.slice(0, 4)) + 543).slice(2)}`
  return pub.year === null ? '–' : String(toBE(pub.year))
}

/** The venue without the trailing year and page details Scholar adds ("Journal 18 (21), 11212, 2026"). */
export const venueShort = (venue: string) =>
  String(venue ?? '')
    .replace(/,?\s*\b(19|20)\d{2}\s*$/, '')
    .replace(/\s+\d+\s*(\(\d+\))?,?\s*[\d–-]+\s*$/, '')
    .trim()

/** One short line for a duty not met: what is needed and what there is, without the period. */
export const shortReason = (reasons: string[]) => failReason(reasons).replace(/\s*ในปี [^;]*/g, '').replace(/^ต้องการ\s*/, 'ต้องการ ')

const TYPE_MARK: Record<string, string> = { journal: 'ว', proceeding: 'P', poster: 'โป', exclude: '–', unknown: '?' }
const TYPE_SHORT: Record<string, string> = { journal: 'วารสาร', proceeding: 'Proceedings', poster: 'โปสเตอร์/บทคัดย่อ', exclude: 'ไม่นับ', unknown: 'ไม่ทราบประเภท' }

type Filter = 'counted' | 'not' | 'all'

export function MobileMe({ result, settings, email, onLogout, mine, addWork }: { result: PersonResult; settings: Settings; email: string; onLogout: () => void; mine: Submission[]; addWork: ReactNode }) {
  const [openLevel, setOpenLevel] = useState<string | null>(null)
  const [openWork, setOpenWork] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('counted')
  const [adding, setAdding] = useState(false)
  const p = result.person

  const passed = SHOWN_ROLES.filter((r) => result.roles[r.id].status === 'met').length
  const c = result.roles[SHOWN_ROLES[0].id].counts
  const evals = result.pubs.map((pub) => evaluatePub(pub, p, settings)).sort((a, b) => (b.pub.pubMonth ?? String(b.pub.year ?? '')).localeCompare(a.pub.pubMonth ?? String(a.pub.year ?? '')))
  const inside = evals.filter((e) => inWindow(e.pub, settings).in)
  const counted = inside.filter((e) => e.eligible !== 'no')
  const notCounted = inside.filter((e) => e.eligible === 'no')
  const shown: PubEval[] = filter === 'counted' ? counted : filter === 'not' ? notCounted : evals
  const pending = mine.filter((s) => s.status === 'pending').length

  return (
    <div className="mme">
      <div className="mme-head">
        <span className="mme-avatar" aria-hidden="true">{(p.nameTh || p.nameEn).replace(/^(ศ|รศ|ผศ|ดร|อ)\.?\s*/g, '').slice(0, 1)}</span>
        <div className="mme-who">
          <b>{p.nameTh || p.nameEn}</b>
          <span>{email}</span>
        </div>
        <button type="button" className="mme-logout" onClick={onLogout}>
          ออก
        </button>
      </div>

      <div className="mme-stats" role="group" aria-label="สรุปผล">
        <div className={passed === SHOWN_ROLES.length ? 'ok' : 'bad'}>
          <b>
            {passed}/{SHOWN_ROLES.length}
          </b>
          <span>หน้าที่ผ่าน</span>
        </div>
        <div>
          <b>{c.total}</b>
          <span>ผลงานที่นับ</span>
        </div>
        <div>
          <b>{c.research}</b>
          <span>งานวิจัย</span>
        </div>
      </div>

      <ul className="mme-levels">
        {SHOWN_LEVELS.map((l) => {
          const roles = SHOWN_ROLES.filter((r) => r.level === l.id)
          const ok = roles.filter((r) => result.roles[r.id].status === 'met').length
          const open = openLevel === l.id
          return (
            <li key={l.id}>
              <button type="button" className="mme-row" aria-expanded={open} onClick={() => setOpenLevel(open ? null : l.id)}>
                <span className={`mme-dot ${ok === roles.length ? 'ok' : 'bad'}`} aria-hidden="true">
                  {ok === roles.length ? '✓' : '✗'}
                </span>
                <span className="mme-row-main">
                  <b>{LEVEL_SHORT[l.id] ?? l.th}</b>
                  <span>{ok === roles.length ? 'ผ่านทุกหน้าที่' : `ไม่ผ่าน ${roles.length - ok} หน้าที่`}</span>
                </span>
                <span className="mme-count">
                  {ok}/{roles.length}
                </span>
              </button>
              {open && (
                <ul className="mme-roles">
                  {roles.map((r) => {
                    const res = result.roles[r.id]
                    return (
                      <li key={r.id} className={res.status === 'met' ? 'ok' : 'bad'}>
                        <span aria-hidden="true">{res.status === 'met' ? '✓' : res.status === 'not_met' ? '✗' : '?'}</span>
                        <span>
                          {roleShort(r.id)}
                          {res.status !== 'met' && <small>{shortReason(res.reasons)}</small>}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </li>
          )
        })}
      </ul>

      <div className="mme-chips" role="tablist" aria-label="ผลงาน">
        {(
          [
            ['counted', `นับ ${counted.length}`],
            ['not', `ไม่นับ ${notCounted.length}`],
            ['all', 'ทุกปี'],
          ] as [Filter, string][]
        ).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={filter === k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>
            {label}
          </button>
        ))}
        {pending > 0 && <span className="mme-pending">รออนุมัติ {pending}</span>}
      </div>

      <ul className="mme-works">
        {shown.length === 0 && <li className="mme-empty">ไม่มีรายการ</li>}
        {shown.map((e) => {
          const open = openWork === e.pub.id
          const outside = !inWindow(e.pub, settings).in
          const off = e.eligible === 'no' || outside
          const jl = e.pub.type === 'journal' ? journalTag(journalLevel(e.pub, TCI)) : ''
          return (
            <li key={e.pub.id} className={off ? 'off' : ''}>
              <button type="button" className="mme-work" aria-expanded={open} onClick={() => setOpenWork(open ? null : e.pub.id)}>
                <span className={`mme-type t-${e.pub.type}`} aria-hidden="true">
                  {TYPE_MARK[e.pub.type] ?? '?'}
                </span>
                <span className="mme-work-main">
                  <span className="mme-title">{e.pub.title}</span>
                  <span className="mme-venue">{venueShort(e.pub.venue) || '—'}</span>
                </span>
                <span className="mme-when">{whenShort(e.pub)}</span>
              </button>
              {open && (
                <div className="mme-detail">
                  <p>
                    {TYPE_SHORT[e.pub.type] ?? e.pub.type}
                    {jl && ` · ${jl}`}
                    {e.pub.conference && ` · ${CONFERENCE_TAG[e.pub.conference.verdict]}`}
                    {e.research === 'yes' ? ' · งานวิจัย' : ''}
                  </p>
                  <p className={off ? 'bad' : 'ok'}>{outside ? 'นอกช่วง 5 ปี' : e.eligible === 'yes' ? '✓ นับ' : e.eligible === 'maybe' ? '? ยังไม่แน่ใจ' : `✗ ${e.reasons.map((x) => x.replace(/^ไม่นับ:\s*/, '')).join(' · ')}`}</p>
                  <p className="muted">
                    {e.pub.sources.map((x) => SRC[x]).join(' · ')}
                    {e.pub.doi && (
                      <>
                        {' · '}
                        <a href={`https://doi.org/${e.pub.doi}`} target="_blank" rel="noreferrer">
                          DOI ↗
                        </a>
                      </>
                    )}
                  </p>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <button type="button" className="mme-fab" onClick={() => setAdding(true)}>
        <span aria-hidden="true">＋</span> เพิ่มผลงาน
      </button>

      {adding && (
        <div className="mme-sheet" role="dialog" aria-modal="true" aria-label="เพิ่มผลงาน">
          <div className="mme-sheet-bar">
            <button type="button" className="mme-close" onClick={() => setAdding(false)} aria-label="ปิด">
              ✕
            </button>
            <b>เพิ่มผลงาน</b>
          </div>
          <p className="mme-sheet-note">ผลงานที่ยังไม่มีในระบบ นับหลังได้รับอนุมัติ</p>
          {addWork}
        </div>
      )}
    </div>
  )
}
