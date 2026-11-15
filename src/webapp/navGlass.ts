// Motion of the glass menu frames (Tum, 2026-11-16, "like Apple's Liquid Glass" as far as every
// browser can show it): the pill behind the chosen menu item slides to the next one, and the
// phone's bottom bar shrinks while the page is read downwards and comes back on the way up.
import { useEffect, useLayoutEffect, useState, type RefObject } from 'react'

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** Where the chosen item sits inside the menu; null when none is shown (its page is under "เพิ่มเติม"
 *  and that button is hidden, or the menu itself is hidden). */
export function pillBox(nav: HTMLElement): Box | null {
  const el = [...nav.querySelectorAll<HTMLElement>("[aria-current='page']")].find((x) => x.offsetParent !== null)
  return el ? { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight } : null
}

/** Sets the pill's place on the menu (CSS custom properties read by webapp.css). The first
 *  placement is marked so it does not slide in from the corner. */
export function placePill(nav: HTMLElement, box: Box | null): void {
  if (!box) {
    nav.removeAttribute('data-pill')
    return
  }
  for (const [k, v] of Object.entries(box)) nav.style.setProperty(`--pill-${k}`, `${v}px`)
  nav.setAttribute('data-pill', nav.hasAttribute('data-pill') ? 'on' : 'first')
}

/** Keeps the pill on the chosen item: after each change of `deps` and whenever the menu is resized. */
export function useNavPill(ref: RefObject<HTMLElement | null>, deps: readonly unknown[]): void {
  useLayoutEffect(() => {
    const nav = ref.current
    if (!nav) return
    const place = () => placePill(nav, pillBox(nav))
    place()
    if (typeof ResizeObserver !== 'function') return
    const ro = new ResizeObserver(place)
    ro.observe(nav)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

/** Whether the bottom bar is small: never near the top of the page; small after moving down,
 *  full again after moving up; a few pixels of jitter change nothing. */
export function nextCompact(prev: boolean, y: number, lastY: number): boolean {
  if (y < 80) return false
  const dy = y - lastY
  if (dy > 6) return true
  if (dy < -6) return false
  return prev
}

/** True while the phone's bottom bar should be small (see nextCompact). */
export function useBarCompact(enabled: boolean): boolean {
  const [compact, setCompact] = useState(false)
  useEffect(() => {
    if (!enabled) {
      setCompact(false)
      return
    }
    let last = window.scrollY
    const on = () => {
      const y = window.scrollY
      // React runs the updater later, so it gets the position before this event, not the variable.
      const from = last
      setCompact((prev) => nextCompact(prev, y, from))
      if (Math.abs(y - last) > 6) last = y
    }
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [enabled])
  return compact
}
