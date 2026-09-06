import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { todayISO } from '@/lib/hr'
import type { LeaveDraft } from '@/data/useLeaveRequests'

/** A person asking for their own leave. There is no status field here — every
 *  request this modal creates starts pending, the same way RLS (0009) insists
 *  on it: nobody approves their own leave on the way in. */
export function LeaveRequestModal({
  employeeId, onClose, onSave,
}: {
  employeeId: string
  onClose: () => void
  onSave: (draft: LeaveDraft) => Promise<string | null>
}) {
  const [startDate, setStartDate] = useState(todayISO())
  const [endDate, setEndDate] = useState(todayISO())
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const invalid = endDate < startDate
  const days = invalid ? 0 : Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1

  const save = async () => {
    setBusy(true)
    setErr(null)
    const message = await onSave({ employeeId, startDate, endDate, reason })
    setBusy(false)
    if (message) { setErr(message); return }
    onClose()
  }

  return (
    <Modal
      title="Request leave"
      sub={invalid ? undefined : `${days} day${days === 1 ? '' : 's'}`}
      onClose={onClose}
      foot={
        <>
          <button className="btn btn--sm" onClick={onClose}>Cancel</button>
          <button className="btn btn--sm btn--primary" disabled={invalid || busy} onClick={() => void save()}>
            {busy ? 'Sending…' : 'Send request'}
          </button>
        </>
      }
    >
      {err && <div className="auth-err" style={{ marginBottom: 12 }}>{err}</div>}
      <div className="auth-form">
        <div className="field">
          <label htmlFor="lvStart">From</label>
          <input className="input" id="lvStart" type="date" value={startDate}
                 onChange={(e) => { setStartDate(e.target.value); if (e.target.value > endDate) setEndDate(e.target.value) }} />
        </div>
        <div className="field">
          <label htmlFor="lvEnd">To</label>
          <input className="input" id="lvEnd" type="date" value={endDate} min={startDate}
                 onChange={(e) => setEndDate(e.target.value)} />
        </div>
        {invalid && <p className="auth-err">The end date cannot be before the start date.</p>}
        <div className="field">
          <label htmlFor="lvReason">Reason</label>
          <textarea className="input" id="lvReason" rows={3} value={reason}
                    onChange={(e) => setReason(e.target.value)} placeholder="Optional" />
        </div>
      </div>
    </Modal>
  )
}
