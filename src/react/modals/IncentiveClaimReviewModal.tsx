import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { currentPeriod, fmtPeriod } from '@/lib/hr'
import { money } from '@/lib/format'
import type { IncentiveClaim } from '@/lib/hr'

/** One claim's full detail and every action HR can take on it, all in one
 *  place — replaces what used to be an always-expanded row plus a separate
 *  approve/reject popup. Adarsh, 2026-09-22: the claims list was taking
 *  "unnecessary space" with everything inline; this is the click-to-open
 *  version instead. Saving a view count keeps the modal open (the caller
 *  re-renders it with the freshest claim, tier included), so checking a
 *  number and then deciding is one visit, not two.
 *
 *  pageLabel replaces the old editable "Instagram handle" field (0032): the
 *  handle now lives on the Page record the claim points at, not on the claim
 *  itself — fix a wrong handle from Clients & Pages, not from here. */
export function IncentiveClaimReviewModal({
  claim, employeeName, pageLabel, ruleLabel, owed, onClose, onSaveViews, onApprove, onReject,
}: {
  claim: IncentiveClaim
  employeeName: string
  pageLabel: string
  ruleLabel: string
  owed: number
  onClose: () => void
  onSaveViews: (views: number) => Promise<string | null>
  onApprove: (period: string) => Promise<string | null>
  onReject: (note?: string) => Promise<string | null>
}) {
  const [viewsInput, setViewsInput] = useState(String(claim.views || ''))
  const [period, setPeriod] = useState(currentPeriod().slice(0, 7))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<'views' | 'approve' | 'reject' | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [savedNote, setSavedNote] = useState<string | null>(null)

  const saveViews = async () => {
    setBusy('views'); setErr(null); setSavedNote(null)
    const message = await onSaveViews(Number(viewsInput) || 0)
    setBusy(null)
    if (message) { setErr(message); return }
    setSavedNote('Views updated.')
  }
  const approve = async () => {
    setBusy('approve'); setErr(null)
    const message = await onApprove(period + '-01')
    setBusy(null)
    if (message) { setErr(message); return }
    onClose()
  }
  const reject = async () => {
    setBusy('reject'); setErr(null)
    const message = await onReject(note.trim() || undefined)
    setBusy(null)
    if (message) { setErr(message); return }
    onClose()
  }

  return (
    <Modal
      title="Incentive claim"
      sub={`${employeeName} · ${pageLabel} · ${ruleLabel}`}
      onClose={onClose}
      foot={<button className="btn btn--sm" onClick={onClose}>Close</button>}
    >
      {err && <div className="auth-err" style={{ marginBottom: 12 }}>{err}</div>}
      <p style={{ margin: '0 0 14px' }}>
        <a href={claim.reelUrl} target="_blank" rel="noreferrer">{claim.reelUrl}</a>
      </p>

      <div className="auth-form" style={{ marginBottom: 14 }}>
        <div className="field">
          <label htmlFor="icrViews">Views</label>
          <input className="input" id="icrViews" type="number" min={0} value={viewsInput}
                 onChange={(e) => setViewsInput(e.target.value)} />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <button className="btn btn--sm" disabled={busy === 'views'} onClick={() => void saveViews()}>
          {busy === 'views' ? 'Saving…' : 'Save views'}
        </button>
        {savedNote && <span className="punch-note">{savedNote} · now worth {money(claim.currentAmount)}</span>}
      </div>

      {claim.rejected ? (
        <p className="punch-note">This claim was rejected{claim.decisionNote ? ` — "${claim.decisionNote}"` : '.'}</p>
      ) : (
        <>
          {owed > 0 && (
            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14, marginBottom: 14 }}>
              <p className="punch-note" style={{ margin: '0 0 10px' }}>{money(owed)} not yet paid — approving adds it to one salary period's payslip.</p>
              <div className="field" style={{ marginBottom: 10 }}>
                <label htmlFor="icrPeriod">Salary period</label>
                <input className="input" id="icrPeriod" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
                <span className="punch-note">{fmtPeriod(period)}</span>
              </div>
              <button className="btn btn--sm btn--primary" disabled={busy === 'approve'} onClick={() => void approve()}>
                {busy === 'approve' ? 'Saving…' : `Approve ${money(owed)}`}
              </button>
            </div>
          )}
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
            <div className="field" style={{ marginBottom: 10 }}>
              <label htmlFor="icrNote">Reject with a reason (shown to them)</label>
              <textarea className="input" id="icrNote" rows={2} value={note}
                        onChange={(e) => setNote(e.target.value)} placeholder="Why this reel does not qualify" />
            </div>
            <button className="btn btn--sm" disabled={busy === 'reject'} onClick={() => void reject()}>
              {busy === 'reject' ? 'Saving…' : 'Reject'}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
