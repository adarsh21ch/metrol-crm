import { useEffect, useRef, useState } from 'react'
import { Modal } from '@/components/Modal'
import { fmtCompact, fmtWhen } from '@/lib/format'
import { weekLabel } from '@/lib/targets'
import { parseViews, viewsText } from '@/modals/TargetModal'
import type { WeeklyView } from '@/lib/agency'
import type { WeeklyEdit } from '@/data/useWeeklyViews'

/**
 * One channel, one week — the number, the followers when the sheet tracks
 * them, and the SS column's screenshot. Read-only for anybody who may not
 * enter it; the history of every change underneath, for whoever asks "who
 * changed this".
 */
export function WeekEntryModal({
  channelName, weekStart, row, canEdit, canRemove, whoName,
  onClose, onSave, onProof, proofUrl, history, onRemove,
}: {
  channelName: string
  weekStart: string
  row: WeeklyView | null
  canEdit: boolean
  canRemove: boolean
  whoName: (profileId: string | null) => string | null
  onClose: () => void
  onSave: (views: number, followers: number | null) => Promise<string | null>
  onProof: (file: File) => Promise<string | null>
  proofUrl: (path: string) => Promise<string | null>
  history: (id: string) => Promise<WeeklyEdit[]>
  onRemove: () => Promise<string | null>
}) {
  const [views, setViews] = useState(row ? viewsText(row.views) : '')
  const [followers, setFollowers] = useState(row?.followers != null ? String(row.followers) : '')
  const [busy, setBusy] = useState<'save' | 'proof' | 'remove' | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [edits, setEdits] = useState<WeeklyEdit[] | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const rowId = row?.id ?? null

  useEffect(() => {
    let alive = true
    if (rowId) void history(rowId).then((h) => { if (alive) setEdits(h) })
    return () => { alive = false }
    // The history is asked once per open week, not once per render of the
    // caller's function.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowId])

  const n = parseViews(views)
  const f = followers.trim() ? parseViews(followers) : null

  const save = async () => {
    if (n == null) return
    setBusy('save'); setErr(null)
    const message = await onSave(n, f)
    setBusy(null)
    if (message) { setErr(message); return }
    onClose()
  }

  const attach = async (file: File | undefined) => {
    if (!file) return
    setBusy('proof'); setErr(null)
    const message = await onProof(file)
    setBusy(null)
    if (message) setErr(message)
  }

  const openProof = async () => {
    if (!row?.proofPath) return
    const url = await proofUrl(row.proofPath)
    if (url) window.open(url, '_blank', 'noopener')
    else setErr('Screenshots cannot be opened in demo mode.')
  }

  const who = row ? whoName(row.updatedBy ?? row.enteredBy) : null
  const changed = row && (row.views !== n || (row.followers ?? null) !== f)

  return (
    <Modal
      title={channelName}
      sub={weekLabel(weekStart)}
      onClose={onClose}
      foot={canEdit ? (
        <>
          {canRemove && row && (
            <button className="btn btn--sm btn--danger" style={{ marginRight: 'auto' }} disabled={!!busy}
                    onClick={() => { setBusy('remove'); void onRemove().then((m) => { setBusy(null); if (m) setErr(m); else onClose() }) }}>
              {busy === 'remove' ? 'Removing…' : 'Remove week'}
            </button>
          )}
          <button className="btn btn--sm" onClick={onClose}>Cancel</button>
          <button className="btn btn--sm btn--primary" disabled={n == null || (!!row && !changed) || !!busy} onClick={() => void save()}>
            {busy === 'save' ? 'Saving…' : 'Save'}
          </button>
        </>
      ) : <button className="btn btn--sm" onClick={onClose}>Close</button>}
    >
      {err && <div className="auth-err">{err}</div>}
      {canEdit ? (
        <div className="field-grid">
          <div className="field">
            <label htmlFor="weViews">Views</label>
            <input className="input" id="weViews" autoFocus inputMode="numeric" value={views} placeholder="e.g. 70971 or 1.2M"
                   onChange={(e) => setViews(e.target.value)}
                   onKeyDown={(e) => { if (e.key === 'Enter' && n != null) void save() }} />
            {n != null && views.trim() !== String(n) && <p className="field-hint">{n.toLocaleString('en-IN')} views</p>}
          </div>
          <div className="field">
            <label htmlFor="weFollowers">Followers / subs <span className="cell-mute">(optional)</span></label>
            <input className="input" id="weFollowers" inputMode="numeric" value={followers} onChange={(e) => setFollowers(e.target.value)} />
          </div>
        </div>
      ) : (
        <div className="hr-fields">
          <div className="hr-fld"><div className="l">Views</div><div className="v">{row ? row.views.toLocaleString('en-IN') : 'Not entered'}</div></div>
          <div className="hr-fld"><div className="l">Followers / subs</div><div className="v">{row?.followers != null ? row.followers.toLocaleString('en-IN') : '—'}</div></div>
        </div>
      )}

      <div className="we-proof">
        <span className="we-proof-l">Screenshot</span>
        {row?.proofPath ? (
          <button className="link-btn" onClick={() => void openProof()}>Open ↗</button>
        ) : <span className="cell-mute">None yet</span>}
        {canEdit && (
          <>
            <button className="btn btn--sm" style={{ marginLeft: 'auto' }} disabled={!row || !!busy}
                    title={row ? undefined : 'Save the number first'} onClick={() => fileRef.current?.click()}>
              {busy === 'proof' ? 'Uploading…' : row?.proofPath ? 'Replace' : 'Attach'}
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden
                   onChange={(e) => { void attach(e.target.files?.[0]); e.target.value = '' }} />
          </>
        )}
      </div>

      {row && (
        <p className="field-hint">
          {row.updatedAt ? 'Changed' : 'Entered'} {fmtWhen(new Date(row.updatedAt ?? row.enteredAt).getTime())}{who ? ` by ${who}` : ''}
        </p>
      )}
      {edits && edits.length > 0 && (
        <div className="we-history">
          {edits.map((e) => (
            <div key={e.id} className="we-hist-row">
              <span>{fmtWhen(new Date(e.editedAt).getTime())}</span>
              <span>{e.action === 'delete' ? `removed ${fmtCompact(e.before.views)}` : `${fmtCompact(e.before.views)} → ${fmtCompact(e.after?.views ?? 0)}`}</span>
              <span className="cell-mute">{whoName(e.editedBy) ?? ''}</span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
