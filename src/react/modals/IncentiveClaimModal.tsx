import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { INCENTIVE_PAGE_TYPE, reelShortCode } from '@/lib/hr'
import type { IncentiveClaimDraft } from '@/data/useIncentiveClaims'

export interface ClaimablePage {
  pageId: string
  clientName: string
  pageType: 'main' | 'fan'
  instagramHandle: string
}

/** An employee submitting one reel for its department's incentive. Picks
 *  from their OWN assigned pages (0032) — client, page type and handle all
 *  come from the Page they choose, nothing typed loose any more. Views start
 *  at 0; the caller looks the reel up on Instagram right after it saves
 *  (useIncentiveClaims.checkViews), and a database trigger works out the
 *  tier from there. */
export function IncentiveClaimModal({
  employeeId, departmentId, myPages, onClose, onSave,
}: {
  employeeId: string
  departmentId: string
  myPages: ClaimablePage[]
  onClose: () => void
  onSave: (draft: IncentiveClaimDraft) => Promise<string | null>
}) {
  const [pageId, setPageId] = useState(myPages[0]?.pageId ?? '')
  const [reelUrl, setReelUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // A link the view check can never look up (a profile, a /share/ redirect)
  // would sit on "not checked" forever — say so now, not after submitting.
  const badLink = reelUrl.trim() !== '' && !reelShortCode(reelUrl)
  const invalid = !reelUrl.trim() || !pageId || badLink

  const save = async () => {
    setBusy(true)
    setErr(null)
    const message = await onSave({ employeeId, departmentId, pageId, reelUrl })
    setBusy(false)
    if (message) { setErr(message); return }
    onClose()
  }

  return (
    <Modal
      title="Claim an incentive"
      sub="For a reel that has crossed a view milestone"
      onClose={onClose}
      foot={
        <>
          <button className="btn btn--sm" onClick={onClose}>Cancel</button>
          <button className="btn btn--sm btn--primary" disabled={invalid || busy} onClick={() => void save()}>
            {busy ? 'Sending…' : 'Send for review'}
          </button>
        </>
      }
    >
      {err && <div className="auth-err" style={{ marginBottom: 12 }}>{err}</div>}
      {myPages.length === 0 ? (
        <p className="punch-note">
          You have no pages assigned yet. Ask HR or your department head to assign you one before you can claim an incentive.
        </p>
      ) : (
        <div className="auth-form">
          <div className="field">
            <label htmlFor="icPage">Which page did this reel go on?</label>
            <select className="input" id="icPage" value={pageId} onChange={(e) => setPageId(e.target.value)}>
              {myPages.map((p) => (
                <option key={p.pageId} value={p.pageId}>
                  {p.clientName} — {INCENTIVE_PAGE_TYPE[p.pageType]}{p.instagramHandle ? ` (${p.instagramHandle})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="icUrl">Reel link</label>
            <input className="input" id="icUrl" type="url" value={reelUrl}
                   onChange={(e) => setReelUrl(e.target.value)} placeholder="https://instagram.com/reel/…" />
            {badLink && (
              <div className="auth-err">
                Not a reel link. Open the reel on Instagram, tap ⋯ → Copy link, and paste that (instagram.com/reel/…).
              </div>
            )}
          </div>
          <p className="punch-note">
            Views are fetched from Instagram as soon as you send this. HR confirms the amount.
          </p>
        </div>
      )}
    </Modal>
  )
}
