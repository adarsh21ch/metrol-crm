import { useState } from 'react'
import { isConfigured, supabase } from '@/lib/supabase'

export function SignIn({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!isConfigured) return setErr('Supabase is not configured for this deployment.')
    setBusy(true); setErr(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass })
    setBusy(false)
    if (error) setErr(error.message)
    else onDone()
  }

  return (
    <div className="screen is-active" id="screen-signin">
      <div className="auth">
        <div className="auth-card">
          <div className="auth-head">
            <div className="monogram" style={{ marginBottom: 6 }}>M</div>
            <h2>Sign in</h2>
            <p>Metrol Media staff accounts only.</p>
          </div>
          <form className="auth-form" onSubmit={submit}>
            <div className="field">
              <label htmlFor="authEmail">Email</label>
              <input className="input" id="authEmail" type="email" autoComplete="username" required
                     placeholder="you@metrol.in" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="authPass">Password</label>
              <input className="input" id="authPass" type="password" autoComplete="current-password" required
                     placeholder="Your password" value={pass} onChange={(e) => setPass(e.target.value)} />
            </div>
            {err && <p className="auth-err">{err}</p>}
            <button className="btn btn--primary btn--block btn--lg" type="submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
