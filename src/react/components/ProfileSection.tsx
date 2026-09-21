import { useEffect, useRef, useState } from 'react'
import { Avatar } from '@/components/bits'
import { initials } from '@/lib/format'
import { disablePush, enablePush, pushIsEnabled, pushSupported } from '@/lib/push'
import { signOut } from '@/lib/supabase'
import { useTheme } from '@/lib/useTheme'
import type { Workspace } from '@/data/useWorkspace'

/** One row of the Profile menu. A row is a destination, not a setting — the
 *  settings are the foot, and they are the same on every screen. */
export interface ProfileRow {
  key: string
  label: string
  /** Shown as a count pill, the way Leave shows pending requests. */
  badge?: number
  /** Read once and almost never again — Terms & Conditions. It sits with Sign
   *  out rather than taking a slot in the daily list. Member's own words. */
  atFoot?: boolean
  onClick: () => void
}

const PENCIL = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
)

/**
 * Profile — the fifth tab, on every screen, for every role.
 *
 * It was a MODAL on four screens out of five, opened from an avatar chip in
 * the top-right corner, and a tab on only the salesperson's app. That is why
 * "where do I change my password" had a different answer depending on who you
 * were signed in as, and why the owner could not reach Company settings from a
 * phone AT ALL — the gear that opens it lives in the rail, and the rail is
 * `display:none` below 860px.
 *
 * So it is one component now, composed the same way three times:
 *
 *   identity card  — who you are
 *   .prof-menu     — the destinations this ROLE has that are not daily tabs
 *   Account        — name, phone, photo, password, push. Opens in place.
 *   .prof-foot     — Appearance, anything marked atFoot, Sign out
 *
 * Only the middle band differs by role. Everything above and below it is
 * identical everywhere, which is the whole point.
 */
export function ProfileSection({
  ws, rows, subtitle, photoUrl, fullName, meta, pan, onSavePan,
}: {
  ws: Workspace
  rows: ProfileRow[]
  /** Printed under the name when there is no employee record to describe. */
  subtitle?: string
  /** The passport photo the joining form collected, where HR has one on file. */
  photoUrl?: string | null
  fullName?: string
  /** Employee code, designation, department — whatever this role can show. */
  meta?: React.ReactNode
  /** Payroll phase 1 (0029) — this person's own PAN, and how to save a
   *  change to it. Omitted entirely (not just blank) where the caller has
   *  no employee record to attach one to, so the field never appears for
   *  somebody it would silently fail for. */
  pan?: string | null
  onSavePan?: (pan: string) => Promise<string | null>
}) {
  const me = ws.me
  const { theme, setTheme } = useTheme()
  const [account, setAccount] = useState(false)

  if (!me) return null

  const name = fullName || me.name || '—'
  const menu = rows.filter((r) => !r.atFoot)
  const foot = rows.filter((r) => r.atFoot)

  if (account) {
    return (
      <>
        <div className="prof-back">
          <button className="btn btn--sm" onClick={() => setAccount(false)} aria-label="Back to profile">←</button>
          <h3>Account</h3>
        </div>
        <AccountPanel ws={ws} pan={pan} onSavePan={onSavePan} />
      </>
    )
  }

  return (
    <>
      {/* The same identity card Attendance opens with. Its pencil opens the
          account editor in place — that editor used to be the modal behind the
          avatar chip in the top bar, which is what made the chip removable. */}
      <div className="emp-head emp-head--slim">
        {photoUrl
          ? <img className="emp-photo" src={photoUrl} alt="" />
          : <div className="emp-photo emp-photo--none">{initials(name === '—' ? '?' : name)}</div>}
        <div className="emp-id">
          <h2>{name}</h2>
          {meta ?? <div className="emp-meta" style={{ color: 'var(--ink-3)' }}>{subtitle || me.email}</div>}
        </div>
        <button className="icon-btn" title="Edit my profile" aria-label="Edit my profile"
                onClick={() => setAccount(true)}>{PENCIL}</button>
      </div>

      <div className="prof-menu">
        {menu.length > 0 && (<>
          <div className="prof-group">More</div>
          {menu.map((r) => (
            <button className="prof-row" key={r.key} onClick={r.onClick}>
              <span className="l">{r.label}</span>
              {!!r.badge && <span className="count">{r.badge}</span>}
              <span className="go" aria-hidden="true">›</span>
            </button>
          ))}
        </>)}

        {/* Named, and in its own band, so HR's Profile does not read as though
            payroll and a password change were the same kind of thing. */}
        <div className="prof-group">My account</div>
        <button className="prof-row" onClick={() => setAccount(true)}>
          <span className="l">Name, phone, photo &amp; password</span>
          <span className="go" aria-hidden="true">›</span>
        </button>
      </div>

      {/* "Appearance" needs no sentence under it explaining that it changes how
          the app looks. Sign out is last, after scrolling, on the one tab that
          is about you. */}
      <div className="prof-foot">
        <div className="prof-set">
          <div className="t">Appearance</div>
          <div className="seg">
            <button className={theme === 'light' ? 'is-on' : ''} onClick={() => setTheme('light')}>Light</button>
            <button className={theme === 'dark' ? 'is-on' : ''} onClick={() => setTheme('dark')}>Dark</button>
            <button className={theme === 'system' ? 'is-on' : ''} onClick={() => setTheme('system')}>Auto</button>
          </div>
        </div>
        {foot.map((r) => (
          <button className="prof-row" key={r.key} onClick={r.onClick}>
            <span className="l">{r.label}</span>
            <span className="go" aria-hidden="true">›</span>
          </button>
        ))}
        <button className="btn btn--block btn--ghost" onClick={() => void signOut()}>Sign out</button>
      </div>
    </>
  )
}

/**
 * Every account edits itself here — name, phone, photo, password, and whether
 * this device gets pushed to.
 *
 * This was `ProfileModal`, and the reason it is no longer a modal is the one
 * Adarsh gave: the fifth tab is Profile everywhere, so the thing Profile is
 * FOR should be the page, not a dialog floating over it. The calls underneath
 * are unchanged — `ws.updateMe`, `ws.uploadAvatar`, `ws.removeAvatar`,
 * `ws.changePassword` and the two push helpers all behave exactly as they did.
 */
export function AccountPanel({
  ws, pan, onSavePan,
}: {
  ws: Workspace
  pan?: string | null
  onSavePan?: (pan: string) => Promise<string | null>
}) {
  const me = ws.me
  const fileRef = useRef<HTMLInputElement>(null)
  const [panInput, setPanInput] = useState(pan ?? '')
  const [savingPan, setSavingPan] = useState(false)
  const [panMsg, setPanMsg] = useState<{ text: string; bad?: boolean } | null>(null)
  const panValid = /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panInput.trim())

  async function savePan() {
    if (!onSavePan || !panValid) return
    setSavingPan(true); setPanMsg(null)
    const err = await onSavePan(panInput.trim())
    setSavingPan(false)
    setPanMsg(err ? { text: err, bad: true } : { text: 'Saved.' })
  }

  const [name, setName] = useState(me?.name ?? '')
  const [phone, setPhone] = useState(me?.phone ?? '')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState<{ text: string; bad?: boolean } | null>(null)

  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [photoErr, setPhotoErr] = useState<string | null>(null)

  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [savingPw, setSavingPw] = useState(false)
  const [pwMsg, setPwMsg] = useState<{ text: string; bad?: boolean } | null>(null)

  const [pushOn, setPushOn] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const [pushErr, setPushErr] = useState<string | null>(null)
  useEffect(() => { void pushIsEnabled().then(setPushOn) }, [])

  async function togglePush() {
    setPushBusy(true); setPushErr(null)
    const err = pushOn ? await disablePush() : await enablePush()
    setPushBusy(false)
    if (err) { setPushErr(err); return }
    setPushOn(!pushOn)
  }

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

  async function removePhoto() {
    setRemoving(true); setPhotoErr(null)
    const err = await ws.removeAvatar()
    setRemoving(false)
    if (err) setPhotoErr(err)
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
    <div className="auth-form prof-account">
      <div className="field" style={{ alignItems: 'center', flexDirection: 'row', gap: 14, display: 'flex' }}>
        <Avatar lg src={me.avatarUrl}>{me.initials}</Avatar>
        <div>
          <input ref={fileRef} type="file" accept="image/*" hidden
                 onChange={(e) => void pickPhoto(e.target.files?.[0])} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn--sm" disabled={uploading || removing} onClick={() => fileRef.current?.click()}>
              {uploading ? 'Uploading…' : me.avatarUrl ? 'Change photo' : 'Upload photo'}
            </button>
            {me.avatarUrl && (
              <button type="button" className="btn btn--sm btn--ghost" disabled={uploading || removing} onClick={() => void removePhoto()}>
                {removing ? 'Removing…' : 'Remove photo'}
              </button>
            )}
          </div>
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

      {onSavePan && (
        <div className="auth-form" style={{ borderTop: '1px dashed var(--line)', paddingTop: 14 }}>
          <div className="auth-alt-label">PAN number</div>
          <div className="field">
            <label htmlFor="pfPan">PAN</label>
            <input className="input" id="pfPan" placeholder="ABCDE1234F" maxLength={10}
                   value={panInput} onChange={(e) => setPanInput(e.target.value.toUpperCase())} />
          </div>
          {panInput.trim() && !panValid && <p className="auth-err">That does not look like a PAN — it should read like ABCDE1234F.</p>}
          {panMsg && <p className={panMsg.bad ? 'auth-err' : 'imp-result is-ok'}>{panMsg.text}</p>}
          <button className="btn btn--sm" type="button" disabled={savingPan || !panValid || panInput.trim() === (pan ?? '')}
                  onClick={() => void savePan()}>
            {savingPan ? 'Saving…' : 'Save PAN'}
          </button>
        </div>
      )}

      {pushSupported() && (
        <div className="auth-form" style={{ borderTop: '1px dashed var(--line)', paddingTop: 14 }}>
          <div className="auth-alt-label">Notifications</div>
          <div className="field" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>
              Broadcasts, birthdays and reminders — pushed to this device even when the app is closed.
            </span>
            <button type="button" className={'btn btn--sm' + (pushOn ? ' btn--primary' : '')}
                    disabled={pushBusy} onClick={() => void togglePush()}>
              {pushBusy ? '…' : pushOn ? 'On' : 'Enable'}
            </button>
          </div>
          {pushErr && <p className="auth-err" style={{ marginTop: 6 }}>{pushErr}</p>}
        </div>
      )}

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
  )
}
