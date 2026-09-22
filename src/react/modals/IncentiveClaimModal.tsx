import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { INCENTIVE_PAGE_TYPE } from '@/lib/hr'
import type { IncentivePageType } from '@/lib/hr'
import type { IncentiveClaimDraft } from '@/data/useIncentiveClaims'

/** An employee submitting one reel for its department's incentive. Page type
 *  is picked per reel, not fixed on the person — Adarsh's own words,
 *  2026-09-22: a lot of people post to both main and fan pages. Views start
 *  at 0; HR (later, an API) fills them in, and a database trigger works out
 *  the tier from there. */
export function IncentiveClaimModal({
  employeeId, departmentId, onClose, onSave,
}: {
  employeeId: string
  departmentId: string
  onClose: () => void
  onSave: (draft: IncentiveClaimDraft) => Promise<string | null>
}) {
  const [pageType, setPageType] = useState<IncentivePageType>('main')
  const [reelUrl, setReelUrl] = useState('')
  const [handle, setHandle] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const invalid = !reelUrl.trim()

  const save = async () => {
    setBusy(true)
    setErr(null)
    const message = await onSave({ employeeId, departmentId, pageType, reelUrl, instagramHandle: handle || undefined })
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
      <div className="auth-form">
        <div className="field">
          <label>Page type</label>
          <div className="seg seg--form" role="group" aria-label="Page type">
            {(Object.keys(INCENTIVE_PAGE_TYPE) as IncentivePageType[]).map((t) => (
              <button key={t} type="button" className={pageType === t ? 'is-on' : ''}
                      aria-pressed={pageType === t} onClick={() => setPageType(t)}>
                {INCENTIVE_PAGE_TYPE[t]}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label htmlFor="icUrl">Reel link</label>
          <input className="input" id="icUrl" type="url" value={reelUrl}
                 onChange={(e) => setReelUrl(e.target.value)} placeholder="https://instagram.com/reel/…" />
        </div>
        <div className="field">
          <label htmlFor="icHandle">Instagram handle (optional)</label>
          <input className="input" id="icHandle" type="text" value={handle}
                 onChange={(e) => setHandle(e.target.value)} placeholder="@metrolmedia" />
        </div>
        <p className="punch-note">
          HR checks the view count and confirms the amount — you'll see it update here once it's reviewed.
        </p>
      </div>
    </Modal>
  )
}
