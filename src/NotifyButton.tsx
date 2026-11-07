// "แจ้งเตือนทางอีเมล" for a lecturer who fails a duty or may fail next year (src/notify.ts).
// Two clicks: the first shows a preview with ยืนยัน / ยกเลิก, the second sends. Needs the
// level-2 approval key or an admin e-mail sign-in; otherwise the button is not rendered.
import { useState } from 'react'
import { errorText, useEmailUser } from './emailLogin'
import { buildNotice, lastNotice, sendNotice, type Notice, type NoticeKind } from './notify'
import type { PersonResult, Settings } from './rules'

export interface NotifyProps {
  approvalKey?: string
  notices: Notice[]
  onSent: () => void
}

const fmt = (iso: string) => new Date(iso).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })

export function NotifyButton({ r, settings, kind, approvalKey, notices, onSent, compact = false }: { r: PersonResult; settings: Settings; kind: NoticeKind; compact?: boolean } & NotifyProps) {
  const { user } = useEmailUser()
  const [step, setStep] = useState<'idle' | 'confirm' | 'busy' | 'sent'>('idle')
  const [error, setError] = useState('')
  if (!approvalKey && !user?.isAdmin) return null
  const last = lastNotice(notices, r.person.nameEn, kind)
  const label = kind === 'fail' ? 'แจ้งเตือน: ไม่ผ่านบางหน้าที่' : 'แจ้งเตือน: ปีหน้าอาจไม่ผ่าน'
  const send = async () => {
    setStep('busy')
    setError('')
    const res = await sendNotice(r, settings, kind, approvalKey)
    if (res.ok) {
      setStep('sent')
      onSent()
    } else {
      setStep('idle')
      setError(errorText(res.error))
    }
  }
  if (step === 'confirm') {
    const { subject } = buildNotice(r, settings, kind)
    return (
      <div className="notify-confirm no-print" role="group" aria-label="ยืนยันการส่งอีเมล">
        <div className="notify-preview">
          <b>ส่งอีเมลถึง {r.person.nameTh || r.person.nameEn}</b>
          <span className="muted small">หัวข้อ: {subject}</span>
        </div>
        <div className="notify-actions">
          <button type="button" className="btn btn-small btn-primary" onClick={() => void send()}>
            ยืนยันส่ง
          </button>
          <button type="button" className="btn btn-small" onClick={() => setStep('idle')}>
            ยกเลิก
          </button>
        </div>
      </div>
    )
  }
  return (
    <div className={`notify no-print${compact ? ' notify-compact' : ''}`}>
      <button type="button" className={`btn btn-small notify-btn notify-${kind}`} disabled={step === 'busy'} onClick={() => setStep('confirm')} title={label}>
        {step === 'busy' ? 'กำลังส่ง…' : step === 'sent' ? 'ส่งแล้ว ✓' : compact ? 'แจ้งเตือน' : label}
      </button>
      {last ? (
        <span className="notify-status-group">
          <span className="notify-status">
            ✓ แจ้งเตือนแล้ว {fmt(last.at)} น.<small> · {last.by}</small>
          </span>
          {last.ackAt ? (
            <span className="notify-status notify-acked">✓✓ รับทราบแล้ว {fmt(last.ackAt)} น.</span>
          ) : (
            <span className="muted small">ยังไม่รับทราบ</span>
          )}
        </span>
      ) : (
        <span className="muted small">ยังไม่เคยแจ้งเตือน</span>
      )}
      {error && (
        <span className="gate-error small" role="alert">
          {error}
        </span>
      )}
    </div>
  )
}
