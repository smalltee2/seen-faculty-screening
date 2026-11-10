import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { InfoTip } from './InfoTip'

describe('InfoTip', () => {
  const html = renderToStaticMarkup(
    <h1>
      หัวข้อ <InfoTip label="คำอธิบาย"><span>ข้อความ</span></InfoTip>
    </h1>,
  )
  it('is a labelled button that controls a hidden note', () => {
    const id = /aria-controls="([^"]+)"/.exec(html)?.[1]
    expect(html).toMatch(/<button type="button" class="info-tip-btn" aria-label="คำอธิบาย" aria-expanded="false"/)
    expect(html).toContain(`<span id="${id}" class="info-tip-pop" role="note" hidden="">`)
  })
  it('uses only phrasing elements, so it is valid inside a heading', () => {
    expect(html).not.toMatch(/<(div|ul|li|p)\b/)
  })
})
