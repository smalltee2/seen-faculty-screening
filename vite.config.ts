import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'

/** Writes version.json ({ builtAt } of the data bundle) next to index.html, so an open
 *  page can notice a newer deploy and reload itself (src/autoRefresh.ts). */
function versionFile(): Plugin {
  return {
    name: 'seen-version-file',
    apply: 'build',
    generateBundle() {
      const { builtAt } = JSON.parse(readFileSync('src/generated/data.json', 'utf8')) as { builtAt: string }
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ builtAt }) })
    },
  }
}

// Login backend URL (Apps Script web app) from data/sources.json → import.meta.env.VITE_LOGIN_API.
const sources = JSON.parse(readFileSync('data/sources.json', 'utf8')) as { loginApiUrl?: string }

export default defineConfig({
  base: '/seen-faculty-screening/',
  define: { 'import.meta.env.VITE_LOGIN_API': JSON.stringify(sources.loginApiUrl ?? '') },
  plugins: [react(), versionFile()],
  // Embed the SEEN logo and favicon (under 8 KB) so standalone/index.html works offline.
  build: {
    assetsInlineLimit: 8192,
    // Two entries: the site, and the per-lecturer page (served from dist/p/<token>/ by scripts/build-personal.mjs).
    // SEEN_SINGLE_ENTRY=1 (scripts/build-standalone.mjs) builds only the site, as one JS file.
    rollupOptions: { input: process.env.SEEN_SINGLE_ENTRY ? 'index.html' : { main: 'index.html', personal: 'personal.html' } },
  },
  test: {
    environment: 'node',
  },
})
