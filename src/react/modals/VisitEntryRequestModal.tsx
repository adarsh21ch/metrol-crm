import { useMemo, useState } from 'react'
import { Modal } from '@/components/Modal'
import { VISIT_TYPE, fmtDate, todayISO, workingDaysBetween } from '@/lib/hr'
import type { VisitPurpose, VisitType } from '@/lib/hr'
import type { Holiday } from '@/lib/attendance'
import { count, plural } from '@/lib/format'
import type { VisitEntryDraft } from '@/data/useVisitEntries'

const PLACEHOLDER: Record<string, string> = {
  shoot: 'Where is the shoot?',
  'client meeting': 'Which client are you meeting?',
  'branch visit': 'Which branch?',
}

/** A day away from the office for work — a shoot, a client meeting, a branch
 *  visit — filed the same way leave is: starts pending, HR decides. Adarsh's
 *  own words, 2026-09-21: this is "a present kind of thing", never absent,
 *  and it must never touch the paid-leave balance — which is exactly why it
 *  is not one more leave type (see 0027's own note on that). */
export function VisitEntryRequestModal({
  employeeId, purposes, weekOffs, holidays, onClose, onSave,
}: {
  employeeId: string
  /** HR's own list (0027) — inactive ones are filtered out by the caller. */
  purposes: VisitPurpose[]
  weekOffs: number[]
  holidays: Holiday[]
  onClose: () => void
  onSave: (draft: VisitEntryDraft) => Promise<string | null>
}) {
  const [purposeId, setPurposeId] = useState<string | null>(purposes[0]?.id ?? null)
  const [detail, setDetail] = useState('')
  const [visitType, setVisitType] = useState<VisitType>('full_day')
  const [date, setDate] = useState(todayISO())
  const [startDate, setStartDate] = useState(todayISO())
  const [endDate, setEndDate] = useState(todayISO())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const isCustom = visitType === 'custom'
  const from = isCustom ? startDate : date
  const to = isCustom ? endDate : date
  const backwards = isCustom && endDate < startDate

  const days = useMemo(
    () => workingDaysBetween(from, to, weekOffs, holidays.map((h) => h.date)),
    [from, to, weekOffs, holidays],
  )
  const emptyRange = !backwards && days.total === 0

  const purposeLabel = purposes.find((p) => p.id === purposeId)?.label ?? ''
  const placeholder = PLACEHOLDER[purposeLabel.toLowerCase()] ?? 'Add a detail (optional)'

  const invalid = !purposeId || backwards || emptyRange

  const save = async () => {
    if (!purposeId) return
    setBusy(true)
    setErr(null)
    const message = await onSave({
      employeeId, purposeId, detail, visitType,
      startDate: from, endDate: isCustom ? to : from,
    })
    setBusy(false)
    if (message) { setErr(message); return }
    onClose()
  }

  return (
    <Modal
      title="Apply for visit entry"
      sub={invalid ? undefined : `${VISIT_TYPE[visitType].label} · ${count(days.total, 'working day')}`}
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
          <label htmlFor="viPurpose">Purpose</label>
          <select className="input" id="viPurpose" value={purposeId ?? ''}
                  onChange={(e) => setPurposeId(e.target.value || null)}>
            {purposes.length === 0 && <option value="">No purposes set up yet</option>}
            {purposes.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="viDetail">Details</label>
          <input className="input" id="viDetail" type="text" value={detail}
                 onChange={(e) => setDetail(e.target.value)} placeholder={placeholder} />
        </div>
        <div className="field">
          <label>Duration</label>
          <div className="seg seg--form" role="group" aria-label="Duration">
            {(Object.keys(VISIT_TYPE) as VisitType[]).map((t) => (
              <button key={t} type="button" className={visitType === t ? 'is-on' : ''}
                      aria-pressed={visitType === t} onClick={() => setVisitType(t)}>
                {VISIT_TYPE[t].label}
              </button>
            ))}
          </div>
        </div>
        {isCustom ? (
          <>
            <div className="field">
              <label htmlFor="viStart">From</label>
              <input className="input" id="viStart" type="date" value={startDate}
                     onChange={(e) => { setStartDate(e.target.value); if (e.target.value > endDate) setEndDate(e.target.value) }} />
            </div>
            <div className="field">
              <label htmlFor="viEnd">To</label>
              <input className="input" id="viEnd" type="date" value={endDate} min={startDate}
                     onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </>
        ) : (
          <div className="field">
            <label htmlFor="viDate">Date</label>
            <input className="input" id="viDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        )}
        {backwards && <p className="auth-err">The end date cannot be before the start date.</p>}
        {emptyRange && (
          <p className="auth-err">
            {from === to
              ? `${fmtDate(from)} is not a working day, so there is nothing to file.`
              : 'Every day in that range is a Sunday or a holiday, so there is nothing to file.'}
          </p>
        )}
        {!invalid && visitType !== 'half_day' && days.weekOffDays + days.holidayDays > 0 && (
          <p className="punch-note">
            {count(days.total, 'working day')} — {count(days.weekOffDays + days.holidayDays, 'day')}{' '}
            {plural(days.weekOffDays + days.holidayDays, 'is', 'are')} a Sunday or holiday and not counted.
          </p>
        )}
      </div>
    </Modal>
  )
}
