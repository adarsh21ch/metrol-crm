import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { QrPoster } from '@/components/QrPoster'
import { isDemo } from '@/data/demo'
import { getFix, type OfficeLocation } from '@/lib/attendance'
import type { OfficeDraft } from '@/data/useAttendance'

/** Add or edit one branch. The location is captured by standing in the office
 *  and pressing a button — typing coordinates is not a thing to ask of anybody,
 *  and a map picker is a third-party script this app deliberately does not
 *  load. A branch is never deleted, because attendance rows point at it and
 *  history must not lose where it happened; closing one is the Active switch. */
export function OfficeModal({
  office, onClose, onSave, onRotate,
}: {
  office: OfficeLocation | null
  onClose: () => void
  onSave: (d: OfficeDraft) => Promise<string | null>
  onRotate?: (id: string) => Promise<string | null>
}) {
  const [name, setName] = useState(office?.name ?? '')
  const [address, setAddress] = useState(office?.address ?? '')
  const [lat, setLat] = useState<number | null>(office?.lat ?? null)
  const [lng, setLng] = useState<number | null>(office?.lng ?? null)
  const [radius, setRadius] = useState(String(office?.radiusMeters ?? 50))
  const [active, setActive] = useState(office?.isActive ?? true)
  const [fixing, setFixing] = useState(false)
  const [fixNote, setFixNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [rotating, setRotating] = useState(false)

  async function capture() {
    setFixing(true); setFixNote(null)
    try {
      const fix = isDemo() ? { lat: 22.719568, lng: 75.857727, accuracy: 11 } : await getFix()
      setLat(Number(fix.lat.toFixed(6)))
      setLng(Number(fix.lng.toFixed(6)))
      // A vague fix as the branch CENTRE is worse than useless — it moves the
      // whole fence. Say so instead of storing it quietly.
      setFixNote(fix.accuracy > 50
        ? `This fix is only accurate to about ${Math.round(fix.accuracy)} m. Stand outside or near a window and press it again, or the fence will sit in the wrong place.`
        : `Saved this spot, accurate to about ${Math.round(fix.accuracy)} m.`)
    } catch (e) {
      setFixNote(e instanceof Error ? e.message : 'Could not read your location.')
    } finally { setFixing(false) }
  }

  async function save() {
    const r = Number(radius)
    if (!name.trim()) return setErr('Give the branch a name — people pick it from a list.')
    if (lat == null || lng == null) return setErr('Stand inside this office and press "Use my current location".')
    if (!(r >= 10 && r <= 5000)) return setErr('The allowed distance has to be between 10 and 5000 metres.')
    setBusy(true); setErr(null)
    const message = await onSave({ name, address, lat, lng, radiusMeters: Math.round(r), isActive: active })
    setBusy(false)
    if (message) setErr(message)
    else onClose()
  }

  return (
    <Modal
      title={office ? office.name : 'Add a branch'}
      sub={office ? 'Where it is, how close somebody has to be, and its printed code' : 'Metrol can have as many of these as it needs'}
      onClose={onClose}
      foot={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn--primary" disabled={busy} onClick={() => void save()}>
          {busy ? 'Saving…' : office ? 'Save branch' : 'Add branch'}
        </button>
      </>}
    >
      <div className="field">
        <label>Branch name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Noida Sector 6" />
      </div>

      <div className="field">
        <label>Address</label>
        <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="C-56, Sector 6, Noida" />
      </div>

      <div className="field">
        <label>Location</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn--sm" disabled={fixing} onClick={() => void capture()}>
            {fixing ? 'Reading your location…' : 'Use my current location'}
          </button>
          <span className="att-evid">{lat != null && lng != null ? `${lat}, ${lng}` : 'Not set yet'}</span>
        </div>
        {fixNote && <p className="punch-note">{fixNote}</p>}
        <p className="punch-note">Stand inside this branch when you press it. Everybody here punches against this spot.</p>
      </div>

      <div className="hr-fields">
        <div className="field">
          <label>Allowed distance (metres)</label>
          <input className="input" type="number" min={10} max={5000} value={radius} onChange={(e) => setRadius(e.target.value)} />
        </div>
        <div className="field">
          <label>Status</label>
          <select className="input" value={active ? 'y' : 'n'} onChange={(e) => setActive(e.target.value === 'y')}>
            <option value="y">Open</option>
            <option value="n">Closed — nobody can punch here</option>
          </select>
        </div>
      </div>

      {office && (
        <div className="field">
          <label>Attendance code</label>
          <QrPoster
            token={office.qrToken}
            officeName={office.name}
            address={office.address}
            radiusMeters={office.radiusMeters}
            issuedAt={office.qrRotatedAt}
          />
          <p className="punch-note">
            Download it or print it, then tape it to the attendance desk. The sheet carries this branch's name,
            address and allowed distance, so two branches cannot end up with posters nobody can tell apart.
            Staff scan it to punch in and scan it again on the way out. A photo of it is useless away from the
            building — scanning still checks where the phone is.
          </p>
          {onRotate && (
            <button className="btn btn--sm" disabled={rotating} onClick={async () => {
              setRotating(true)
              const message = await onRotate(office.id)
              setRotating(false)
              setErr(message)
              if (!message) setFixNote('New code made. Print it and replace the poster — the old one no longer works.')
            }}>
              {rotating ? 'Making a new code…' : 'Make a new code (old posters stop working)'}
            </button>
          )}
        </div>
      )}

      {err && <p className="auth-err">{err}</p>}
    </Modal>
  )
}
