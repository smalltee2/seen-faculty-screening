import { describe, expect, it } from 'vitest'
import { cancelledForms, dropCancelledForms, type FormCancelItem } from './formCancel'
import type { RawPub } from './types'

const row = (over: Partial<RawPub>): RawPub => ({ line: 1, source: 'manual', key: 'A', year: 2025, title: 'Solar Drying, Part 1', authors: '', venue: 'J, 2025', cites: 0, ...over })
const press = (action: 'cancel' | 'restore', at: string, over: Partial<FormCancelItem> = {}): FormCancelItem => ({ at, nameEn: 'A', titleNorm: 'solardryingpart1', title: 'Solar Drying, Part 1', action, by: 'ผู้ดูแลระดับ 2', ...over })

describe('form cancellations', () => {
  it('the latest press per work wins', () => {
    expect(cancelledForms([press('cancel', '2026-11-10T01:00:00Z')]).size).toBe(1)
    expect(cancelledForms([press('cancel', '2026-11-10T01:00:00Z'), press('restore', '2026-11-10T02:00:00Z')]).size).toBe(0)
    expect(cancelledForms([press('restore', '2026-11-10T03:00:00Z'), press('cancel', '2026-11-10T02:00:00Z')]).size).toBe(0)
  })
  it('drops only the cancelled admin-form row of that lecturer', () => {
    const c = cancelledForms([press('cancel', '2026-11-10T01:00:00Z')])
    const rows = [row({}), row({ key: 'B' }), row({ source: 'openalex' }), row({ submitted: 'self:x1' })]
    expect(dropCancelledForms(rows, c).map((r) => `${r.key}/${r.source}/${r.submitted ?? ''}`)).toEqual(['B/manual/', 'A/openalex/', 'A/manual/self:x1'])
  })
})
