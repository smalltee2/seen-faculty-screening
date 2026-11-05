import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/seen-faculty-screening/',
  plugins: [react()],
  // Embed the SEEN logo and favicon (under 8 KB) so standalone/index.html works offline.
  build: { assetsInlineLimit: 8192 },
  test: {
    environment: 'node',
  },
})
