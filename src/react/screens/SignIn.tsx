import { useState } from 'react'
import { isConfigured, supabase } from '@/lib/supabase'

/**
 * Phase 9: the field takes an email OR a four-digit employee ID.
 *
 * Supabase Auth is keyed on email, so an ID has to become one before
 * signInWithPassword is called — `email_for_employee_code` (migration 0018)
 * does that, and is the only thing a signed-out visitor can call. Anything
 * with an "@" in it is passed straight through and never touches the RPC, so
 * the ordinary email sign-in is exactly the request it always was.
 */
export function SignIn({ onDone, onCreateAccount }: { onDone: () => void; onCreateAccount?: () => void }) {
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!isConfigured) return setErr('Supabase is not configured for this deployment.')
    setBusy(true); setErr(null)

    const typed = email.trim()
    let address = typed
    if (!typed.includes('@')) {
      const { data, error } = await supabase.rpc('email_for_employee_code', { p_code: typed })
      if (error) {
        setBusy(false)
        // The throttle raises this by name; everything else is a real fault.
        return setErr(error.message.includes('rate_limited')
          ? 'Too many sign-in attempts right now. Use your email address instead.'
          : error.message)
      }
      if (!data) {
        setBusy(false)
        return setErr(`No active employee has the ID ${typed}. Check it, or sign in with your email address.`)
      }
      address = data as string
    }

    const { error } = await supabase.auth.signInWithPassword({ email: address, password: pass })
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
              <label htmlFor="authEmail">Email or employee ID</label>
              {/* type="text", not "email" — the browser would refuse to submit
                  "6068" as an invalid email before this code ever ran. */}
              <input className="input" id="authEmail" type="text" autoComplete="username" required
                     autoCapitalize="none" autoCorrect="off" spellCheck={false}
                     placeholder="you@metrol.in or 6068" value={email} onChange={(e) => setEmail(e.target.value)} />
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
          {onCreateAccount && (
            <div className="auth-alt">
              <button className="btn btn--sm btn--block" type="button" onClick={onCreateAccount}>
                New team member? Create an account
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
