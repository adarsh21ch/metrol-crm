import { useRef, useState } from 'react'
import { Modal } from '@/components/Modal'
import { Avatar } from '@/components/bits'
import type { Workspace } from '@/data/useWorkspace'

/**
 * Every account edits itself here — name, phone, photo, password. It is a
 * modal rather than a true side panel: the app already draws every other
 * editor (import, a sale, a lead's history) as one, and a second interaction
 * pattern for the same kind of task would be a new thing to learn rather than
 * a convenience.
 */
export function ProfileModal({ ws, onClose }: { ws: Workspace; onClose: () => void }) {
  const me = ws.me
  const fileRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState(me?.name ?? '')
  const [phone, setPhone] = useState(me?.phone ?? '')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState<{ text: string; bad?: boolean } | null>(null)

  const [uploading, setUploading] = useState(false)
  const [photoErr, setPhotoErr] = useState<string | null>(null)

  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [savingPw, setSavingPw] = useState(false)
  const [pwMsg, setPwMsg] = useState<{ text: string; bad?: boolean } | null>(null)

  if (!me) return null

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    setSavingProfile(true); setProfileMsg(null)
    const err = await ws.updateMe({ name: name.trim(), phone: phone.trim() || null })
    setSavingProfile(false)
    setProfileMsg(err ? { text: err, bad: true } : { text: 'Saved.' })
  }

  async function pickPhoto(file: File | undefined | null) {
    if (!file) return
    if (!file.type.startsWith('image/')) { setPhotoErr('That is not an image file.'); return }
    if (file.size > 5 * 1024 * 1024) { setPhotoErr('Keep it under 5MB.'); return }
    setUploading(true); setPhotoErr(null)
    const { error } = await ws.uploadAvatar(file)
    setUploading(false)
    if (error) setPhotoErr(error)
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault()
    if (pw1.length < 6) { setPwMsg({ text: 'At least 6 characters.', bad: true }); return }
    if (pw1 !== pw2) { setPwMsg({ text: 'The two passwords do not match.', bad: true }); return }
    setSavingPw(true); setPwMsg(null)
    const err = await ws.changePassword(pw1)
    setSavingPw(false)
    if (err) setPwMsg({ text: err, bad: true })
    else { setPwMsg({ text: 'Password changed.' }); setPw1(''); setPw2('') }
  }

  return (
    <Modal title="My profile" sub={me.role === 'owner' ? 'Owner' : 'Sales'} onClose={onClose}
           foot={<button className="btn btn--sm" onClick={onClose}>Close</button>}>
      <div className="auth-form">
        <div className="field" style={{ alignItems: 'center', flexDirection: 'row', gap: 14, display: 'flex' }}>
          <Avatar lg src={me.avatarUrl}>{me.initials}</Avatar>
          <div>
            <input ref={fileRef} type="file" accept="image/*" hidden
                   onChange={(e) => void pickPhoto(e.target.files?.[0])} />
            <button type="button" className="btn btn--sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? 'Uploading…' : me.avatarUrl ? 'Change photo' : 'Upload photo'}
            </button>
            {photoErr && <p className="auth-err" style={{ marginTop: 6 }}>{photoErr}</p>}
          </div>
        </div>

        <form onSubmit={saveProfile} className="auth-form" style={{ borderTop: '1px dashed var(--line)', paddingTop: 14 }}>
          <div className="field">
            <label htmlFor="pfName">Name</label>
            <input className="input" id="pfName" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="pfPhone">Phone</label>
            <input className="input" id="pfPhone" inputMode="tel" placeholder="+91 …" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="field">
            <label>Email</label>
            <input className="input" value={me.email ?? ''} disabled />
          </div>
          {profileMsg && <p className={profileMsg.bad ? 'auth-err' : 'imp-result is-ok'}>{profileMsg.text}</p>}
          <button className="btn btn--sm btn--primary" type="submit" disabled={savingProfile}>
            {savingProfile ? 'Saving…' : 'Save changes'}
          </button>
        </form>

        <form onSubmit={savePassword} className="auth-form" style={{ borderTop: '1px dashed var(--line)', paddingTop: 14 }}>
          <div className="auth-alt-label">Change password</div>
          <div className="field">
            <label htmlFor="pfPw1">New password</label>
            <input className="input" id="pfPw1" type="password" autoComplete="new-password"
                   value={pw1} onChange={(e) => setPw1(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="pfPw2">Confirm new password</label>
            <input className="input" id="pfPw2" type="password" autoComplete="new-password"
                   value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </div>
          {pwMsg && <p className={pwMsg.bad ? 'auth-err' : 'imp-result is-ok'}>{pwMsg.text}</p>}
          <button className="btn btn--sm" type="submit" disabled={savingPw || !pw1}>
            {savingPw ? 'Saving…' : 'Change password'}
          </button>
        </form>
      </div>
    </Modal>
  )
}
