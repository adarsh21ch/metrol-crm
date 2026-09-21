import { useMemo, useState } from 'react'
import { Modal } from '@/components/Modal'
import { fmtDate, todayISO, workingDaysBetween } from '@/lib/hr'
import type { Holiday } from '@/lib/attendance'
import { count, plural } from '@/lib/format'
import type { WfhDraft } from '@/data/useWfhRequests'

/** A stretch of days worked from home instead of the office — filed the same
 *  way leave is, starts pending, HR decides. Reason is required here (unlike
 *  leave's optional one) — Adarsh's own words, 2026-09-21: "their reason why
 *  they are applying". Approving it never touches the paid-leave balance,
 *  same as a visit entry (0027). */
export function WfhRequestModal({
  employeeId, weekOffs, holidays, onClose, onSave,
}: {
  employeeId: string
  weekOffs: number[]
  holidays: Holiday[]
  onClose: () => void
  onSave: (draft: WfhDraft) => Promise<string | null>
}) {
  const [startDate, setStartDate] = useState(todayISO())
  const [endDate, setEndDate] = useState(todayISO())
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const backwards = endDate < startDate
  const days = useMemo(
    () => workingDaysBetween(startDate, endDate, weekOffs, holidays.map((h) => h.date)),
    [startDate, endDate, weekOffs, holidays],
  )
  const emptyRange = !backwards && days.total === 0
  const noReason = !reason.trim()
  const invalid = backwards || emptyRange || noReason
  const skippedDays = days.weekOffDays + days.holidayDays

  const save = async () => {
    setBusy(true)
    setErr(null)
    const message = await onSave({ employeeId, startDate, endDate, reason })
    setBusy(false)
    if (message) { setErr(message); return }
    onClose()
  }

  return (
    <Modal
      title="Apply for work from home"
      sub={invalid ? undefined : count(days.total, 'working day')}
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
          <label htmlFor="wfhStart">From</label>
          <input className="input" id="wfhStart" type="date" value={startDate}
                 onChange={(e) => { setStartDate(e.target.value); if (e.target.value > endDate) setEndDate(e.target.value) }} />
        </div>
        <div className="field">
          <label htmlFor="wfhEnd">To</label>
          <input className="input" id="wfhEnd" type="date" value={endDate} min={startDate}
                 onChange={(e) => setEndDate(e.target.value)} />
        </div>
        {backwards && <p className="auth-err">The end date cannot be before the start date.</p>}
        {emptyRange && (
          <p className="auth-err">
            {startDate === endDate
              ? `${fmtDate(startDate)} is not a working day, so there is nothing to request.`
              : 'Every day in that range is a Sunday or a holiday, so there is nothing to request.'}
          </p>
        )}
        {!invalid && skippedDays > 0 && (
          <p className="punch-note">
            {count(days.total, 'working day')} — {count(skippedDays, 'day')} {plural(skippedDays, 'is', 'are')} not counted.
          </p>
        )}
        <div className="field">
          <label htmlFor="wfhReason">Reason</label>
          <textarea className="input" id="wfhReason" rows={3} value={reason}
                    onChange={(e) => setReason(e.target.value)} placeholder="Why you need to work from home" />
        </div>
      </div>
    </Modal>
  )
}
