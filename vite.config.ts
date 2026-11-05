import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/seen-faculty-screening/',
  plugins: [react()],
  test: {
    environment: 'node',
  },
})
