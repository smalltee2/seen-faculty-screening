// "ข้อมูลล่าสุดเมื่อ…" per source, on the admin page. The times come from the bundle; the form's
// time is read from status.json on the site, because a build triggered by a push did not fetch it.
import { useEffect, useState } from 'react'
import type { Freshness } from './types'
import { SOURCE_TH, ageTh, sourceAges, type SourceAge } from './freshness'

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

export function FreshnessList({ ages }: { ages: SourceAge[] }) {
  const stale = ages.filter((a) => a.stale)
  return (
    <div className="freshness">
      <h4>ข้อมูลล่าสุดของแต่ละแหล่ง</h4>
      <dl className="source-list">
        {ages.map((a) => (
          <div key={a.key} className={a.stale ? 'fresh-stale' : undefined}>
            <dt>{SOURCE_TH[a.key]}</dt>
            <dd>
              {a.at ? new Date(a.at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '–'}{' '}
              <span className="muted small">({ageTh(a.hours)})</span>
              {a.stale && <strong className="fresh-flag"> ค้างเกิน 2 วัน</strong>}
            </dd>
          </div>
        ))}
      </dl>
      <p className="note" role={stale.length ? 'alert' : undefined}>
        {stale.length
          ? `มี ${stale.length} แหล่งที่ไม่ได้ข้อมูลใหม่เกิน 2 วัน: งานดึงข้อมูลอาจล้มเหลว ให้ดูที่ GitHub Actions หรือ log บน iMac`
          : 'ทุกแหล่งได้ข้อมูลใหม่ภายใน 2 วัน'}{' '}
        · เวลาที่แสดงคือครั้งล่าสุดที่แหล่งนั้นตอบกลับจริง (ถ้าดึงไม่สำเร็จ ระบบใช้ข้อมูลเดิมและเวลาจะไม่ขยับ) · ผลงานที่อาจารย์เพิ่มเอง
        และการตัดสินของผู้ดูแล หน้าเว็บอ่านสดจากระบบหลังบ้านทุกครั้งที่เปิด
      </p>
    </div>
  )
}

export function FreshnessPanel({ builtAt, freshness }: { builtAt: string; freshness?: Freshness }) {
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
  }
  return <FreshnessList ages={sourceAges(builtAt, merged, Date.now())} />
}
