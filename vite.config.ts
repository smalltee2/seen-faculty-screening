import { existsSync, readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'

const PUBLISHED_STATUS = 'https://smalltee2.github.io/seen-faculty-screening/status.json'

/** The forms time the live site shows now, or null when it cannot be read (offline build, first deploy). */
async function publishedFormsStamp(): Promise<string | null> {
  try {
    const res = await fetch(`${PUBLISHED_STATUS}?t=${Date.now()}`, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const forms = ((await res.json()) as { freshness?: { forms?: unknown } }).freshness?.forms
    return typeof forms === 'string' && !Number.isNaN(Date.parse(forms)) ? forms : null
  } catch {
    return null
  }
}

/** Writes version.json ({ builtAt } of the data bundle) next to index.html, so an open
 *  page can notice a newer deploy and reload itself (src/autoRefresh.ts). */
function versionFile(): Plugin {
  return {
    name: 'seen-version-file',
    apply: 'build',
    async generateBundle() {
      const { builtAt, freshness } = JSON.parse(readFileSync('src/generated/data.json', 'utf8')) as {
        builtAt: string
        freshness?: Record<string, string | null>
      }
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ builtAt }) })
      // status.json: when each source last answered. Read by the admin page and by the daily
      // stale-data check in the backend (checkFreshness in apps-script/Code.gs). The form is fetched
      // hourly and its stamp is not committed, so a build that did not fetch it (a push) keeps the
      // time the published site already shows.
      const fresh = { scopus: null, openalex: null, scholar: null, forms: null, ...freshness }
      if (!fresh.forms) fresh.forms = await publishedFormsStamp()
      this.emitFile({ type: 'asset', fileName: 'status.json', source: JSON.stringify({ builtAt, freshness: fresh }) })
    },
  }
}

// Login backend URL (Apps Script web app) from data/sources.json → import.meta.env.VITE_LOGIN_API.
const sources = JSON.parse(readFileSync('data/sources.json', 'utf8')) as { loginApiUrl?: string }

// The path the site is served under. GitHub Pages serves it under the repository name; a host that
// serves it at the root (Cloudflare Pages) builds with SITE_BASE=/.
const base = process.env.SITE_BASE || '/seen-faculty-screening/'
if (!base.startsWith('/') || !base.endsWith('/')) throw new Error(`SITE_BASE must start and end with "/": ${base}`)

export default defineConfig({
  base,
  define: { 'import.meta.env.VITE_LOGIN_API': JSON.stringify(sources.loginApiUrl ?? '') },
  plugins: [react(), versionFile()],
  // Embed the SEEN logo and favicon (under 8 KB) so standalone/index.html works offline.
  build: {
    assetsInlineLimit: 8192,
    // sfs_webapp.html: the web-app layout (src/webapp/, Tum 2026-11-11), next to sfs.html.
    // scripts/build-standalone.mjs sets SEEN_SINGLE_ENTRY: one page, so one JS bundle to inline.
    rollupOptions: { input: process.env.SEEN_SINGLE_ENTRY ? ['index.html'] : ['index.html', 'sfs_webapp.html'] },
  },
  test: {
    environment: 'node',
  },
})
