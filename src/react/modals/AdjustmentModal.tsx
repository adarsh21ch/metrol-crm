import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { weekLabel, weeksOf } from '@/lib/targets'
import { parseViews, viewsText } from '@/modals/TargetModal'
import type { ListItem, ViewAdjustment, ViewTarget, ViewTargetPeriod } from '@/lib/agency'
import type { AdjustmentDraft } from '@/data/useTargets'

/** The sheet's in-between rows — "suspended accounts view −46,424,811",
 *  "collabrative views −287,520" — a signed number with a reason, placed in
 *  a week so the running LEFT column moves where the sheet moved it. */
export function AdjustmentModal({
  target, periods, types, adjustment, defaultPeriodId, onClose, onSave, onRemove,
}: {
  target: ViewTarget
  periods: ViewTargetPeriod[]
  types: ListItem[]
  adjustment: ViewAdjustment | null
  defaultPeriodId: string | null
  onClose: () => void
  onSave: (d: AdjustmentDraft) => Promise<string | null>
  onRemove: () => Promise<string | null>
}) {
  const mine = periods.filter((p) => p.targetId === target.id).sort((a, b) => a.startsOn.localeCompare(b.startsOn))
  const startPeriod = adjustment?.periodId
    ?? (adjustment?.weekStart ? mine.find((p) => weeksOf(p.startsOn, p.endsOn, target.weekCountsIn).includes(adjustment.weekStart!))?.id : null)
    ?? defaultPeriodId ?? mine[0]?.id ?? null
  const [periodId, setPeriodId] = useState<string | null>(startPeriod)
  const period = mine.find((p) => p.id === periodId) ?? null
  const weeks = period ? weeksOf(period.startsOn, period.endsOn, target.weekCountsIn) : []
  const [week, setWeek] = useState<string>(adjustment?.weekStart ?? '')
  const [typeId, setTypeId] = useState(adjustment?.typeId ?? types.find((t) => t.isActive)?.id ?? '')
  const [sign, setSign] = useState<-1 | 1>(adjustment ? (adjustment.views < 0 ? -1 : 1) : -1)
  const [amount, setAmount] = useState(adjustment ? viewsText(Math.abs(adjustment.views)) : '')
  const [note, setNote] = useState(adjustment?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const n = parseViews(amount)
  const save = async () => {
    if (!n || !typeId) return
    setBusy(true); setErr(null)
    const message = await onSave({
      targetId: target.id,
      // A week places it; with no week it belongs to the period as a whole.
      periodId: week ? null : periodId,
      weekStart: week || null,
      typeId, views: sign * n, note,
    })
    setBusy(false)
    if (message) { setErr(message); return }
    onClose()
  }

  return (
    <Modal
      title={adjustment ? 'Edit adjustment' : 'Add an adjustment'}
      sub={target.label}
      onClose={onClose}
      foot={
        <>
          {adjustment && (
            <button className="btn btn--sm btn--danger" style={{ marginRight: 'auto' }} disabled={busy}
                    onClick={() => { setBusy(true); void onRemove().then((m) => { setBusy(false); if (m) setErr(m); else onClose() }) }}>
              Remove
            </button>
          )}
          <button className="btn btn--sm" onClick={onClose}>Cancel</button>
          <button className="btn btn--sm btn--primary" disabled={!n || !typeId || busy} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      {err && <div className="auth-err">{err}</div>}
      <div className="auth-form">
        <div className="field">
          <label htmlFor="adType">What it is</label>
          <select className="input" id="adType" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            {types.filter((t) => t.isActive || t.id === typeId).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="adViews">Views</label>
          <div className="td-flex">
            <div className="seg seg--form" role="group" aria-label="Take away or add">
              <button type="button" className={sign === -1 ? 'is-on' : ''} onClick={() => setSign(-1)}>Take away</button>
              <button type="button" className={sign === 1 ? 'is-on' : ''} onClick={() => setSign(1)}>Add</button>
            </div>
            <input className="input" id="adViews" inputMode="numeric" value={amount} placeholder="e.g. 46424811"
                   onChange={(e) => setAmount(e.target.value.replace(/^[-−]/, ''))} />
          </div>
        </div>
        <div className="field-grid">
          <div className="field">
            <label htmlFor="adPeriod">Period</label>
            <select className="input" id="adPeriod" value={periodId ?? ''} onChange={(e) => { setPeriodId(e.target.value || null); setWeek('') }}>
              {mine.length === 0 && <option value="">The whole target</option>}
              {mine.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="adWeek">Week</label>
            <select className="input" id="adWeek" value={week} onChange={(e) => setWeek(e.target.value)} disabled={!period}>
              <option value="">The period as a whole</option>
              {weeks.map((w) => <option key={w} value={w}>{weekLabel(w)}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="adNote">Note</label>
          <input className="input" id="adNote" value={note} placeholder="e.g. jyotidrishti views" onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
    </Modal>
  )
}
