// A layout choice remembered in this browser (side menu shown/hidden, inbox split), 2026-11-11.
// Storage can be missing or blocked (private windows); the page then simply starts on the default.
import { useState } from 'react'

export function useStoredChoice<T extends string>(key: string, fallback: T, allowed: readonly T[]): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const v = localStorage.getItem(key) as T | null
      return v && allowed.includes(v) ? v : fallback
    } catch {
      return fallback
    }
  })
  const set = (v: T) => {
    setValue(v)
    try {
      localStorage.setItem(key, v)
    } catch {
      /* not remembered; the choice still applies until the page is reloaded */
    }
  }
  return [value, set]
}
