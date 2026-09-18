import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from '@/components/Modal'
import { QrScanner } from '@/components/QrScanner'
import { isDemo } from '@/data/demo'
import type { Attendance } from '@/data/useAttendance'
import { askBoth, howToAllow } from '@/lib/permissions'
import {
  statusChip, fmtDuration, fmtShift, fmtTime, getFix, officeToday,
  type AttendanceRow,
} from '@/lib/attendance'

/** Per browser: this phone has been through the one-time explanation. */
const SETUP_KEY = 'metrol-crm-perm-setup'

/**
 * The one control an employee touches every day, twice.
 *
 * It is a STRIP, not a card. It used to be a narrow column against a blank
 * right half of the screen, with three paragraphs of explanation under it that
 * the same person read every single morning for the rest of their employment.
 * Nobody needs the rules restated daily — they need the date, the clock, their
 * two stamps and a button.
 *
 * So the prose moved into two places instead: a one-time popup the first time
 * somebody opens Attendance (which is also where both browser permissions are
 * asked for, once, together), and an ⓘ button for anybody who wants to read it
 * again. What stays on screen every day is only what changes every day.
 *
 * Everything it decides is cosmetic. The database re-checks the distance, the
 * time and whether today is already closed.
 */
export function PunchCard({
  att, myEmployeeId, shiftStart, myOfficeId, toast,
}: {
  att: Attendance
  myEmployeeId: string | null
  shiftStart: string | null
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
  /** The one-time explanation, and the same text on demand afterwards. */
  const [intro, setIntro] = useState(false)
  const [info, setInfo] = useState(false)
  const [permBusy, setPermBusy] = useState(false)
  /** 'locating' vs 'saving' — the honest two halves of a punch. The first was
   *  the whole wait and the button used to just say "Checking…" through it. */
  const [phase, setPhase] = useState<'locating' | 'saving' | null>(null)
  /** The green line that says it landed. The toast is easy to miss on a phone
   *  held at arm's length at the office door. */
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [permNote, setPermNote] = useState<string | null>(null)

  // First visit on this browser: explain once, ask for both permissions once,
  // and never take up room on the screen again.
  useEffect(() => {
    if (isDemo()) return
    try { if (localStorage.getItem(SETUP_KEY) !== '1') setIntro(true) } catch { /* private mode */ }
  }, [])

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
  const dayOffice = att.offices.find((o) => o.id === row?.officeId) ?? null
  const noOffice = att.offices.filter((o) => o.isActive).length === 0
  const anyBranch = att.settings?.allowAnyBranch !== false
  const methods = att.settings?.punchMethods ?? 'both'
  const showButton = methods !== 'qr'
  const showScan = methods !== 'button'
  const required = att.settings?.requiredMinutes ?? 540
  const shortBy = Math.max(0, required - elapsed)

  const pendingFix = useRef<{ at: number; p: Promise<{ lat: number; lng: number; accuracy: number }> } | null>(null)

  /** A fix is asked for the moment this screen opens, not when the button is
   *  pressed. Getting a high-accuracy position is SECONDS of work for the
   *  phone — it was the entire reason punching felt slow, and none of it was
   *  our code. By the time a thumb reaches the button the answer is in hand.
   *
   *  30 seconds of maximumAge lets the browser hand back the fix it just took
   *  instead of powering the GPS up again; 90 seconds is as old as one may be
   *  when it is actually spent, because somebody may have walked. */
  function warm() {
    if (isDemo()) return
    const p = getFix(15000, 30000)
    p.catch(() => {})
    pendingFix.current = { at: Date.now(), p }
  }
  async function takeFix() {
    const w = pendingFix.current
    if (w && Date.now() - w.at < 90_000) {
      try { return await w.p } catch { /* fall through to a fresh one */ }
    }
    return getFix(15000, 30000)
  }
  useEffect(() => { warm() }, [])

  /* THE CAMERA IS NOT PRE-WARMED, and that is deliberate — it was, and it was
     wrong. A stream held open to make the next scan instant also holds the
     phone's camera ON: a green recording dot in the iPhone status bar, a lit
     camera light on a laptop, for as long as somebody had the Attendance
     screen open and long after any scanning. Adarsh hit it the moment he
     tested on a real phone ("it is opening the camera... something is bug is
     there"), and `permissions.ts` had already argued the same point in
     writing: a camera light on while nobody is scanning "is the kind of thing
     staff notice and distrust."

     The speed it bought back barely existed in real use. A warm stream only
     helps a SECOND scan minutes after the first — but the real day is a scan
     at 9am and a scan at 6pm, nine hours and a page reload apart, and a
     scanner that fails to read simply keeps looking rather than reopening.
     What the pre-warm actually did on an ordinary day was keep the camera lit
     for nothing. The camera now opens when somebody taps Scan code, and
     closes when that window does — one second of "Opening the camera…", at
     the one moment a person is expecting their camera to come on. */

  /** Both browser permissions, in the one moment the person chose. */
  async function allowBoth() {
    setPermBusy(true)
    setPermNote(null)
    try {
      const r = await askBoth()
      const denied = [r.camera === 'denied' ? 'camera' : null, r.location === 'denied' ? 'location' : null].filter(Boolean)
      if (denied.length) {
        // The only case with anything left to do — so the popup stays, because
        // the instructions for fixing it are the whole reason to keep reading.
        setPermNote(`The ${denied.join(' and ')} is still blocked. ` + howToAllow())
        return
      }
      /* Granted — so GET OUT OF THE WAY. Leaving this open after a successful
         Allow is exactly what made the button look broken: the note under the
         text changed to "Done", the popup itself did not move, and pressing
         the button again just re-ran the same already-granted request to no
         visible effect. Both popups carry this button, so both close. */
      try { localStorage.setItem(SETUP_KEY, '1') } catch { /* private mode */ }
      setIntro(false)
      setInfo(false)
      toast('Camera and location allowed. You are all set.')
    } finally {
      setPermBusy(false)
    }
  }

  function dismissIntro() {
    setIntro(false)
    try { localStorage.setItem(SETUP_KEY, '1') } catch { /* private mode */ }
  }

  function openScanner() {
    setProblem(null)
    setOkMsg(null)
    warm()
    setScanning(true)
  }

  async function scanned(code: string) {
    setScanning(false)
    setProblem(null)
    setOkMsg(null)
    setPhase('locating')
    setBusy(row?.punchInAt && !row?.punchOutAt ? 'out' : 'in')
    try {
      const fix = isDemo()
        ? { lat: myOffice?.lat ?? 0, lng: myOffice?.lng ?? 0, accuracy: 14 }
        : await takeFix()
      setPhase('saving')
      const res = await att.punchByQr(code, fix, myEmployeeId ?? undefined)
      if (res.ok) { toast(res.message); setOkMsg(res.message); warm() }
      else setProblem(res.message)
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Could not read your location.')
    } finally {
      setBusy(null)
    }
  }

  async function go(kind: 'in' | 'out') {
    setProblem(null)
    setOkMsg(null)
    setPhase('locating')
    setBusy(kind)
    try {
      const fix = isDemo()
        ? { lat: myOffice?.lat ?? att.offices[0]?.lat ?? 0, lng: myOffice?.lng ?? att.offices[0]?.lng ?? 0, accuracy: 14 }
        : await takeFix()
      setPhase('saving')
      const res = kind === 'in' ? await att.punchIn(fix, myEmployeeId ?? undefined) : await att.punchOut(fix, myEmployeeId ?? undefined)
      if (res.ok) { toast(res.message); setOkMsg(res.message); warm() }
      else setProblem(res.message)
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Could not read your location.')
    } finally {
      setBusy(null)
      setPhase(null)
      setConfirming(false)
    }
  }

  /** The rules, written once. Shown on the first visit and behind ⓘ after —
   *  never parked on the screen somebody uses twice a day. */
  const rules = (
    <>
      <p className="imp-note" style={{ marginTop: 0 }}>
        Press <strong>Punch in</strong> when you reach the office and <strong>Punch out</strong> when you leave.
        You can also scan the QR poster at the door instead — either way records the same day.
      </p>
      <p className="imp-note">
        {myOffice
          ? <>You have to be within <strong>{myOffice.radiusMeters} m</strong> of {myOffice.name}. Your location is checked whichever way you punch, so a photo of the poster will not work from home.</>
          : anyBranch
            ? <>HR has not put you at a branch yet. You can still punch at any office and the day records which one.</>
            : <>HR has not put you at a branch yet, and this company only accepts a punch at your own branch. Ask HR to assign you first.</>}
      </p>
      <p className="imp-note">
        Punching needs your <strong>location</strong>. Scanning the poster needs the <strong>camera</strong> too.
        They are two separate browser permissions — allow them once here and you will not be asked again.
      </p>
      {permNote && <p className="punch-note">{permNote}</p>}
    </>
  )

  return (
    <>
      <div className="punch-bar">
        {/* Date and branch on ONE line — "it is not necessarily [changing]
            each and everything in daily basis", Adarsh's own reasoning for
            why the branch/shift didn't need a row to itself. The status chip
            sits at the other end of this same line (top-right on a phone,
            since this is the first row once the card stacks): Adarsh's "top
            right corner" for it, moved up from the button row below, where
            it read as one more action rather than the day's status. */}
        <div className="pb-when">
          <div className="punch-date">
            {new Date(today + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}
            <span className="punch-office">
              {' · '}{dayOffice?.name ?? myOffice?.name ?? 'No branch assigned'}
              {shiftStart && <> · shift {fmtShift(shiftStart)}</>}
            </span>
          </div>
          {row && <span className={'chip pb-status ' + statusChip(row.status).cls}>{statusChip(row.status).label}</span>}
        </div>

        <div className="pb-clock">
          <div className="punch-big">
            {open ? fmtDuration(elapsed, '0h 00m') : row?.punchOutAt ? fmtDuration(row.workedMinutes, '0h 00m') : '—'}
          </div>
          <div className="punch-cap">
            {open
              ? shortBy > 0 ? `${fmtDuration(shortBy)} left of ${fmtDuration(required)}` : `Full ${fmtDuration(required)} done`
              : row?.punchOutAt ? 'Recorded for today' : 'Not punched in yet'}
          </div>
        </div>

        <div className="pb-times">
          <div><span>In</span><strong>{fmtTime(row?.punchInAt, tz)}</strong></div>
          <div><span>Out</span><strong>{fmtTime(row?.punchOutAt, tz)}</strong></div>
          {!!row?.lateMinutes && <div><span>Late</span><strong>{row.lateMinutes}m</strong></div>}
        </div>

        <div className="pb-actions">
          {/* The status chip lives on the pb-when line now, not here — same
             value, shown once. */}
          {noOffice ? (
            <span className="punch-note" style={{ margin: 0 }}>No office set up yet.</span>
          ) : !row?.punchInAt ? (
            <>
              {showButton && (
                <button className="btn btn--primary btn--lg" disabled={busy !== null} onClick={() => void go('in')}>
                  {busy === 'in' ? (phase === 'saving' ? 'Recording…' : 'Finding you…') : 'Punch in'}
                </button>
              )}
              {showScan && (
                <button className={'btn btn--lg' + (showButton ? '' : ' btn--primary')} disabled={busy !== null} onClick={openScanner}>
                  {showButton ? 'Scan code' : 'Scan to punch in'}
                </button>
              )}
            </>
          ) : !row.punchOutAt ? (
            <>
              {showButton && (
                // A full day (or longer) punches out directly — the brief's
                // own words were "after 9 hours, accept silently". Short of
                // it, the modal still asks, because THAT is the case somebody
                // benefits from a second thought on. The QR path (below) has
                // never asked either way, by Phase 6b's own design — a poster
                // scan is meant to be one tap, not a form.
                <button className="btn btn--lg" disabled={busy !== null}
                        onClick={() => (shortBy > 0 ? setConfirming(true) : void go('out'))}>
                  {busy === 'out' ? (phase === 'saving' ? 'Recording…' : 'Finding you…') : 'Punch out'}
                </button>
              )}
              {showScan && (
                <button className={'btn btn--lg' + (showButton ? '' : ' btn--primary')} disabled={busy !== null} onClick={openScanner}>
                  {showButton ? 'Scan code' : 'Scan to punch out'}
                </button>
              )}
            </>
          ) : (
            <span className="punch-note" style={{ margin: 0 }}>Today is closed.</span>
          )}
          <button className="pb-info" onClick={() => setInfo(true)} aria-label="How attendance works" data-tip="How this works">i</button>
        </div>
      </div>

      {okMsg && <p className="pb-ok">{okMsg}</p>}
      {problem && <p className="punch-err">{problem}</p>}

      {scanning && (
        <QrScanner onClose={() => setScanning(false)} onCode={(c) => void scanned(c)} />
      )}

      {/* First visit only. The explanation AND both permissions in one moment,
          so neither ever interrupts an ordinary morning again. */}
      {intro && (
        <Modal title="Before you start" sub="One minute, once — then this screen stays out of your way"
               onClose={dismissIntro}
               foot={<>
                 <button className="btn" onClick={dismissIntro}>Skip</button>
                 <button className="btn btn--primary" disabled={permBusy} onClick={() => void allowBoth()}>
                   {permBusy ? 'Asking…' : 'Allow camera & location'}
                 </button>
               </>}>
          {rules}
        </Modal>
      )}

      {info && (
        <Modal title="How attendance works" onClose={() => setInfo(false)}
               foot={<>
                 <button className="btn" disabled={permBusy} onClick={() => void allowBoth()}>
                   {permBusy ? 'Asking…' : 'Allow camera & location'}
                 </button>
                 <button className="btn btn--primary" onClick={() => setInfo(false)}>Got it</button>
               </>}>
          {rules}
        </Modal>
      )}

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
              {busy === 'out' ? (phase === 'saving' ? 'Recording…' : 'Finding you…') : 'Yes, punch out'}
            </button>
          </>}
        >
          <p className="imp-note">
            In at {fmtTime(row?.punchInAt, tz)} · {fmtDuration(elapsed, '0h 00m')} so far.
            {' '}Once it is recorded only HR can change it.
          </p>
        </Modal>
      )}
    </>
  )
}
