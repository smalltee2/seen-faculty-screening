// Three candidate SEEN icon styles for the sfs_webapp.html menu (Tum asked for icons no other site
// has, 2026-11-11). Drawn by hand on a 24 × 24 grid; the leaf comes from the SEEN logo.
//   leaf  — thin green outline, a small leaf worked into each icon
//   duo   — the same outline with the key part filled in SEEN orange
//   solid — filled shapes with cut-out details, rounded corners
// Colours follow the menu: `currentColor` for the line, `var(--icon-accent)` for the orange part.
import type { ReactNode } from 'react'

export type IconKey = 'overview' | 'me' | 'lecturers' | 'inbox' | 'forms' | 'outlook' | 'sources' | 'history'
export type IconStyle = 'leaf' | 'duo' | 'solid'

export const ICON_LABEL: Record<IconKey, string> = {
  overview: 'ภาพรวม',
  me: 'ตรวจสอบคุณสมบัติของฉัน',
  lecturers: 'ผลงานอาจารย์',
  inbox: 'งานรอดำเนินการ',
  forms: 'เพิ่มผลงานด้วยตัวเอง',
  outlook: 'แนวโน้ม 1–2 ปี',
  sources: 'แหล่งข้อมูล',
  history: 'ประวัติการตัดสิน',
}

// A leaf from (x, y) pointing up-right, about s px long; its midrib runs back to the stem.
const leaf = (x: number, y: number, s = 6) => `M${x} ${y}c0-${s * 0.62} ${s * 0.38}-${s} ${s}-${s} 0 ${s * 0.62}-${s * 0.38} ${s}-${s} ${s}z`
const rib = (x: number, y: number, s = 6) => `M${x} ${y}l${s * 0.62} -${s * 0.62}`

const ACCENT = 'var(--icon-accent, #e0691c)'

/** Shared outline geometry for the leaf and duo styles; in duo the accent parts are filled orange. */
function outline(key: IconKey, duo: boolean): ReactNode {
  const acc = duo ? { fill: ACCENT, stroke: ACCENT, fillOpacity: 0.9 } : { fill: 'none' }
  const soft = duo ? { fill: ACCENT, fillOpacity: 0.22, stroke: 'none' } : null
  switch (key) {
    case 'overview':
      return (
        <>
          {soft && <rect x="13" y="3" width="8" height="8" rx="2" {...soft} />}
          <rect x="3" y="3" width="8" height="8" rx="2" />
          <rect x="13" y="3" width="8" height="8" rx="2" />
          <rect x="3" y="13" width="8" height="8" rx="2" />
          <path d={leaf(13.5, 21, 7)} {...acc} />
          <path d={rib(13.5, 21, 7)} />
        </>
      )
    case 'me':
      return (
        <>
          {soft && <circle cx="10" cy="7.5" r="3.5" {...soft} />}
          <circle cx="10" cy="7.5" r="3.5" />
          <path d="M3.5 20.5c.6-3.9 3.2-6 6.5-6 1.1 0 2.2.2 3.1.7" />
          <path d={leaf(14, 21, 6.5)} {...acc} />
          <path d={rib(14, 21, 6.5)} />
        </>
      )
    case 'lecturers':
      return (
        <>
          {soft && <path d="M12 6.8c3.3-2 6.3-2.3 9-1.2v12.8c-2.7-1.1-5.7-.8-9 1.2z" {...soft} />}
          <path d="M3 5.6C5.7 4.5 8.7 4.8 12 6.8c3.3-2 6.3-2.3 9-1.2v12.8c-2.7-1.1-5.7-.8-9 1.2-3.3-2-6.3-2.3-9-1.2z" />
          <path d="M12 6.8v12.8" />
          <path d="M15.5 4.6v4.7l1.6-1.1 1.6 1.1V4.4" {...acc} />
        </>
      )
    case 'inbox':
      return (
        <>
          {soft && <path d="M3 13h5l1.5 2.5h5L16 13h5v5.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z" {...soft} />}
          <path d="M3 13l2.4-7.2A1.5 1.5 0 0 1 6.8 4.8h2.7M14.5 4.8h2.7a1.5 1.5 0 0 1 1.4 1L21 13v5.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z" />
          <path d="M3 13h5l1.5 2.5h5L16 13h5" />
          <path d={leaf(9.5, 11, 5)} {...acc} />
          <path d={rib(9.5, 11, 5)} />
        </>
      )
    case 'forms':
      return (
        <>
          {soft && <path d="M14 3v5h5z" {...soft} />}
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5" />
          <path d="M12 11.5v6M9 14.5h6" {...(duo ? { stroke: ACCENT, strokeWidth: 2 } : {})} />
        </>
      )
    case 'outlook':
      return (
        <>
          {soft && <path d="M4 17l4.5-4.5 3.5 3 4.5-5.5V20H4z" {...soft} />}
          <path d="M3 20.5h18" />
          <path d="M4 17l4.5-4.5 3.5 3 4.5-5.5" />
          <path d={leaf(16.5, 10, 6)} {...acc} />
          <path d={rib(16.5, 10, 6)} />
        </>
      )
    case 'sources':
      return (
        <>
          {soft && <ellipse cx="12" cy="6" rx="7" ry="2.6" {...soft} />}
          <ellipse cx="12" cy="6" rx="7" ry="2.6" />
          <path d="M5 6v12c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V6" />
          <path d="M5 12c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6" />
          <path d="M12 15.5c-1.3 1.5-1.9 2.5-1.9 3.2a1.9 1.9 0 0 0 3.8 0c0-.7-.6-1.7-1.9-3.2z" {...acc} />
        </>
      )
    case 'history':
      return (
        <>
          {soft && <circle cx="12.5" cy="12" r="8" {...soft} />}
          <path d="M4.5 12a8 8 0 1 0 2.3-5.6" />
          <path d="M4 3.8v3.9h3.9" />
          <path d="M9.5 12.2l2.2 2.2 4-4.4" {...(duo ? { stroke: ACCENT, strokeWidth: 2 } : {})} />
        </>
      )
  }
}

/** Filled glyphs; cut-outs are drawn in the menu's background colour (`var(--icon-cut)`). */
function solid(key: IconKey): ReactNode {
  const cut = { stroke: 'var(--icon-cut, #fff)', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' }
  const accent = { fill: ACCENT }
  switch (key) {
    case 'overview':
      return (
        <>
          <rect x="2.5" y="2.5" width="9" height="9" rx="2.5" />
          <rect x="12.5" y="2.5" width="9" height="9" rx="2.5" />
          <rect x="2.5" y="12.5" width="9" height="9" rx="2.5" />
          <path d={leaf(13, 21.5, 8.5)} {...accent} />
        </>
      )
    case 'me':
      return (
        <>
          <circle cx="10" cy="7" r="4.2" />
          <path d="M2.8 20.2c.5-4.4 3.4-7 7.2-7 1.8 0 3.3.5 4.5 1.4-1.2 1.4-1.9 3.4-1.9 5.6v.8H4.3a1.5 1.5 0 0 1-1.5-.8z" />
          <path d={leaf(14.2, 21.5, 7.3)} {...accent} />
        </>
      )
    case 'lecturers':
      return (
        <>
          <path d="M2.5 5.3C5.4 4 8.6 4.3 11.2 6v14.2c-2.6-1.5-5.8-1.7-8.7-.6z" />
          <path d="M12.8 6c2.6-1.7 5.8-2 8.7-.7v14.3c-2.9-1.1-6.1-.9-8.7.6z" />
          <path d="M15.6 3.6h3.4v6.4l-1.7-1.2-1.7 1.2z" {...accent} />
        </>
      )
    case 'inbox':
      return (
        <>
          <path d="M5 5.2A1.8 1.8 0 0 1 6.7 4h10.6A1.8 1.8 0 0 1 19 5.2L21.5 12.5V18a2.5 2.5 0 0 1-2.5 2.5H5A2.5 2.5 0 0 1 2.5 18v-5.5z" />
          <path d="M2.5 12.8H8l1.5 2.4h5l1.5-2.4h5.5" {...cut} />
          <path d={leaf(9.4, 11, 5.6)} {...accent} />
        </>
      )
    case 'forms':
      return (
        <>
          <path d="M6.5 2.5h7.2l5.8 5.8V19a2.5 2.5 0 0 1-2.5 2.5h-10A2.5 2.5 0 0 1 4.5 19V5a2.5 2.5 0 0 1 2-2.5z" />
          <path d="M13.7 2.5v5.8h5.8z" {...accent} />
          <path d="M12 11.3v6.4M8.8 14.5h6.4" {...cut} strokeWidth={2.2} />
        </>
      )
    case 'outlook':
      return (
        <>
          <path d="M3 21.5V17.5l5.5-5.5 3.5 3 4.5-5V21.5z" />
          <path d={leaf(16, 10.5, 6.8)} {...accent} />
        </>
      )
    case 'sources':
      return (
        <>
          <path d="M4.5 6c0-1.9 3.4-3.4 7.5-3.4S19.5 4.1 19.5 6v12c0 1.9-3.4 3.4-7.5 3.4S4.5 19.9 4.5 18z" />
          <path d="M4.8 8.4c1 1.3 3.8 2.2 7.2 2.2s6.2-.9 7.2-2.2M4.8 13.8c1 1.3 3.8 2.2 7.2 2.2s6.2-.9 7.2-2.2" {...cut} strokeWidth={1.5} />
          <path d="M12 16.2c-1.4 1.6-2 2.6-2 3.4a2 2 0 0 0 4 0c0-.8-.6-1.8-2-3.4z" {...accent} />
        </>
      )
    case 'history':
      return (
        <>
          <circle cx="12.5" cy="12" r="9" />
          <path d="M2 4.5l1.2 4.8 4.7-1.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M9 12.3l2.5 2.5 4.5-5" {...cut} strokeWidth={2.2} />
        </>
      )
  }
}

export function SeenIcon({ name, style, size = 22 }: { name: IconKey; style: IconStyle; size?: number }) {
  if (style === 'solid') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" stroke="none">
        {solid(name)}
      </svg>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {outline(name, style === 'duo')}
    </svg>
  )
}

export const ICON_KEYS = Object.keys(ICON_LABEL) as IconKey[]
