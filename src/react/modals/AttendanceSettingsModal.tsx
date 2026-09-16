import { useState } from 'react'
import { Modal } from '@/components/Modal'
import type { AttendanceSettings } from '@/lib/attendance'
import type { SettingsDraft } from '@/data/useAttendance'

/** Every number that decides what a day and a month count as — in ONE place,
 *  reachable from both the Attendance page and the Leave page, because the
 *  grace minutes on one feed the late rule on the other and Adarsh asked for
 *  the owner to see and change all of them. Each branch's location is set on
 *  the branch itself, not here. */
export function AttendanceSettingsModal({
  settings, onClose, onSave, first = 'attendance',
}: {
  settings: AttendanceSettings
  onClose: () => void
  onSave: (d: SettingsDraft) => Promise<string | null>
  /** Which group comes first — the page it was opened from. */
  first?: 'attendance' | 'leave'
}) {
  const [anyBranch, setAnyBranch] = useState(settings.allowAnyBranch)
  const [grace, setGrace] = useState(String(settings.graceMinutes))
  const [hours, setHours] = useState(String(settings.requiredMinutes / 60))
  const [halfDay, setHalfDay] = useState(String(settings.halfDayMinutes / 60))
  const [accuracy, setAccuracy] = useState(String(settings.maxAccuracyMeters))
  const [freeLates, setFreeLates] = useState(String(settings.freeLatesPerMonth))
  const [paidLeave, setPaidLeave] = useState(String(settings.paidLeavePerMonth))
  const [startMonth, setStartMonth] = useState(settings.leaveRulesStart.slice(0, 7))
  const [probation, setProbation] = useState(String(settings.probationMonths))
  const [sameDay, setSameDay] = useState(settings.sameDayLeaveUnpaid)
  const [period, setPeriod] = useState(String(settings.periodLeavePerMonth))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const installed = settings.leaveRulesInstalled

  async function save() {
    const g = Number(grace), h = Number(hours), hd = Number(halfDay), acc = Number(accuracy)
    const fl = Number(freeLates), pl = Number(paidLeave), pr = Number(probation), pe = Number(period)
    if (!(g >= 0 && g <= 120)) return setErr('The relaxation period has to be between 0 and 120 minutes.')
    if (!(h > 0 && h <= 24)) return setErr('A shift has to be between 1 and 24 hours.')
    if (!(hd > 0 && hd < h)) return setErr('The half-day floor has to be shorter than a full day.')
    if (installed) {
      if (!(Number.isInteger(fl) && fl >= 0 && fl <= 31)) return setErr('Lates allowed has to be a whole number from 0 to 31.')
      if (!(pl >= 0 && pl <= 31 && Number.isInteger(pl * 2))) return setErr('Paid leave per month has to be between 0 and 31, in half days.')
      if (!(Number.isInteger(pr) && pr >= 0 && pr <= 24)) return setErr('Probation has to be a whole number of months, 0 to 24.')
      if (!(Number.isInteger(pe) && pe >= 0 && pe <= 5)) return setErr('Period leave has to be a whole number of days, 0 to 5.')
      if (!/^\d{4}-\d{2}$/.test(startMonth)) return setErr('Pick the month leave is counted from.')
    }
    setBusy(true); setErr(null)
    const message = await onSave({
      graceMinutes: Math.round(g),
      requiredMinutes: Math.round(h * 60), halfDayMinutes: Math.round(hd * 60),
      maxAccuracyMeters: Math.round(acc), allowAnyBranch: anyBranch,
      freeLatesPerMonth: fl, paidLeavePerMonth: pl, probationMonths: pr,
      sameDayLeaveUnpaid: sameDay, periodLeavePerMonth: pe, leaveRulesStart: startMonth + '-01',
    })
    setBusy(false)
    if (message) setErr(message)
    else onClose()
  }

  const attendance = (
    <div key="att">
      <h4 className="rules-h">Attendance</h4>
      <div className="hr-fields">
        <div className="field">
          <label>Punching at another branch</label>
          <select className="input" value={anyBranch ? 'y' : 'n'} onChange={(e) => setAnyBranch(e.target.value === 'y')}>
            <option value="y">Allowed — the day records which branch</option>
            <option value="n">Only their own branch</option>
          </select>
        </div>
        <div className="field">
          <label>Relaxation period (minutes)</label>
          <input className="input" type="number" min={0} max={120} value={grace} onChange={(e) => setGrace(e.target.value)} />
        </div>
        <div className="field">
          <label>Full day (hours)</label>
          <input className="input" type="number" min={1} max={24} step={0.5} value={hours} onChange={(e) => setHours(e.target.value)} />
        </div>
        <div className="field">
          <label>Half day above (hours)</label>
          <input className="input" type="number" min={0.5} max={23} step={0.5} value={halfDay} onChange={(e) => setHalfDay(e.target.value)} />
        </div>
        <div className="field">
          <label>Reject fixes worse than (metres)</label>
          <input className="input" type="number" min={20} max={2000} value={accuracy} onChange={(e) => setAccuracy(e.target.value)} />
        </div>
      </div>
      <p className="punch-note">
        The last one is the anti-cheat setting. A phone using GPS knows where it is to within about 10–30 m;
        a laptop guessing from wifi, or an app faking a location, usually reports something much vaguer.
        Anything worse than this is refused and the person is asked to try again outside. Raising it a lot makes
        punching easier and the record weaker.
      </p>
    </div>
  )

  const leave = (
    <div key="leave">
      <h4 className="rules-h">Leave</h4>
      {!installed && (
        <p className="auth-err" style={{ marginBottom: 10 }}>
          The leave rules are not installed on the database yet (migration 0022). These are the numbers they
          will start with; they can be changed once it has run.
        </p>
      )}
      <fieldset className="rules-set" disabled={!installed}>
        <div className="hr-fields">
          <div className="field">
            <label htmlFor="rlLates">Lates allowed per month</label>
            <input className="input" id="rlLates" type="number" min={0} max={31} value={freeLates} onChange={(e) => setFreeLates(e.target.value)} />
            <p className="field-hint">Every late after this many in a month counts as a half day.</p>
          </div>
          <div className="field">
            <label htmlFor="rlPaid">Paid leave per month (days)</label>
            <input className="input" id="rlPaid" type="number" min={0} max={31} step={0.5} value={paidLeave} onChange={(e) => setPaidLeave(e.target.value)} />
            <p className="field-hint">A half day uses half of one.</p>
          </div>
          <div className="field">
            <label htmlFor="rlStart">Count leave from</label>
            <input className="input" id="rlStart" type="month" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} />
            <p className="field-hint">Nobody arrives at this month with a balance from before it.</p>
          </div>
        </div>

        {/* The T&C's own rules. Adarsh's call: HR manages them, so each is
            here, OFF until HR turns it on — nothing applies them silently. */}
        <h4 className="rules-h rules-h--sub">From the Terms &amp; Conditions — off until you turn them on</h4>
        <div className="hr-fields">
          <div className="field">
            <label htmlFor="rlProb">No paid leave for the first (months)</label>
            <input className="input" id="rlProb" type="number" min={0} max={24} value={probation} onChange={(e) => setProbation(e.target.value)} />
            <p className="field-hint">T&amp;C 3.9 says 3. 0 = off. The joining month counts as the first.</p>
          </div>
          <div className="field">
            <label htmlFor="rlSame">Leave asked for on the day itself</label>
            <select className="input" id="rlSame" value={sameDay ? 'y' : 'n'} onChange={(e) => setSameDay(e.target.value === 'y')}>
              <option value="n">Treated like any other leave</option>
              <option value="y">Unpaid, unless you mark it an emergency</option>
            </select>
            <p className="field-hint">T&amp;C 3.10. You decide each one when approving it.</p>
          </div>
          <div className="field">
            <label htmlFor="rlPeriod">Period leave (days per month)</label>
            <input className="input" id="rlPeriod" type="number" min={0} max={5} value={period} onChange={(e) => setPeriod(e.target.value)} />
            <p className="field-hint">T&amp;C 3.7 says 1. 0 = off. Logged by HR; paid, and not taken from the balance.</p>
          </div>
        </div>
      </fieldset>
    </div>
  )

  return (
    <Modal
      title="Attendance & leave rules"
      sub="What a day counts as, and how a month of them adds up. Changes apply to months not yet closed."
      onClose={onClose}
      foot={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn--primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save rules'}</button>
      </>}
    >
      {first === 'leave' ? [leave, attendance] : [attendance, leave]}
      {err && <p className="auth-err">{err}</p>}
    </Modal>
  )
}
