import { useState } from 'react'
import { supabase, isConfigured } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardBody } from '@/components/ui/card'
import { ThemeToggle } from '@/components/ThemeToggle'

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setBusy(false)
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-ground px-4">
      <div className="w-full max-w-[380px]">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded bg-accent font-display font-bold text-accent-on">
              M
            </span>
            <span className="font-display text-lg font-semibold">Metrol CRM</span>
          </div>
          <ThemeToggle />
        </div>

        <Card>
          <CardBody className="pt-4">
            {!isConfigured && (
              <p className="mb-4 rounded border border-warn-line bg-warn-soft px-3 py-2 text-[13px] text-warn">
                Supabase is not configured. Set <code>VITE_SUPABASE_URL</code> and{' '}
                <code>VITE_SUPABASE_ANON_KEY</code>.
              </p>
            )}
            <form onSubmit={submit} className="space-y-3">
              <div>
                <label htmlFor="email" className="mb-1 block text-[13px] font-medium text-ink-2">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="password" className="mb-1 block text-[13px] font-medium text-ink-2">
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {error && <p className="text-[13px] text-bad">{error}</p>}
              <Button
                type="submit"
                variant="accent"
                disabled={busy || !isConfigured}
                className="w-full"
              >
                {busy ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
