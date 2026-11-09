// Works added through the admin Google Form that a level-2 admin cancelled from the site
// ("ยกเลิกผลงาน", 2026-11-10). The backend keeps every press in its form_cancels sheet; the
// latest press per lecturer + title wins. Cancelled rows are dropped before counting, both
// live on the site and in the hourly build (scripts/fetch-sources.mjs → data/form_cancels.tsv).
import { normalizeTitle } from './classify'
import { api } from './emailLogin'
import type { RawPub } from './types'

export interface FormCancelItem {
  at: string
  nameEn: string
  titleNorm: string
  title: string
  action: 'cancel' | 'restore'
  by: string
}

export async function fetchFormCancels(): Promise<FormCancelItem[] | null> {
  try {
    const r = await api({ action: 'formCancelList' })
    return r.ok && Array.isArray(r.items) ? (r.items as FormCancelItem[]) : null
  } catch {
    return null
  }
}

export const formKey = (nameEn: string, titleNorm: string) => `${nameEn}|${titleNorm}`

/** Latest press per work; only works whose latest press is "cancel". */
export function cancelledForms(items: FormCancelItem[]): Map<string, FormCancelItem> {
  const latest = new Map<string, FormCancelItem>()
  for (const it of [...items].sort((a, b) => a.at.localeCompare(b.at))) latest.set(formKey(it.nameEn, it.titleNorm), it)
  return new Map([...latest].filter(([, it]) => it.action === 'cancel'))
}

/** A row from the admin form (manual.tsv or the live responses sheet), not a lecturer's own submission. */
export const isFormRow = (p: Pick<RawPub, 'source' | 'submitted'>) => p.source === 'manual' && !p.submitted?.startsWith('self:')

/** Drop admin-form rows that are cancelled. */
export function dropCancelledForms(rows: RawPub[], cancelled: Map<string, FormCancelItem>): RawPub[] {
  if (!cancelled.size) return rows
  return rows.filter((p) => !(isFormRow(p) && cancelled.has(formKey(p.key, normalizeTitle(p.title)))))
}
