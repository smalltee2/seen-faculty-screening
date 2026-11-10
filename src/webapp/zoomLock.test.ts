import { describe, expect, it } from 'vitest'
import { lockZoom } from './zoomLock'

type Handler = (e: Event) => void
function fakeTarget() {
  const handlers: Record<string, { fn: Handler; opts: unknown }[]> = {}
  return {
    handlers,
    addEventListener: (type: string, fn: Handler, opts?: unknown) => void (handlers[type] = [...(handlers[type] ?? []), { fn, opts }]),
  }
}
const ev = (touches?: number) => {
  let prevented = false
  const e = { preventDefault: () => (prevented = true), touches: touches === undefined ? undefined : { length: touches } } as unknown as Event
  return { e, prevented: () => prevented }
}

describe('lockZoom', () => {
  const t = fakeTarget()
  lockZoom(t as unknown as Document, () => true)
  it("cancels Safari's pinch gestures, with non-passive listeners", () => {
    for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
      const x = ev()
      t.handlers[type][0].fn(x.e)
      expect(x.prevented()).toBe(true)
      expect(t.handlers[type][0].opts).toEqual({ passive: false })
    }
  })
  it('cancels a two-finger move but leaves one-finger scrolling alone', () => {
    const pinch = ev(2)
    t.handlers.touchmove[0].fn(pinch.e)
    expect(pinch.prevented()).toBe(true)
    const scroll = ev(1)
    t.handlers.touchmove[0].fn(scroll.e)
    expect(scroll.prevented()).toBe(false)
  })
})

describe('lockZoom on a wider screen', () => {
  it('leaves zoom alone (a Mac trackpad pinch sends the same gesture events)', () => {
    const t = fakeTarget()
    lockZoom(t as unknown as Document, () => false)
    const g = ev()
    t.handlers.gesturestart[0].fn(g.e)
    expect(g.prevented()).toBe(false)
    const pinch = ev(2)
    t.handlers.touchmove[0].fn(pinch.e)
    expect(pinch.prevented()).toBe(false)
  })
})
