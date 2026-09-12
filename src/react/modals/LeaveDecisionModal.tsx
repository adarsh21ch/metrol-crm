import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { LEAVE_TYPE, fmtDate } from '@/lib/hr'
import { count } from '@/lib/format'
import type { LeaveRequest } from '@/lib/hr'

/** HR or the owner approving or rejecting one request. One modal for both
 *  actions — which one it is was decided by which button opened it. */
export function LeaveDecisionModal({
  request, action, employeeName, onClose, onDecide,
}: {
  request: LeaveRequest
  action: 'approved' | 'rejected'
  employeeName: string
  onClose: () => void
  onDecide: (id: string, status: 'approved' | 'rejected', note?: string) => Promise<string | null>
}) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const confirm = async () => {
    setBusy(true)
    setErr(null)
    const message = await onDecide(request.id, action, note.trim() || undefined)
    setBusy(false)
    if (message) { setErr(message); return }
    onClose()
  }

  return (
    <Modal
      title={action === 'approved' ? 'Approve leave' : 'Reject leave'}
      // The type belongs up here, not buried: approving three unpaid days is
      // not the same decision as approving three sick ones. The raw ISO dates
      // that used to be in this line read like a database field, so they moved
      // into the body where there is room to say them properly.
      sub={`${employeeName} · ${LEAVE_TYPE[request.leaveType].label} leave`}
      onClose={onClose}
      foot={
        <>
          <button className="btn btn--sm" onClick={onClose}>Cancel</button>
          <button className={'btn btn--sm ' + (action === 'approved' ? 'btn--primary' : '')} disabled={busy} onClick={() => void confirm()}>
            {busy ? 'Saving…' : action === 'approved' ? 'Approve' : 'Reject'}
          </button>
        </>
      }
    >
      {err && <div className="auth-err" style={{ marginBottom: 12 }}>{err}</div>}
      <p style={{ margin: '0 0 10px', fontWeight: 500 }}>
        {fmtDate(request.startDate)} – {fmtDate(request.endDate)} · {count(request.daysCount, 'working day')}
      </p>
      {request.leaveType === 'unpaid' && (
        <p className="punch-note" style={{ margin: '0 0 10px' }}>
          Unpaid, so approving this does not take anything out of their paid balance for the year.
        </p>
      )}
      {request.reason && <p style={{ marginBottom: 12, color: 'var(--ink-3)' }}>“{request.reason}”</p>}
      <div className="field">
        <label htmlFor="lvNote">Note {action === 'rejected' ? '' : '(optional)'}</label>
        <textarea className="input" id="lvNote" rows={3} value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={action === 'rejected' ? 'Why — this is shown to them' : 'Optional'} />
      </div>
    </Modal>
  )
}
