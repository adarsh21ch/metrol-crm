import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { fmtDate } from '@/lib/hr'
import { count } from '@/lib/format'
import type { WfhRequest } from '@/lib/hr'

/** HR or the owner approving or rejecting one WFH request. Same shape as
 *  LeaveDecisionModal and VisitEntryDecisionModal. */
export function WfhDecisionModal({
  request, action, employeeName, onClose, onDecide,
}: {
  request: WfhRequest
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
      title={action === 'approved' ? 'Approve WFH' : 'Reject WFH'}
      sub={`${employeeName} · work from home`}
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
      {request.reason && <p style={{ marginBottom: 12, color: 'var(--ink-3)' }}>“{request.reason}”</p>}
      <p className="punch-note" style={{ margin: '0 0 12px' }}>
        Approving this marks the day(s) as work from home, not absent — it never touches their paid-leave balance.
      </p>
      <div className="field">
        <label htmlFor="wfhNote">Note {action === 'rejected' ? '' : '(optional)'}</label>
        <textarea className="input" id="wfhNote" rows={3} value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={action === 'rejected' ? 'Why — this is shown to them' : 'Optional'} />
      </div>
    </Modal>
  )
}
