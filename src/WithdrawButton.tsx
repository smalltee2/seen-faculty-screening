// "ถอน" on the person page (Tum, 2026-11-07): a level-2 admin removes a work that a lecturer added
// and that was approved. It is the same backend decision as "ไม่อนุมัติ" in the approval table
// (status rejected, with a note saying it was withdrawn here), so it can be undone there with
// "ย้อนเป็นรออนุมัติ". Two clicks, like the reminder button.
import { useState } from 'react'
import { api, errorText, sessionStore } from './emailLogin'
import type { Submission } from './submissions'

export interface WithdrawProps {
  approvalKey?: string
  submissions: Submission[]
  onChanged: () => void
}

export const WITHDRAW_NOTE = 'ถอนโดยผู้ดูแลระดับ 2 จากหน้ารายชื่ออาจารย์'

export function WithdrawButton({ sub, approvalKey, onChanged }: { sub: Submission } & Omit<WithdrawProps, 'submissions'>) {
  const [step, setStep] = useState<'idle' | 'confirm' | 'busy'>('idle')
  const [error, setError] = useState('')
  const run = async () => {
    setStep('busy')
    setError('')
    try {
      const r = await api({ action: 'decide', session: sessionStore.get(), adminKey: approvalKey ?? '', id: sub.id, status: 'rejected', note: WITHDRAW_NOTE })
      if (r.ok) onChanged()
      else setError(errorText(r.error))
    } catch {
      setError(errorText(''))
    }
    setStep('idle')
  }
  if (step === 'confirm') {
    return (
      <span className="withdraw-confirm no-print" role="group" aria-label="ยืนยันการถอนผลงาน">
        <span className="small">ถอนผลงานนี้ออกจากการนับ?</span>
        <button type="button" className="btn btn-small btn-primary" onClick={() => void run()}>
          ยืนยันถอน
        </button>
        <button type="button" className="btn btn-small" onClick={() => setStep('idle')}>
          ยกเลิก
        </button>
      </span>
    )
  }
  return (
    <span className="withdraw no-print">
      <button type="button" className="btn btn-small withdraw-btn" disabled={step === 'busy'} onClick={() => setStep('confirm')} title="ถอนผลงานที่อาจารย์เพิ่มเองออกจากการนับ (ย้อนกลับได้ในตารางผลงานที่อาจารย์เพิ่มเอง)">
        {step === 'busy' ? 'กำลังถอน…' : 'ถอน'}
      </button>
      {error && <span className="gate-error small">{error}</span>}
    </span>
  )
}
