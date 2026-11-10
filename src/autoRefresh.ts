// Reloads the open page when a newer build has been published.
//
// Every build writes version.json ({ builtAt }) next to index.html (vite.config.ts).
// The app compares it with the builtAt baked into its own bundle: every 5 minutes,
// and whenever the tab becomes visible again, so a dashboard left open overnight
// picks up the daily data refresh (03:00 GitHub Actions, 07:30 iMac) by itself.
// GitHub Pages caches index.html for 10 minutes, so the reload adds a query string
// to fetch a fresh copy; it is stripped again after loading.
import { useEffect, useState } from 'react'

const INTERVAL_MS = 5 * 60 * 1000
const RELOAD_GUARD_KEY = 'seen-screening-reloaded-for'

export async function fetchPublishedBuild(): Promise<string | null> {
  if (window.location.protocol === 'file:') return null // standalone/index.html
  try {
    const url = `${import.meta.env.BASE_URL}version.json?t=${Date.now()}`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    const v = (await res.json()) as { builtAt?: string }
    return typeof v.builtAt === 'string' ? v.builtAt : null
  } catch {
    return null
  }
}

/** True only when `published` is a later build than `current` (both ISO timestamps). A CDN copy
 *  of version.json that is older than the running bundle is not "newer", and an unreadable
 *  timestamp never triggers a reload. */
export function isNewerBuild(published: string | null, current: string): boolean {
  if (!published) return false
  const p = Date.parse(published)
  const c = Date.parse(current)
  if (Number.isNaN(p)) return false
  return Number.isNaN(c) ? published !== current : p > c
}

/** Reload with a cache-busting query so the HTML itself is refetched. */
export function reloadForBuild(builtAt: string): void {
  try {
    sessionStorage.setItem(RELOAD_GUARD_KEY, builtAt)
  } catch {
    /* storage unavailable */
  }
  const { pathname, hash } = window.location
  window.location.replace(`${pathname}?v=${encodeURIComponent(builtAt)}${hash}`)
}

/** Drop the ?v= query left by reloadForBuild so links copied from the bar stay clean. */
export function cleanReloadQuery(): void {
  if (!/^\?v=/.test(window.location.search)) return
  try {
    window.history.replaceState(null, '', window.location.pathname + window.location.hash)
  } catch {
    /* ignore */
  }
}

/** True when a newer build is published; `auto` reloads at once unless this build was
 *  already reloaded for that version (so a stale CDN never causes a reload loop). */
export function useAutoRefresh(currentBuild: string, auto: boolean): string | null {
  const [newer, setNewer] = useState<string | null>(null)

  useEffect(() => {
    cleanReloadQuery()
    let stopped = false
    const check = async () => {
      if (document.visibilityState === 'hidden') return
      const published = await fetchPublishedBuild()
      if (stopped || !published || !isNewerBuild(published, currentBuild)) return
      let alreadyTried = ''
      try {
        alreadyTried = sessionStorage.getItem(RELOAD_GUARD_KEY) ?? ''
      } catch {
        /* storage unavailable */
      }
      setNewer(published)
      if (auto && alreadyTried !== published) reloadForBuild(published)
    }
    const timer = window.setInterval(check, INTERVAL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    void check()
    return () => {
      stopped = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [currentBuild, auto])

  return newer
}
