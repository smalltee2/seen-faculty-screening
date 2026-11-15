import { describe, expect, it } from 'vitest'
import { cssRgb, paneOf } from './waterGlass'

describe('WebGL water and glass: what is measured from the page', () => {
  it('reads a computed colour in the forms browsers return', () => {
    expect(cssRgb('rgb(29, 92, 51)')).toEqual([29 / 255, 92 / 255, 51 / 255])
    expect(cssRgb('rgba(255, 255, 255, 0.5)')).toEqual([1, 1, 1])
    expect(cssRgb('color(srgb 0.1 0.3 0.2)')).toEqual([0.1, 0.3, 0.2])
    expect(cssRgb('')).toBeNull()
    expect(cssRgb('transparent')).toBeNull()
  })
  it('makes a pane from a box; the corner radius is at most half the shorter side', () => {
    const box = { left: 12, top: 12, width: 324, height: 800 }
    expect(paneOf(box, '26px')).toEqual({ x: 12, y: 12, w: 324, h: 800, r: 26 })
    expect(paneOf({ left: 0, top: 0, width: 38, height: 38 }, '50%')?.r).toBe(19)
    expect(paneOf({ left: 0, top: 0, width: 120, height: 38 }, '999px')?.r).toBe(19)
    expect(paneOf(box, '')?.r).toBe(0)
  })
  it('leaves out an element that is not shown', () => {
    expect(paneOf({ left: 0, top: 0, width: 0, height: 0 }, '26px')).toBeNull()
  })
})
