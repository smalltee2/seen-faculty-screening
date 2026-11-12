import { useEffect, useState } from 'react'

/** True while the window is phone-wide (the web app's phone layout starts at 760 px, webapp.css). */
export function useNarrow(query = '(max-width: 760px)'): boolean {
  const get = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches
  const [narrow, setNarrow] = useState(get)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const m = window.matchMedia(query)
    const on = () => setNarrow(m.matches)
    on()
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [query])
  return narrow
}
