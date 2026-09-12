import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { isDemo } from '@/data/demo'
import { getFix, type AttendanceSettings } from '@/lib/attendance'
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
  const [label, setLabel] = useState(settings.officeLabel)
  const [lat, setLat] = useState<number | null>(settings.officeLat)
  const [lng, setLng] = useState<number | null>(settings.officeLng)
  const [radius, setRadius] = useState(String(settings.radiusMeters))
  const [grace, setGrace] = useState(String(settings.graceMinutes))
  const [hours, setHours] = useState(String(settings.requiredMinutes / 60))
  const [halfDay, setHalfDay] = useState(String(settings.halfDayMinutes / 60))
  const [accuracy, setAccuracy] = useState(String(settings.maxAccuracyMeters))
  const [fixing, setFixing] = useState(false)
  const [fixNote, setFixNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function capture() {
    setFixing(true); setFixNote(null)
    try {
      const fix = isDemo() ? { lat: 22.719568, lng: 75.857727, accuracy: 11 } : await getFix()
      setLat(Number(fix.lat.toFixed(6)))
      setLng(Number(fix.lng.toFixed(6)))
      setFixNote(`Saved this spot, accurate to about ${Math.round(fix.accuracy)} m.`)
      // A 500 m fix as the office CENTRE is worse than useless: it moves the
      // whole fence. Say so rather than storing it quietly.
      if (fix.accuracy > 50) setFixNote(`This fix is only accurate to about ${Math.round(fix.accuracy)} m — stand outside or near a window and press it again, or the fence will sit in the wrong place.`)
    } catch (e) {
      setFixNote(e instanceof Error ? e.message : 'Could not read your location.')
    } finally {
      setFixing(false)
    }
  }

  async function save() {
    const r = Number(radius), g = Number(grace), h = Number(hours), hd = Number(halfDay), acc = Number(accuracy)
    if (!lat || !lng) return setErr('Set the office location first — stand in the office and press "Use my current location".')
    if (!(r >= 10 && r <= 5000)) return setErr('The radius has to be between 10 and 5000 metres.')
    if (!(g >= 0 && g <= 120)) return setErr('The relaxation period has to be between 0 and 120 minutes.')
    if (!(h > 0 && h <= 24)) return setErr('A shift has to be between 1 and 24 hours.')
    if (!(hd > 0 && hd < h)) return setErr('The half-day floor has to be shorter than a full day.')
    setBusy(true); setErr(null)
    const message = await onSave({
      officeLabel: label, officeLat: lat, officeLng: lng,
      radiusMeters: Math.round(r), graceMinutes: Math.round(g),
      requiredMinutes: Math.round(h * 60), halfDayMinutes: Math.round(hd * 60),
      maxAccuracyMeters: Math.round(acc),
    })
    setBusy(false)
    if (message) setErr(message)
    else onClose()
  }

  return (
    <Modal
      title="Attendance settings"
      sub="Where the office is, and what counts as a full day"
      onClose={onClose}
      foot={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn--primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save settings'}</button>
      </>}
    >
      <div className="field">
        <label>Office name</label>
        <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Head office" />
      </div>

      <div className="field">
        <label>Office location</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn--sm" disabled={fixing} onClick={() => void capture()}>
            {fixing ? 'Reading your location…' : 'Use my current location'}
          </button>
          <span className="att-evid">{lat && lng ? `${lat}, ${lng}` : 'Not set yet'}</span>
        </div>
        {fixNote && <p className="punch-note">{fixNote}</p>}
        <p className="punch-note">Stand inside the office when you press this. Everybody punches in against this spot.</p>
      </div>

      <div className="hr-fields">
        <div className="field">
          <label>Allowed distance (metres)</label>
          <input className="input" type="number" min={10} max={5000} value={radius} onChange={(e) => setRadius(e.target.value)} />
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
