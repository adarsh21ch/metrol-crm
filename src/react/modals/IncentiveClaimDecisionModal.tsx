import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { currentPeriod, fmtPeriod, INCENTIVE_PAGE_TYPE } from '@/lib/hr'
import { money } from '@/lib/format'
import type { IncentiveClaim } from '@/lib/hr'

/** HR approving or rejecting one claim. Approving is the payout event itself
 *  (0031's own note: there is no separate "approved" status on the claim,
 *  only a new incentive_payouts row) — so this modal collects the one thing
 *  Adarsh asked HR to decide: which salary period the money lands in,
 *  defaulting to the month of approval, editable back a month while that
 *  payroll is still open. */
export function IncentiveClaimDecisionModal({
  claim, action, employeeName, tierLabel, owed, onClose, onDecide,
}: {
  claim: IncentiveClaim
  action: 'approve' | 'reject'
  employeeName: string
  tierLabel: string
  owed: number
  onClose: () => void
  onDecide: (period: string | undefined, note: string | undefined) => Promise<string | null>
}) {
  const [period, setPeriod] = useState(currentPeriod().slice(0, 7))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const confirm = async () => {
    setBusy(true)
    setErr(null)
    const message = await onDecide(action === 'approve' ? period + '-01' : undefined, note.trim() || undefined)
    setBusy(false)
    if (message) { setErr(message); return }
    onClose()
  }

  return (
    <Modal
      title={action === 'approve' ? 'Approve incentive claim' : 'Reject incentive claim'}
      sub={`${employeeName} · ${INCENTIVE_PAGE_TYPE[claim.pageType]} · ${tierLabel}`}
      onClose={onClose}
      foot={
        <>
          <button className="btn btn--sm" onClick={onClose}>Cancel</button>
          <button className={'btn btn--sm ' + (action === 'approve' ? 'btn--primary' : '')} disabled={busy} onClick={() => void confirm()}>
            {busy ? 'Saving…' : action === 'approve' ? `Approve ${money(owed)}` : 'Reject'}
          </button>
        </>
      }
    >
      {err && <div className="auth-err" style={{ marginBottom: 12 }}>{err}</div>}
      <p style={{ margin: '0 0 12px' }}>
        <a href={claim.reelUrl} target="_blank" rel="noreferrer">{claim.reelUrl}</a>
      </p>
      {action === 'approve' ? (
        <>
          <p className="punch-note" style={{ margin: '0 0 12px' }}>
            {money(owed)} not yet paid on this reel — approving adds it to one salary period's payslip.
          </p>
          <div className="field">
            <label htmlFor="icPeriod">Salary period</label>
            <input className="input" id="icPeriod" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
            <span className="punch-note">{fmtPeriod(period)}</span>
          </div>
        </>
      ) : (
        <div className="field">
          <label htmlFor="icNote">Reason (shown to them)</label>
          <textarea className="input" id="icNote" rows={3} value={note}
                    onChange={(e) => setNote(e.target.value)} placeholder="Why this reel does not qualify" />
        </div>
      )}
    </Modal>
  )
}
