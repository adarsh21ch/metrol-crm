import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { ATT_STATUS, type AttendanceRow, type AttendanceStatus } from '@/lib/attendance'
import type { AttendanceDraft } from '@/data/useAttendance'

/** Clock-face values in the office's timezone, both ways. A punch is an
 *  instant; HR thinks in "09:34". These two functions are the whole
 *  conversion, kept together so they cannot drift apart. */
function toLocalTimeInput(iso: string | null, tz: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
  } catch {
    return d.toTimeString().slice(0, 5)
  }
}

/** "2026-09-12" + "09:34" + Asia/Kolkata → the instant that clock face names.
 *  The offset is read from the zone rather than hardcoded to +05:30, so this
 *  keeps working if Metrol ever has a second office somewhere else. */
function fromLocalTimeInput(date: string, hhmm: string, tz: string): string | null {
  if (!hhmm) return null
  const guess = new Date(`${date}T${hhmm}:00Z`)
  if (Number.isNaN(guess.getTime())) return null
  const asLocal = new Date(guess.toLocaleString('en-US', { timeZone: tz }))
  const asUtc = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }))
  const offset = asLocal.getTime() - asUtc.getTime()
  return new Date(guess.getTime() - offset).toISOString()
}

/**
 * HR correcting a day. Everything here is logged to attendance_edits with the
 * before and after (0013) — this is the power that makes an attendance record
 * worth doubting, so it leaves a trail rather than a quiet new truth.
 *
 * A reason is required, not optional. "Why is this day different" is the whole
 * value of the trail, and a blank one makes the log a list of timestamps.
 */
export function AttendanceEditModal({
  row, employeeName, tz, onClose, onSave,
}: {
  row: AttendanceRow
  employeeName: string
  tz: string
  onClose: () => void
  onSave: (d: AttendanceDraft) => Promise<string | null>
}) {
  const [inAt, setInAt] = useState(toLocalTimeInput(row.punchInAt, tz))
  const [outAt, setOutAt] = useState(toLocalTimeInput(row.punchOutAt, tz))
  const [shift, setShift] = useState((row.shiftStart ?? '').slice(0, 5))
  const [status, setStatus] = useState<AttendanceStatus | ''>('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    if (!reason.trim()) return setErr('Say why this day is being changed. It goes on the record next to the change.')
    if (inAt && outAt && outAt < inAt) return setErr('Punch out cannot be before punch in.')
    setBusy(true); setErr(null)
    const message = await onSave({
      punchInAt: fromLocalTimeInput(row.workDate, inAt, tz),
      punchOutAt: fromLocalTimeInput(row.workDate, outAt, tz),
      shiftStart: shift ? shift + ':00' : null,
      status: status || undefined,
      editReason: reason,
    })
    setBusy(false)
    if (message) setErr(message)
    else onClose()
  }

  return (
    <Modal
      title="Correct this day"
      sub={`${employeeName} · ${row.workDate}`}
      onClose={onClose}
      foot={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn--primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save correction'}</button>
      </>}
    >
      <div className="hr-fields">
        <div className="field">
          <label>Punch in</label>
          <input className="input" type="time" value={inAt} onChange={(e) => setInAt(e.target.value)} />
        </div>
        <div className="field">
          <label>Punch out</label>
          <input className="input" type="time" value={outAt} onChange={(e) => setOutAt(e.target.value)} />
        </div>
        <div className="field">
          <label>Shift start</label>
          <input className="input" type="time" value={shift} onChange={(e) => setShift(e.target.value)} />
        </div>
        <div className="field">
          <label>Status</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as AttendanceStatus | '')}>
            <option value="">Work it out from the times</option>
            {(['present', 'late', 'half_day', 'absent', 'on_leave', 'holiday', 'week_off'] as AttendanceStatus[])
              .map((s) => <option key={s} value={s}>{ATT_STATUS[s].label}</option>)}
          </select>
        </div>
      </div>

      <div className="field">
        <label>Reason for the change</label>
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)}
               placeholder="Punched out at lunch by mistake" />
      </div>

      <p className="punch-note">
        Leave Status on "work it out from the times" and the day is graded by the same rule as everybody
        else's — full hours and on time is present, full hours but late is late, short is a half day.
        Pick a status only to say something the clock cannot, like a day somebody was on approved leave.
      </p>
      {err && <p className="auth-err">{err}</p>}
    </Modal>
  )
}
