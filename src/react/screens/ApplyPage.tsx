import { useState } from 'react'
import { isConfigured } from '@/lib/supabase'
import { useJobApplications, type ApplicationSubmission } from '@/data/useJobApplications'
import { APPLICATION_DOCS } from '@/lib/hr'

/**
 * The one screen in this app that renders for a signed-out stranger — reached
 * at /apply, before App.tsx's session check runs (see App.tsx). It must never
 * import useWorkspace or anything that queries a policied table: an anonymous
 * visitor has no session for those queries to run under.
 *
 * Submitting writes exactly one row (job_applications) and up to five files
 * into the QUARANTINED 'job-applications' storage bucket — nothing else in
 * the database is touched until HR reviews and approves it (0017, Phase 8).
 */
export function ApplyPage() {
  const apps = useJobApplications(false)
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [positionInterest, setPositionInterest] = useState('')
  const [noPrevious, setNoPrevious] = useState(false)
  const [files, setFiles] = useState<Record<string, File | null>>({
    photo: null, pan: null, aadhaar: null, bank_proof: null, relieving_letter: null,
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const setFile = (key: string, f: File | null) => setFiles((p) => ({ ...p, [key]: f }))

  const missing = APPLICATION_DOCS.filter((d) => {
    if (d.key === 'relieving_letter' && noPrevious) return false
    return !files[d.key]
  })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!isConfigured) return setErr('This form is not configured yet. Contact HR directly.')
    if (!fullName.trim() || !phone.trim() || !email.trim()) return setErr('Name, phone and email are required.')
    if (missing.length) return setErr(`Please attach: ${missing.map((d) => d.label).join(', ')}.`)

    setBusy(true); setErr(null)
    const submission: ApplicationSubmission = {
      fullName, phone, email, positionInterest, noPreviousEmployment: noPrevious,
      files: {
        photo: files.photo!, pan: files.pan!, aadhaar: files.aadhaar!, bank_proof: files.bank_proof!,
        relieving_letter: noPrevious ? null : files.relieving_letter,
      },
    }
    const message = await apps.submit(submission)
    setBusy(false)
    if (message) return setErr(message)
    setDone(true)
  }

  if (done) {
    return (
      <div className="screen is-active">
        <div className="auth">
          <div className="auth-card">
            <div className="auth-head">
              <div className="monogram" style={{ marginBottom: 6 }}>M</div>
              <h2>Application received</h2>
              <p>Thank you, {fullName.trim().split(' ')[0]}. Metrol Media HR will reach out if you are shortlisted.</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="screen is-active">
      <div className="auth">
        <div className="auth-card">
          <div className="auth-head">
            <div className="monogram" style={{ marginBottom: 6 }}>M</div>
            <h2>Join Metrol Media</h2>
            <p>Fill in your details and attach the documents below. HR reviews every application.</p>
          </div>
          <form className="auth-form" onSubmit={submit}>
            <div className="field">
              <label htmlFor="apName">Full name</label>
              <input className="input" id="apName" required autoComplete="name"
                     value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="apPhone">Phone number</label>
              <input className="input" id="apPhone" type="tel" required autoComplete="tel" placeholder="+91 …"
                     value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="apEmail">Email</label>
              <input className="input" id="apEmail" type="email" required autoComplete="email"
                     value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="apRole">Position you're interested in</label>
              <input className="input" id="apRole" placeholder="e.g. Video Editor, Sales"
                     value={positionInterest} onChange={(e) => setPositionInterest(e.target.value)} />
            </div>

            <div className="field">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={noPrevious}
                       onChange={(e) => setNoPrevious(e.target.checked)} />
                I have no previous employer (fresher) — no relieving letter to attach
              </label>
            </div>

            {APPLICATION_DOCS.map((d) => {
              if (d.key === 'relieving_letter' && noPrevious) return null
              return (
                <div className="field" key={d.key}>
                  <label htmlFor={`apf-${d.key}`}>{d.label}</label>
                  <input className="input" id={`apf-${d.key}`} type="file"
                         accept="image/*,.pdf"
                         onChange={(e) => setFile(d.key, e.target.files?.[0] ?? null)} />
                </div>
              )
            })}

            {err && <p className="auth-err">{err}</p>}
            <button className="btn btn--primary btn--block btn--lg" type="submit" disabled={busy}>
              {busy ? 'Submitting…' : 'Submit application'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
