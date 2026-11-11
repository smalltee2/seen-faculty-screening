// Which new works this browser has already opened (Tum, 2026-11-11: the green menu count clears
// once the list is opened, like an unread count). Kept per browser in localStorage; ids of works no
// longer in the 7-day list are dropped, so the store stays small.
import { useState } from 'react'

const KEY = 'seen-webapp-new-opened'

function read(): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

/** `current`: ids of every work now in the 7-day lists, to prune the store. */
export function useSeenNew(current: string[]): [ReadonlySet<string>, (ids: string[]) => void] {
  const [seen, setSeen] = useState<Set<string>>(read)
  const markSeen = (ids: string[]) => {
    const live = new Set(current)
    const next = new Set([...seen, ...ids].filter((id) => live.has(id)))
    if (next.size === seen.size && ids.every((id) => seen.has(id))) return
    setSeen(next)
    try {
      localStorage.setItem(KEY, JSON.stringify([...next]))
    } catch {
      /* not remembered; the count clears again only for this visit */
    }
  }
  return [seen, markSeen]
}
