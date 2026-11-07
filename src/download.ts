import { csvLine } from './review'

/** Download rows as a UTF-8 CSV with BOM so Excel shows Thai correctly. */
export function downloadCsv(filename: string, header: string[], rows: (string | number | null)[][]): void {
  const text = '﻿' + [csvLine(header), ...rows.map(csvLine)].join('\r\n') + '\r\n'
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Safari and some Firefox builds abort the download if the URL is revoked in the same tick.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}
