import { useMemo, useState } from 'react'
import { Modal } from '@/components/Modal'
import { LEAVE_TYPE, fmtDate, todayISO, workingDaysBetween } from '@/lib/hr'
import type { LeaveType } from '@/lib/hr'
import type { Holiday } from '@/lib/attendance'
import { count, plural } from '@/lib/format'
import type { LeaveDraft } from '@/data/useLeaveRequests'

/** A person asking for their own leave — or HR logging one on somebody's
 *  behalf. There is no status field here: every request this modal creates
 *  starts pending, the same way RLS (0009) insists on it, because nobody
 *  approves their own leave on the way in.
 *
 *  The day count shown is a PREVIEW, worked out here from the same rule 0016's
 *  trigger uses. The number that gets stored is always the database's — the
 *  hook re-reads the saved row rather than trusting this. Worth knowing if the
 *  two ever disagree: the record is still right and only a sentence was wrong. */
export function LeaveRequestModal({
  employeeId, weekOffs, holidays, onClose, onSave,
}: {
  employeeId: string
  /** 0 = Sunday, from attendance_settings. Sunday is Metrol's only week off. */
  weekOffs: number[]
  holidays: Holiday[]
  onClose: () => void
  onSave: (draft: LeaveDraft) => Promise<string | null>
}) {
  const [startDate, setStartDate] = useState(todayISO())
  const [endDate, setEndDate] = useState(todayISO())
  const [leaveType, setLeaveType] = useState<LeaveType>('casual')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const backwards = endDate < startDate

  const days = useMemo(
    () => workingDaysBetween(startDate, endDate, weekOffs, holidays.map((h) => h.date)),
    [startDate, endDate, weekOffs, holidays],
  )

  // All Sundays, or all holidays, or both. Nothing to grant, so nothing to ask
  // for — refused here rather than filed as a request worth zero days that HR
  // then has to wonder about.
  const emptyRange = !backwards && days.total === 0
  const invalid = backwards || emptyRange

  // How many DAYS were dropped, not how many phrases describe them: one phrase
  // reading "2 Sundays" still takes a plural verb. Getting this from
  // parts.length is how "2 Sundays is not counted" happened.
  const skippedDays = days.weekOffDays + days.holidayDays

  const skipped = useMemo(() => {
    const parts: string[] = []
    if (days.weekOffDays) parts.push(count(days.weekOffDays, 'Sunday'))
    const names = days.holidayHits
      .map((d) => holidays.find((h) => h.date === d)?.name)
      .filter((n): n is string => Boolean(n))
    if (names.length === 1) parts.push(names[0]!)
    else if (names.length === 2) parts.push(names[0] + ' and ' + names[1])
    else if (names.length > 2) parts.push(names[0] + ' and ' + count(names.length - 1, 'other holiday'))
    return parts
  }, [days, holidays])

  const save = async () => {
    setBusy(true)
    setErr(null)
    const message = await onSave({ employeeId, startDate, endDate, leaveType, reason })
    setBusy(false)
    if (message) { setErr(message); return }
    onClose()
  }

  return (
    <Modal
      title="Request leave"
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
          <label>Type</label>
          <div className="seg seg--form" role="group" aria-label="Leave type">
            {(Object.keys(LEAVE_TYPE) as LeaveType[]).map((t) => (
              <button key={t} type="button" className={leaveType === t ? 'is-on' : ''}
                      aria-pressed={leaveType === t} onClick={() => setLeaveType(t)}>
                {LEAVE_TYPE[t].label}
              </button>
            ))}
          </div>
          <p className="field-hint">
            {leaveType === 'unpaid'
              ? 'Recorded as an absence, but not taken out of your paid days.'
              : 'Comes out of your paid days for this year.'}
          </p>
        </div>
        <div className="field">
          <label htmlFor="lvStart">From</label>
          <input className="input" id="lvStart" type="date" value={startDate}
                 onChange={(e) => { setStartDate(e.target.value); if (e.target.value > endDate) setEndDate(e.target.value) }} />
        </div>
        <div className="field">
          <label htmlFor="lvEnd">To</label>
          <input className="input" id="lvEnd" type="date" value={endDate} min={startDate}
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
        {!invalid && skipped.length > 0 && (
          <p className="punch-note">
            {count(days.total, 'working day')} — {skipped.join(' and ')} {plural(skippedDays, 'is', 'are')} not counted.
          </p>
        )}
        <div className="field">
          <label htmlFor="lvReason">Reason</label>
          <textarea className="input" id="lvReason" rows={3} value={reason}
                    onChange={(e) => setReason(e.target.value)} placeholder="Optional" />
        </div>
      </div>
    </Modal>
  )
}
