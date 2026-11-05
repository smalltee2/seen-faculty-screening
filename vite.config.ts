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

export default defineConfig({
  base: '/seen-faculty-screening/',
  plugins: [react(), versionFile()],
  // Embed the SEEN logo and favicon (under 8 KB) so standalone/index.html works offline.
  build: { assetsInlineLimit: 8192 },
  test: {
    environment: 'node',
  },
})
