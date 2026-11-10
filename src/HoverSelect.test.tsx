import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { HoverSelect } from './HoverSelect'

const opts = [
  { value: '2026', label: 'พ.ศ.2569 (2026)' },
  { value: '2027', label: 'พ.ศ.2570 (2027)' },
]

describe('HoverSelect', () => {
  const html = renderToStaticMarkup(<HoverSelect id="eval-year" label="ปีที่ประเมิน" value="2027" options={opts} onChange={() => undefined} />)
  it('shows the chosen option on a combobox button, with the list closed', () => {
    expect(html).toMatch(/<button[^>]*id="eval-year"[^>]*role="combobox"[^>]*aria-expanded="false"/)
    expect(html).toContain('<span class="hover-select-value">พ.ศ.2570 (2027)</span>')
    expect(html).toMatch(/<ul id="eval-year-list" role="listbox"[^>]*hidden=""/)
  })
  it('every option is in the list, and only the chosen one is selected', () => {
    expect(html.match(/role="option"/g)).toHaveLength(2)
    expect(html).toContain('id="eval-year-opt-1" role="option" aria-selected="true"')
    expect(html).toContain('id="eval-year-opt-0" role="option" aria-selected="false"')
  })
  it('the label names both the button and the list', () => {
    const id = /<span class="control-label" id="([^"]+)">ปีที่ประเมิน<\/span>/.exec(html)?.[1]
    expect(id).toBeTruthy()
    expect(html.match(new RegExp(`aria-labelledby="${id}"`, 'g'))).toHaveLength(2)
  })
  it('a value not in the list falls back to the first option instead of showing nothing', () => {
    expect(renderToStaticMarkup(<HoverSelect id="x" label="x" value="1999" options={opts} onChange={() => undefined} />)).toContain('พ.ศ.2569 (2026)</span>')
  })
})
