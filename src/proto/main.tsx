import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import raw from '../generated/data.json'
import { initTci } from '../tciIndex'
import type { DataBundle } from '../types'
import '../styles.css'
import '../theme-academic.css'
import './proto.css'
import { ProtoApp } from './ProtoApp'

initTci(raw as unknown as DataBundle)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProtoApp />
  </StrictMode>,
)
