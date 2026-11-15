// The canvas of the WebGL2 water and glass (src/webapp/waterGlass.ts). It reports whether it is
// drawing, so the shell can hand the side menu's look over to it (class app-water-on).
import { useEffect, useRef } from 'react'
import { startWater } from './waterGlass'

export function WaterGlass({ enabled, onState }: { enabled: boolean; onState: (on: boolean) => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const root = canvas?.parentElement
    if (!enabled || !canvas || !root) return
    const stop = startWater(canvas, root, () => onState(true), () => onState(false))
    return () => {
      stop?.()
      onState(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])
  return enabled ? <canvas ref={ref} className="app-water no-print" aria-hidden="true" /> : null
}
