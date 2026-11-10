// An "i" icon whose explanation shows when the mouse points at it (Tum, 2026-11-11). A tap or a
// keyboard press toggles it too (touch screens have no hover), and Esc or a tap elsewhere closes it.
// It is all <span>s, so it can sit inside a heading.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLSpanElement>(null)
  const openedByHover = useRef(false)
  const id = useId()
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  return (
    <span
      ref={root}
      className="info-tip"
      onPointerEnter={(e) => {
        if (e.pointerType !== 'mouse') return
        openedByHover.current = true
        setOpen(true)
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== 'mouse') return
        openedByHover.current = false
        setOpen(false)
      }}
    >
      <button type="button" className="info-tip-btn" aria-label={label} aria-expanded={open} aria-controls={id} onClick={() => {
          // The mouse already opened it on hover: a click keeps it open instead of closing it again.
          // A ref, not `open`: hover and click can arrive before React has applied the hover's update.
          if (openedByHover.current) {
            openedByHover.current = false
            setOpen(true)
          } else setOpen((o) => !o)
        }}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="8" cy="4.9" r="0.95" fill="currentColor" />
          <path d="M8 7.2v4.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      <span id={id} className="info-tip-pop" role="note" hidden={!open}>
        {children}
      </span>
    </span>
  )
}
