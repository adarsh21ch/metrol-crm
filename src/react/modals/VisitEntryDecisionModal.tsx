import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { VISIT_TYPE, fmtDate } from '@/lib/hr'
import { count } from '@/lib/format'
import type { VisitEntry, VisitPurpose } from '@/lib/hr'

/** HR or the owner approving or rejecting one visit entry. Same shape as
 *  LeaveDecisionModal — one modal for both actions, decided by which button
 *  opened it. */
export function VisitEntryDecisionModal({
  request, action, employeeName, purposeLabel, onClose, onDecide,
}: {
  request: VisitEntry
  action: 'approved' | 'rejected'
  employeeName: string
  purposeLabel: string
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
      title={action === 'approved' ? 'Approve visit entry' : 'Reject visit entry'}
      sub={`${employeeName} · ${purposeLabel}`}
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
      <p style={{ margin: '0 0 6px', fontWeight: 500 }}>
        {fmtDate(request.startDate)}{request.endDate !== request.startDate ? ` – ${fmtDate(request.endDate)}` : ''}
        {' · '}{VISIT_TYPE[request.visitType].label}{' · '}{count(request.daysCount, 'working day')}
      </p>
      {request.detail && <p style={{ marginBottom: 12, color: 'var(--ink-3)' }}>“{request.detail}”</p>}
      <p className="punch-note" style={{ margin: '0 0 12px' }}>
        Approving this marks the day(s) as a visit entry, not absent — it never touches their paid-leave balance.
      </p>
      <div className="field">
        <label htmlFor="viNote">Note {action === 'rejected' ? '' : '(optional)'}</label>
        <textarea className="input" id="viNote" rows={3} value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={action === 'rejected' ? 'Why — this is shown to them' : 'Optional'} />
      </div>
    </Modal>
  )
}

/** Convenience for callers that only have the purpose id, not the label —
 *  every call site already has the purposes list loaded for the picker. */
export function purposeLabelOf(purposes: VisitPurpose[], purposeId: string | null): string {
  return purposes.find((p) => p.id === purposeId)?.label ?? 'No purpose set'
}
