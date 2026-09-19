import { useMemo, useState } from 'react'
import { Modal } from '@/components/Modal'
import { LEAVE_TYPE, REQUESTABLE_LEAVE_TYPES, fmtDate, todayISO, workingDaysBetween } from '@/lib/hr'
import type { LeaveRequest, LeaveType } from '@/lib/hr'
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
 *  two ever disagree: the record is still right and only a sentence was wrong.
 *
 *  Round 6 (0026): the type picker only ever offers three — casual (the
 *  default), compulsory/week-off and period — and the database is the one
 *  that actually enforces the balance/gender/once-a-month rules below (this
 *  modal only disables what it already knows will be refused, so nobody
 *  fills in a whole request to be told no at the very end). */
export function LeaveRequestModal({
  employeeId, weekOffs, holidays, allowPeriod = false, gender = null,
  compOffBalance = null, existingLeave = [], onClose, onSave,
}: {
  employeeId: string
  /** 0 = Sunday, from attendance_settings. Sunday is Metrol's only week off. */
  weekOffs: number[]
  holidays: Holiday[]
  /** Period leave (T&C 3.7) is a rule HR switches on, off by default — so the
   *  option is not offered at all until they have. Offering a type the engine
   *  will not pay is how somebody applies for something that silently becomes
   *  ordinary leave. */
  allowPeriod?: boolean
  /** This person's `employees.gender` (Round 6). Period is only ever offered
   *  when this reads 'Female' — the database refuses anybody else's request
   *  either way, but there is no reason to show an option that can only
   *  fail. */
  gender?: string | null
  /** comp_off_balance() for this person, or null while it has not loaded yet
   *  (the option stays visible but shows no count, and the database still
   *  has the final say on whether a request fits). */
  compOffBalance?: number | null
  /** This person's OWN requests, so a second Period request this calendar
   *  month can be caught here instead of round-tripping to the database to
   *  learn the same thing. */
  existingLeave?: LeaveRequest[]
  onClose: () => void
  onSave: (draft: LeaveDraft) => Promise<string | null>
}) {
  const [startDate, setStartDate] = useState(todayISO())
  const [endDate, setEndDate] = useState(todayISO())
  const [leaveType, setLeaveType] = useState<LeaveType>('casual')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const periodAlreadyThisMonth = useMemo(() => existingLeave.some((r) =>
    r.leaveType === 'period' && r.status !== 'rejected' && r.status !== 'cancelled'
    && r.startDate.slice(0, 7) === startDate.slice(0, 7)), [existingLeave, startDate])

  const backwards = endDate < startDate

  const days = useMemo(
    () => workingDaysBetween(startDate, endDate, weekOffs, holidays.map((h) => h.date)),
    [startDate, endDate, weekOffs, holidays],
  )

  // All Sundays, or all holidays, or both. Nothing to grant, so nothing to ask
  // for — refused here rather than filed as a request worth zero days that HR
  // then has to wonder about.
  const emptyRange = !backwards && days.total === 0
  const overCompOff = leaveType === 'compulsory' && compOffBalance != null && days.total > compOffBalance
  const blockedPeriod = leaveType === 'period' && periodAlreadyThisMonth
  const invalid = backwards || emptyRange || overCompOff || blockedPeriod

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
            {REQUESTABLE_LEAVE_TYPES
              .filter((t) => t !== 'period' || (allowPeriod && gender === 'Female'))
              .map((t) => (
                <button key={t} type="button" className={leaveType === t ? 'is-on' : ''}
                        aria-pressed={leaveType === t} onClick={() => setLeaveType(t)}>
                  {LEAVE_TYPE[t].label}
                </button>
              ))}
          </div>
          <p className="field-hint">
            {leaveType === 'compulsory'
              ? (compOffBalance == null
                  ? 'Earned by working a week-off day, spent day for day — never out of your paid leave.'
                  : `${count(compOffBalance, 'day')} earned and not yet used.`)
              : leaveType === 'period'
                ? 'Fully paid, and does not come out of your paid days.'
                : 'Comes out of your paid days for this month.'}
          </p>
          {overCompOff && (
            <p className="auth-err">
              Only {count(compOffBalance ?? 0, 'compulsory/week-off day')} earned — asking for {count(days.total, 'day')}.
            </p>
          )}
          {blockedPeriod && (
            <p className="auth-err">A period leave request already exists for this month.</p>
          )}
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
