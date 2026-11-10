// A drop-down that opens when the mouse points at it (Tum, 2026-11-11: "แค่เอา mouse ชี้ ก็แสดง").
// A native <select> cannot be opened from script, so this is the ARIA "select-only combobox":
// a button (role=combobox) and a listbox. Touch screens have no hover, so a tap opens it too, and
// the keyboard works as on a native select (Enter/Space/arrows open, arrows move, Enter picks, Esc closes).
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'

export interface HoverOption {
  value: string
  label: string
}

/** Delay before a menu the mouse has left closes, so moving down onto the list does not close it. */
const CLOSE_DELAY_MS = 180

export function HoverSelect({ id, label, value, options, onChange }: { id: string; label: string; value: string; options: HoverOption[]; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const closeTimer = useRef<number | undefined>(undefined)
  const openedByHover = useRef(false)
  const listId = `${id}-list`
  const labelId = useId()
  const current = Math.max(0, options.findIndex((o) => o.value === value))

  // `isOpen` mirrors `open` at once: a hover and a click can arrive before React applies the hover's update.
  const isOpen = useRef(false)
  const show = (byHover: boolean) => {
    window.clearTimeout(closeTimer.current)
    if (!isOpen.current) {
      setActive(current)
      openedByHover.current = byHover
    }
    isOpen.current = true
    setOpen(true)
  }
  const hide = () => {
    window.clearTimeout(closeTimer.current)
    isOpen.current = false
    openedByHover.current = false
    setOpen(false)
  }
  const pick = (i: number) => {
    const o = options[i]
    hide()
    button.current?.focus()
    if (o && o.value !== value) onChange(o.value)
  }

  useEffect(() => () => window.clearTimeout(closeTimer.current), [])
  // A tap or click anywhere else closes the menu.
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) hide()
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open])
  // Keep the highlighted option in view in a long list.
  useEffect(() => {
    if (open) document.getElementById(`${id}-opt-${active}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [open, active, id])

  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const last = options.length - 1
    if (!open) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault()
        show(false)
      }
      return
    }
    if (e.key === 'ArrowDown') setActive((a) => Math.min(last, a + 1))
    else if (e.key === 'ArrowUp') setActive((a) => Math.max(0, a - 1))
    else if (e.key === 'Home') setActive(0)
    else if (e.key === 'End') setActive(last)
    else if (e.key === 'Enter' || e.key === ' ') pick(active)
    else if (e.key === 'Escape' || e.key === 'Tab') {
      if (e.key === 'Escape') e.preventDefault()
      hide()
      return
    } else return
    e.preventDefault()
  }

  return (
    <div
      ref={root}
      className="control hover-select"
      onPointerEnter={(e) => e.pointerType === 'mouse' && show(true)}
      onPointerLeave={(e) => {
        if (e.pointerType !== 'mouse') return
        window.clearTimeout(closeTimer.current)
        closeTimer.current = window.setTimeout(hide, CLOSE_DELAY_MS)
      }}
    >
      <span className="control-label" id={labelId}>
        {label}
      </span>
      <button
        ref={button}
        type="button"
        id={id}
        className="hover-select-button"
        role="combobox"
        aria-labelledby={labelId}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${id}-opt-${active}` : undefined}
        onClick={() => {
          // The mouse already opened it on hover: a click keeps it open instead of closing it again.
          if (isOpen.current && openedByHover.current) {
            openedByHover.current = false
            return
          }
          if (isOpen.current) hide()
          else show(false)
        }}
        onKeyDown={onKey}
      >
        <span className="hover-select-value">{options[current]?.label ?? ''}</span>
        <svg className="hover-select-caret" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <ul id={listId} role="listbox" aria-labelledby={labelId} className="hover-select-list" hidden={!open}>
        {options.map((o, i) => (
          <li
            key={o.value}
            id={`${id}-opt-${i}`}
            role="option"
            aria-selected={i === current}
            className={i === active ? 'is-active' : undefined}
            onPointerMove={() => setActive(i)}
            onClick={() => pick(i)}
          >
            {o.label}
          </li>
        ))}
      </ul>
    </div>
  )
}
