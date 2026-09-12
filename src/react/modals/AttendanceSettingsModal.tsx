import { useState } from 'react'
import { Modal } from '@/components/Modal'
import type { AttendanceSettings } from '@/lib/attendance'
import type { SettingsDraft } from '@/data/useAttendance'

/** Where the office is, and the three numbers that decide what a day counts
 *  as. HR sets the location by standing in the office and pressing a button —
 *  typing coordinates is not a thing to ask of anybody, and a map picker is a
 *  third-party script this app deliberately does not load. */
export function AttendanceSettingsModal({
  settings, onClose, onSave,
}: {
  settings: AttendanceSettings
  onClose: () => void
  onSave: (d: SettingsDraft) => Promise<string | null>
}) {
  const [anyBranch, setAnyBranch] = useState(settings.allowAnyBranch)
  const [grace, setGrace] = useState(String(settings.graceMinutes))
  const [hours, setHours] = useState(String(settings.requiredMinutes / 60))
  const [halfDay, setHalfDay] = useState(String(settings.halfDayMinutes / 60))
  const [accuracy, setAccuracy] = useState(String(settings.maxAccuracyMeters))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    const g = Number(grace), h = Number(hours), hd = Number(halfDay), acc = Number(accuracy)
    if (!(g >= 0 && g <= 120)) return setErr('The relaxation period has to be between 0 and 120 minutes.')
    if (!(h > 0 && h <= 24)) return setErr('A shift has to be between 1 and 24 hours.')
    if (!(hd > 0 && hd < h)) return setErr('The half-day floor has to be shorter than a full day.')
    setBusy(true); setErr(null)
    const message = await onSave({
      graceMinutes: Math.round(g),
      requiredMinutes: Math.round(h * 60), halfDayMinutes: Math.round(hd * 60),
      maxAccuracyMeters: Math.round(acc), allowAnyBranch: anyBranch,
    })
    setBusy(false)
    if (message) setErr(message)
    else onClose()
  }

  return (
    <Modal
      title="Attendance settings"
      sub="What counts as a full day, everywhere. Each branch's location is set on the branch itself."
      onClose={onClose}
      foot={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn--primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save settings'}</button>
      </>}
    >
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
      {err && <p className="auth-err">{err}</p>}
    </Modal>
  )
}
