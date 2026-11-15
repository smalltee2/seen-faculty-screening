import { describe, expect, it } from 'vitest'
import { nextCompact, placePill } from './navGlass'

/** The few element features placePill uses. */
function fakeNav() {
  const props = new Map<string, string>()
  const attrs = new Map<string, string>()
  return {
    props,
    attrs,
    el: {
      style: { setProperty: (k: string, v: string) => void props.set(k, v) },
      setAttribute: (k: string, v: string) => void attrs.set(k, v),
      removeAttribute: (k: string) => void attrs.delete(k),
      hasAttribute: (k: string) => attrs.has(k),
    } as unknown as HTMLElement,
  }
}

describe('glass menu motion', () => {
  it('puts the pill on the chosen item; the first placement does not slide', () => {
    const n = fakeNav()
    placePill(n.el, { x: 10, y: 0, w: 70, h: 52 })
    expect(n.attrs.get('data-pill')).toBe('first')
    expect(n.props.get('--pill-x')).toBe('10px')
    expect(n.props.get('--pill-w')).toBe('70px')
    placePill(n.el, { x: 90, y: 0, w: 70, h: 52 })
    expect(n.attrs.get('data-pill')).toBe('on')
    expect(n.props.get('--pill-x')).toBe('90px')
  })
  it('hides the pill when no item is chosen in the menu', () => {
    const n = fakeNav()
    placePill(n.el, { x: 10, y: 0, w: 70, h: 52 })
    placePill(n.el, null)
    expect(n.attrs.has('data-pill')).toBe(false)
  })
  it('shrinks the bottom bar on the way down and brings it back on the way up', () => {
    expect(nextCompact(false, 40, 0)).toBe(false) // near the top: always full
    expect(nextCompact(false, 200, 150)).toBe(true)
    expect(nextCompact(true, 203, 200)).toBe(true) // jitter keeps the state
    expect(nextCompact(true, 150, 200)).toBe(false)
    expect(nextCompact(true, 60, 200)).toBe(false)
  })
})
