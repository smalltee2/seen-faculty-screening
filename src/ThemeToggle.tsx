// Light / dark / system switch in the navbar (from the academic-website-template's dark-mode toggle).
// The choice sets data-theme on <html>; "system" removes it so prefers-color-scheme decides.
// index.html applies the saved choice before first paint.
import { useEffect, useState } from 'react'

type Mode = 'system' | 'light' | 'dark'
const KEY = 'seen-theme'
const NEXT: Record<Mode, Mode> = { system: 'light', light: 'dark', dark: 'system' }
const LABEL: Record<Mode, string> = { system: 'ตามระบบ', light: 'โหมดสว่าง', dark: 'โหมดมืด' }

function read(): Mode {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>(read)
  useEffect(() => {
    const root = document.documentElement
    if (mode === 'system') delete root.dataset.theme
    else root.dataset.theme = mode
    try {
      if (mode === 'system') localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, mode)
    } catch {
      /* storage unavailable: the choice lasts until reload */
    }
  }, [mode])
  const label = `ธีม: ${LABEL[mode]} (คลิกเพื่อเปลี่ยนเป็น${LABEL[NEXT[mode]]})`
  return (
    <button type="button" className="icon-btn theme-toggle" onClick={() => setMode(NEXT[mode])} aria-label={label} title={label}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {mode === 'light' && (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        )}
        {mode === 'dark' && <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />}
        {mode === 'system' && (
          <>
            <rect x="3" y="4" width="18" height="12" rx="2" />
            <path d="M8 20h8M12 16v4" />
          </>
        )}
      </svg>
    </button>
  )
}

/** Round "back to top" button, shown after scrolling one screen (also from the template). */
export function BackToTop() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const on = () => setShow(window.scrollY > window.innerHeight)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  return (
    <button
      type="button"
      className={`icon-btn back-to-top no-print${show ? ' is-visible' : ''}`}
      aria-label="กลับขึ้นด้านบน"
      title="กลับขึ้นด้านบน"
      tabIndex={show ? 0 : -1}
      aria-hidden={!show}
      onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
    </button>
  )
}

/** Adds a shadow under the sticky navbar once the page is scrolled. */
export function useScrolled(): boolean {
  const [s, setS] = useState(false)
  useEffect(() => {
    const on = () => setS(window.scrollY > 4)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  return s
}
