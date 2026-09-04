import { useState } from 'react'
import { isConfigured, supabase } from '@/lib/supabase'

/**
 * Self-service, and deliberately narrow: it can only ever create a salesperson
 * account. role defaults to 'member' in the schema, and the guard trigger on
 * profiles blocks a client from changing it — so there is no path from this
 * form to an owner account, by construction rather than by convention.
 */
export function SignUp({ onDone, onHaveAccount }: { onDone: () => void; onHaveAccount: () => void }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [pass2, setPass2] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [checkEmail, setCheckEmail] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!isConfigured) return setErr('Supabase is not configured for this deployment.')
    if (pass.length < 6) return setErr('Password needs at least 6 characters.')
    if (pass !== pass2) return setErr('The two passwords do not match.')

    setBusy(true); setErr(null)
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password: pass,
      options: { data: { name: name.trim(), phone: phone.trim() } },
    })
    setBusy(false)
    if (error) return setErr(error.message)
    // With email confirmation on, there is no session yet — say so and stop
    // here. With it off, the account is already live; go straight in.
    if (data.session) onDone()
    else setCheckEmail(true)
  }

  if (checkEmail) {
    return (
      <div className="screen is-active">
        <div className="auth">
          <div className="auth-card">
            <div className="auth-head">
              <div className="monogram" style={{ marginBottom: 6 }}>M</div>
              <h2>Check your email</h2>
              <p>We sent a confirmation link to {email}. Click it, then sign in.</p>
            </div>
            <button className="btn btn--primary btn--block btn--lg" onClick={onHaveAccount}>Back to sign in</button>
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
            <h2>Create your account</h2>
            <p>For Metrol Media team members.</p>
          </div>
          <form className="auth-form" onSubmit={submit}>
            <div className="field">
              <label htmlFor="suName">Name</label>
              <input className="input" id="suName" required autoComplete="name"
                     value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="suPhone">Phone number</label>
              <input className="input" id="suPhone" type="tel" required autoComplete="tel" placeholder="+91 …"
                     value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="suEmail">Email</label>
              <input className="input" id="suEmail" type="email" required autoComplete="username"
                     placeholder="you@metrol.in" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="suPass">Password</label>
              <input className="input" id="suPass" type="password" required autoComplete="new-password"
                     value={pass} onChange={(e) => setPass(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="suPass2">Confirm password</label>
              <input className="input" id="suPass2" type="password" required autoComplete="new-password"
                     value={pass2} onChange={(e) => setPass2(e.target.value)} />
            </div>
            {err && <p className="auth-err">{err}</p>}
            <button className="btn btn--primary btn--block btn--lg" type="submit" disabled={busy}>
              {busy ? 'Creating account…' : 'Create account'}
            </button>
          </form>
          <div className="auth-alt">
            <button className="btn btn--sm btn--block" type="button" onClick={onHaveAccount}>
              Already have an account? Sign in
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
