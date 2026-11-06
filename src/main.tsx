import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import raw from './generated/data.json'
import { initTci } from './tciIndex'
import type { DataBundle } from './types'
import './styles.css'
import './theme-academic.css'

initTci(raw as DataBundle)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
