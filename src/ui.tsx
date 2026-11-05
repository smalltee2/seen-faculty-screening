import type { ReactNode } from 'react'
import type { Level, Status } from './rules'
import { LEVELS, ROLES, toBE } from './rules'
import type { Faculty, PubType } from './types'

/** The site covers bachelor's (10.1), master's (9.3) and doctoral (9.4) programmes;
 *  diploma rules (9.1, 9.2) stay in rules.ts. */
export const isShownLevel = (level: Level) => level === 'ba' || level === 'ms' || level === 'phd'
export const SHOWN_LEVELS = LEVELS.filter((l) => isShownLevel(l.id))
export const SHOWN_ROLES = ROLES.filter((r) => isShownLevel(r.level))

/** Colour group of a level on the pages: bachelor's (orange) vs graduate (green). */
export type LevelGroup = 'ba' | 'grad'
export const levelGroup = (level: Level): LevelGroup => (level === 'ba' ? 'ba' : 'grad')
export const LEVEL_GROUPS: { id: LevelGroup; th: string; clause: string; rule: number; ruleTh: string }[] = [
  { id: 'ba', th: 'ระดับปริญญาตรี', clause: 'ข้อ 10.1', rule: 1, ruleTh: 'ผลงานทางวิชาการอย่างน้อย 1 เรื่อง' },
  { id: 'grad', th: 'ระดับบัณฑิตศึกษา', clause: 'ข้อ 9.3–9.4', rule: 3, ruleTh: 'ป.โท ผลงานอย่างน้อย 3 เรื่อง (วิจัยอย่างน้อย 1) · ป.เอก งานวิจัยอย่างน้อย 3 เรื่อง' },
]

/** Thai academic title as used on official documents: ศ./รศ./ผศ. plus ดร. for a doctorate. */
export function thaiTitle(p: Faculty): string {
  const dr = p.degree === 'ปริญญาเอก' ? 'ดร.' : ''
  if (p.rank && p.rank !== 'อาจารย์') return `${p.rank}${dr}`
  return dr || 'อ.'
}

/** Thai name with title when name_th is filled, otherwise the English name. */
export const displayName = (p: Faculty) => (p.nameTh ? `${thaiTitle(p)}${p.nameTh}` : p.nameEn)

export const STATUS_LABEL: Record<Status, { th: string; sym: string }> = {
  met: { th: 'ผ่าน', sym: '✓' },
  not_met: { th: 'ไม่ผ่าน', sym: '✗' },
  needs_review: { th: 'รอตรวจสอบ', sym: '?' },
}

/** Short role names for compact views; full names live in ROLES. */
export const ROLE_SHORT: Record<string, string> = {
  program: 'อาจารย์ประจำหลักสูตร',
  responsible: 'ผู้รับผิดชอบหลักสูตร',
  advisor: 'ที่ปรึกษาวิทยานิพนธ์หลัก',
  examiner: 'ผู้สอบวิทยานิพนธ์ (ภายใน)',
  teacher: 'อาจารย์ผู้สอน',
}
export const roleShort = (id: string) => ROLE_SHORT[id.split('_')[1]] ?? id

export function StatusChip({ status, compact = false, title }: { status: Status; compact?: boolean; title?: string }) {
  const s = STATUS_LABEL[status]
  return (
    <span className={`chip chip-${status}`} title={title}>
      <span aria-hidden="true">{s.sym}</span>
      {compact ? <span className="sr-only">{s.th}</span> : <span>{s.th}</span>}
    </span>
  )
}

export const TYPE_LABEL: Record<PubType, string> = {
  journal: 'วารสาร (journal)',
  proceeding: 'Proceedings (full paper)',
  poster: 'โปสเตอร์/บทคัดย่อ (poster)',
  exclude: 'ไม่นับ (exclude)',
  unknown: 'ไม่ทราบ (unknown)',
}

export const yearLabel = (ce: number | null) => (ce === null ? '—' : `${toBE(ce)} (${ce})`)

export function Metric({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Status }) {
  return (
    <div className={`metric ${tone ? `metric-${tone}` : ''}`}>
      <span className="metric-label">{label}</span>
      <b className="metric-value">{value}</b>
      {sub && <span className="metric-sub">{sub}</span>}
    </div>
  )
}

export function Button({ children, onClick, kind = 'default', title }: { children: ReactNode; onClick: () => void; kind?: 'default' | 'primary' | 'ghost'; title?: string }) {
  return (
    <button type="button" className={`btn btn-${kind}`} onClick={onClick} title={title}>
      {children}
    </button>
  )
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg seg-small" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" role="tab" aria-selected={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Horizontal stacked bar: met / needs review / not met. */
export function StatusBar({ met, review, notMet }: { met: number; review: number; notMet: number }) {
  const total = met + review + notMet || 1
  return (
    <div className="sbar" role="img" aria-label={`ผ่าน ${met}, รอตรวจสอบ ${review}, ไม่ผ่าน ${notMet}`}>
      <span className="sbar-met" style={{ width: `${(met / total) * 100}%` }} />
      <span className="sbar-review" style={{ width: `${(review / total) * 100}%` }} />
      <span className="sbar-not" style={{ width: `${(notMet / total) * 100}%` }} />
    </div>
  )
}
