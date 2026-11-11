import { describe, expect, it } from 'vitest'
import { APP_THEMES, APP_THEME_IDS, themeUrl } from './appThemes'

describe('picture themes', () => {
  it('offers "none" first and every theme once', () => {
    expect(APP_THEME_IDS[0]).toBe('none')
    expect(new Set(APP_THEME_IDS).size).toBe(APP_THEME_IDS.length)
  })
  it('draws each picture as an SVG data URL, the same on every call', () => {
    for (const t of APP_THEMES) {
      const u = themeUrl(t)
      expect(u.startsWith('url("data:image/svg+xml,')).toBe(true)
      expect(decodeURIComponent(u)).toContain('<svg xmlns="http://www.w3.org/2000/svg"')
      expect(decodeURIComponent(u)).not.toContain('NaN')
      expect(t.draw()).toBe(t.draw()) // deterministic: no Math.random
      expect(u.length).toBeLessThan(200_000)
    }
  })
})
