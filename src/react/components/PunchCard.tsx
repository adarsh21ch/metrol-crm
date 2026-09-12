import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from '@/components/Modal'
import { QrScanner } from '@/components/QrScanner'
import { isDemo } from '@/data/demo'
import type { Attendance } from '@/data/useAttendance'
import {
  statusChip, fmtDuration, fmtShift, fmtTime, getFix, officeToday,
  type AttendanceRow,
} from '@/lib/attendance'

/** The one control an employee touches every day, twice. It is the whole
 *  module as far as they are concerned, so it gets the top of the screen, a
 *  target big enough for a thumb, and no vocabulary from the HR side of the
 *  app — no "geofence", no "radius", just how far away you are.
 *
 *  Everything it decides is cosmetic. The database re-checks the distance, the
 *  time and whether today is already closed, so a person who fakes the button
 *  into appearing gains nothing. */
export function PunchCard({
  att, myEmployeeId, shiftStart, myOfficeId, toast,
}: {
  att: Attendance
  myEmployeeId: string | null
  shiftStart: string | null
  /** The branch HR assigned this person to. Named on the card so somebody who
   *  has been moved finds out here rather than by being refused at the door. */
  myOfficeId: string | null
  toast: (m: string) => void
}) {
  const tz = att.settings?.timezone ?? 'Asia/Kolkata'
  const today = officeToday(tz)
  const row: AttendanceRow | null = useMemo(
    () => att.rows.find((r) => r.employeeId === myEmployeeId && r.workDate === today) ?? null,
    [att.rows, myEmployeeId, today],
  )

  const [busy, setBusy] = useState<null | 'in' | 'out'>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [, forceTick] = useState(0)

  // The "you have been in for 3h 12m" line has to keep moving, or it reads as
  // a stale number the moment somebody looks at it twice.
  const open = !!row?.punchInAt && !row?.punchOutAt
  const timer = useRef<number | null>(null)
  useEffect(() => {
    if (!open) return
    timer.current = window.setInterval(() => forceTick((n) => n + 1), 30000)
    return () => { if (timer.current) window.clearInterval(timer.current) }
  }, [open])

  const elapsed = row?.punchInAt && !row.punchOutAt
    ? Math.max(0, Math.round((Date.now() - new Date(row.punchInAt).getTime()) / 60000))
    : row?.workedMinutes ?? 0

  const myOffice = att.offices.find((o) => o.id === myOfficeId) ?? null
  // The branch this DAY happened at, which is not always the assigned one.
  const dayOffice = att.offices.find((o) => o.id === row?.officeId) ?? null
  const noOffice = att.offices.filter((o) => o.isActive).length === 0

  const required = att.settings?.requiredMinutes ?? 540
  const shortBy = Math.max(0, required - elapsed)

  /** The poster on the attendance desk. The code only names a branch — the
   *  distance is still checked — so scanning is a shortcut, not a bypass. */
  async function scanned(code: string) {
    setScanning(false)
    setProblem(null)
    setBusy(row?.punchInAt && !row?.punchOutAt ? 'out' : 'in')
    try {
      const fix = isDemo()
        ? { lat: myOffice?.lat ?? 0, lng: myOffice?.lng ?? 0, accuracy: 14 }
        : await getFix()
      const res = await att.punchByQr(code, fix, myEmployeeId ?? undefined)
      if (res.ok) toast(res.message)
      else setProblem(res.message)
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Could not read your location.')
    } finally {
      setBusy(null)
    }
  }

  async function go(kind: 'in' | 'out') {
    setProblem(null)
    setBusy(kind)
    try {
      // In demo there is no real office to stand in, so a fix is simulated at
      // the door. Every other path asks the browser for a real one.
      const fix = isDemo()
        ? { lat: myOffice?.lat ?? att.offices[0]?.lat ?? 0, lng: myOffice?.lng ?? att.offices[0]?.lng ?? 0, accuracy: 14 }
        : await getFix()
      const res = kind === 'in' ? await att.punchIn(fix, myEmployeeId ?? undefined) : await att.punchOut(fix, myEmployeeId ?? undefined)
      if (res.ok) toast(res.message)
      else setProblem(res.message)
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Could not read your location.')
    } finally {
      setBusy(null)
      setConfirming(false)
    }
  }


  return (
    <div className="punch">
      <div className="punch-top">
        <div>
          <div className="punch-date">{new Date(today + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}</div>
          <div className="punch-office">
            {dayOffice?.name ?? myOffice?.name ?? 'No branch assigned'}
            {shiftStart && <> · shift {fmtShift(shiftStart)}</>}
          </div>
        </div>
        {row && <span className={'chip ' + statusChip(row.status).cls}>{statusChip(row.status).label}</span>}
      </div>

      <div className="punch-clock">
        <div className="punch-big">{open ? fmtDuration(elapsed, '0h 00m') : row?.punchOutAt ? fmtDuration(row.workedMinutes, '0h 00m') : '—'}</div>
        <div className="punch-cap">
          {open
            ? shortBy > 0 ? `${fmtDuration(shortBy)} left of your ${fmtDuration(required)}` : `Full ${fmtDuration(required)} done`
            : row?.punchOutAt ? 'Recorded for today' : 'Not punched in yet'}
        </div>
      </div>

      <div className="punch-times">
        <div><span>In</span><strong>{fmtTime(row?.punchInAt, tz)}</strong></div>
        <div><span>Out</span><strong>{fmtTime(row?.punchOutAt, tz)}</strong></div>
        {!!row?.lateMinutes && <div><span>Late by</span><strong>{row.lateMinutes} min</strong></div>}
      </div>

      {noOffice ? (
        <p className="punch-note">HR has not added an office location yet. Punching starts once they do.</p>
      ) : !row?.punchInAt ? (
        <>
          <button className="btn btn--primary btn--block btn--lg" disabled={busy !== null} onClick={() => void go('in')}>
            {busy === 'in' ? 'Checking your location…' : 'Punch in'}
          </button>
          <button className="btn btn--block" style={{ marginTop: 8 }} disabled={busy !== null} onClick={() => setScanning(true)}>
            Scan office code
          </button>
        </>
      ) : !row.punchOutAt ? (
        <>
          <button className="btn btn--block btn--lg" disabled={busy !== null} onClick={() => setConfirming(true)}>
            {busy === 'out' ? 'Checking your location…' : 'Punch out'}
          </button>
          <button className="btn btn--block" style={{ marginTop: 8 }} disabled={busy !== null} onClick={() => setScanning(true)}>
            Scan office code
          </button>
        </>
      ) : (
        <p className="punch-note">Today is closed. If something is wrong with it, ask HR to correct it.</p>
      )}

      {problem && <p className="punch-err">{problem}</p>}

      {!noOffice && !row?.punchOutAt && (
        <p className="punch-note">
          {myOffice
            ? <>You have to be within {myOffice.radiusMeters} m of {myOffice.name} — your location is checked whichever way you punch.</>
            : <>HR has not put you at a branch yet. You can still punch at any office, and the day will record which one.</>}
        </p>
      )}

      {scanning && <QrScanner onClose={() => setScanning(false)} onCode={(c) => void scanned(c)} />}

      {/* Punching out by mistake is the failure the client called out by name.
          A confirm step costs one tap; the alternative costs an HR correction
          and a day that looks like a half day until somebody notices. */}
      {confirming && (
        <Modal
          title="Punch out now?"
          sub={shortBy > 0
            ? `You are ${fmtDuration(shortBy)} short of a full ${fmtDuration(required)}. Punching out now will not count as a full day.`
            : 'Your full day is done.'}
          onClose={() => setConfirming(false)}
          foot={<>
            <button className="btn" onClick={() => setConfirming(false)}>Not yet</button>
            <button className="btn btn--primary" disabled={busy !== null} onClick={() => void go('out')}>
              {busy === 'out' ? 'Checking…' : 'Yes, punch out'}
            </button>
          </>}
        >
          <p className="imp-note">
            In at {fmtTime(row?.punchInAt, tz)} · {fmtDuration(elapsed, '0h 00m')} so far.
            {' '}Once it is recorded only HR can change it.
          </p>
        </Modal>
      )}
    </div>
  )
}
