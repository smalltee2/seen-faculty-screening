import type { ReactNode } from 'react'
import type { Status } from './rules'
import { toBE } from './rules'
import type { PubType } from './types'

export const STATUS_LABEL: Record<Status, { th: string; sym: string }> = {
  met: { th: 'ผ่าน', sym: '✓' },
  not_met: { th: 'ไม่ผ่าน', sym: '✗' },
  needs_review: { th: 'รอตรวจสอบ', sym: '?' },
}

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

export function Card({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Status }) {
  return (
    <div className={`card ${tone ? `card-${tone}` : ''}`}>
      <div className="card-label">{label}</div>
      <div className="card-value">{value}</div>
      {sub && <div className="card-sub">{sub}</div>}
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
