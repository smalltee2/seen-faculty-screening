// The "แหล่งข้อมูล" list on the admin page: last answer and row count per source. The times come from the bundle; the form's
// time is read from status.json on the site, because a build triggered by a push did not fetch it.
import { useEffect, useState, type ReactNode } from 'react'
import type { Freshness, NewWork } from './types'
import { groupNewWorks, unseen } from './newWorks'
import { DISPLAY_ORDER, SOURCE_TH, SUPPORT_ORDER, ageTh, sourceAges, type SourceAge, type SourceKey } from './freshness'

/** Rows each source contributed to the bundle (before duplicates are merged). */
export type SourceCounts = Partial<Record<SourceKey, number>>

async function fetchPublishedFreshness(): Promise<Freshness | null> {
  if (window.location.protocol === 'file:') return null
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}status.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    const f = ((await res.json()) as { freshness?: Freshness }).freshness
    return f && typeof f === 'object' ? f : null
  } catch {
    return null // dev server and offline copies have no status.json; the bundle's own times are shown
  }
}

/** One list for the admin page's "แหล่งข้อมูล": per source, when it last answered and how many rows it gave.
 *  The site build has no rows of its own, so when it is listed (only while stale) it shows the time only. */
/** Works new in each source (data.newWorks) and how to show a lecturer's name. */
export type NewWorksBySource = Partial<Record<SourceKey, NewWork[]>>

/** `seen`/`onOpen` (sfs_webapp.html): works already opened in this browser, and a call when a list is opened. */
export function FreshnessList({ ages, counts = {}, actions = {}, newWorks = {}, nameOf = (k) => k, seen, onOpen }: { ages: SourceAge[]; counts?: SourceCounts; actions?: Partial<Record<SourceKey, ReactNode>>; newWorks?: NewWorksBySource; nameOf?: (nameEn: string) => string; seen?: ReadonlySet<string>; onOpen?: (source: SourceKey) => void }) {
  const stale = ages.filter((a) => a.stale)
  const [open, setOpen] = useState<SourceKey | null>(null)
  const rows = [...DISPLAY_ORDER, ...SUPPORT_ORDER].map((k) => ages.find((a) => a.key === k)).concat(ages.find((a) => a.key === 'build' && a.stale)).filter((a): a is SourceAge => !!a)
  return (
    <div className="freshness">
      <dl className="source-list">
        {rows.map((a) => {
          const n = counts[a.key]
          return (
            <div key={a.key} className={a.stale ? 'fresh-stale' : undefined}>
              <dt>
                {a.key === SUPPORT_ORDER[0] && <span className="source-group muted small">แหล่งข้อมูลเสริม (ไม่เพิ่มรายการผลงาน)</span>}
                <span className="source-name">
                  {/* The fetch schedule in brackets is marked so a phone can leave it out. */}
                  {SOURCE_TH[a.key].replace(/\s*\([^()]*\)$/, '')}
                  <span className="source-sched">{SOURCE_TH[a.key].match(/\s*\([^()]*\)$/)?.[0] ?? ''}</span>
                  {/* New works in the last 7 days (Tum, 2026-11-11): a badge after the name; it opens the list. */}
                  {groupNewWorks(newWorks[a.key]).length > 0 && (
                    <button
                      type="button"
                      // Grey once every work in it was opened in this browser; it stays for the 7 days so the list can be read again.
                      className={`new-badge${seen && unseen(groupNewWorks(newWorks[a.key]), seen).length === 0 ? ' new-badge-seen' : ''}`}
                      aria-expanded={open === a.key}
                      aria-controls={`new-${a.key}`}
                      onClick={() => {
                        if (open !== a.key) onOpen?.(a.key)
                        setOpen(open === a.key ? null : a.key)
                      }}
                    >
                      ใหม่ {groupNewWorks(newWorks[a.key]).length}
                    </button>
                  )}
                </span>
                {actions[a.key]}
              </dt>
              <dd>
                <span className="fresh-when">
                  <span className="fresh-word">อัปเดตล่าสุด {a.at ? new Date(a.at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }) : '–'} (</span>
                  <span className="muted small fresh-age">{ageTh(a.hours)}</span>
                  <span className="fresh-word">)</span>
                  {a.stale && <strong className="fresh-flag"> ค้างเกิน 2 วัน</strong>}
                </span>
                {n !== undefined && <span className="fresh-count mono">จำนวน {n} {a.key === 'crossref' ? 'DOI' : 'รายการ'}</span>}
              </dd>
              {open === a.key && <NewWorksList id={`new-${a.key}`} groups={groupNewWorks(newWorks[a.key])} nameOf={nameOf} />}
            </div>
          )
        })}
      </dl>
      <p className="note" role={stale.length ? 'alert' : undefined}>
        {stale.length
          ? `มี ${stale.length} แหล่งที่ไม่ได้ข้อมูลใหม่เกิน 2 วัน: งานดึงข้อมูลอาจล้มเหลว ให้ดูที่ GitHub Actions หรือ log บน iMac`
          : 'ทุกแหล่งได้ข้อมูลใหม่ภายใน 2 วัน'}
        <span className="fresh-explain">
          {' '}
          · เวลาที่แสดงคือครั้งล่าสุดที่แหล่งนั้นตอบกลับจริง (ถ้าดึงไม่สำเร็จ ระบบใช้ข้อมูลเดิมและเวลาจะไม่ขยับ) · ผลงานที่อาจารย์เพิ่มเอง
          และการตัดสินของผู้ดูแล หน้าเว็บอ่านสดจากระบบหลังบ้านทุกครั้งที่เปิด
        </span>
      </p>
    </div>
  )
}

const day = (iso: string) => new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' })

/** What came into a source in the last 7 days, and for whom. */
function NewWorksList({ id, groups, nameOf }: { id: string; groups: ReturnType<typeof groupNewWorks>; nameOf: (k: string) => string }) {
  return (
    <div id={id} className="new-works">
      <p className="new-works-head">ผลงานที่เข้ามาใหม่ใน 7 วันที่ผ่านมา · {groups.length} เรื่อง</p>
      <ul>
        {groups.map((g) => (
          <li key={`${g.doi}|${g.title}`}>
            <span className="new-works-title">
              {g.doi ? (
                <a href={`https://doi.org/${g.doi}`} target="_blank" rel="noreferrer">
                  {g.title} ↗
                </a>
              ) : (
                g.title
              )}
            </span>
            <span className="muted small">
              {[g.year, g.venue].filter(Boolean).join(' · ')}
            </span>
            <span className="new-works-people">
              {g.keys.map((k, i) => (
                <span key={k}>
                  {i > 0 && ', '}
                  <a href={`#/person/${encodeURIComponent(k)}`}>{nameOf(k)}</a>
                </span>
              ))}
            </span>
            <span className="muted small">เข้ามาเมื่อ {day(g.at)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function FreshnessPanel({ builtAt, freshness, counts, actions, newWorks, nameOf, seen, onOpen }: { builtAt: string; freshness?: Freshness; counts?: SourceCounts; actions?: Partial<Record<SourceKey, ReactNode>>; newWorks?: NewWorksBySource; nameOf?: (nameEn: string) => string; seen?: ReadonlySet<string>; onOpen?: (source: SourceKey) => void }) {
  const [published, setPublished] = useState<Freshness | null>(null)
  useEffect(() => {
    let live = true
    void fetchPublishedFreshness().then((f) => live && setPublished(f))
    return () => {
      live = false
    }
  }, [])
  const merged: Freshness = {
    scopus: freshness?.scopus ?? null,
    openalex: freshness?.openalex ?? null,
    scholar: freshness?.scholar ?? null,
    forms: freshness?.forms ?? published?.forms ?? null,
    tci: freshness?.tci ?? null,
    crossref: freshness?.crossref ?? null,
  }
  return <FreshnessList ages={sourceAges(builtAt, merged, Date.now())} counts={counts} actions={actions} newWorks={newWorks} nameOf={nameOf} seen={seen} onOpen={onOpen} />
}
