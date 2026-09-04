import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useWorkspace } from '@/data/useWorkspace'
import { isDemo } from '@/data/demo'
import { useToast } from '@/components/Toast'
import { SignIn } from '@/screens/SignIn'
import { SignUp } from '@/screens/SignUp'
import { Landing } from '@/screens/Landing'
import { Projects } from '@/screens/Projects'
import { ProjectShell } from '@/screens/ProjectShell'
import { Member } from '@/screens/Member'

/** Screen-based, like the prototype: everyone reaches this from one bookmark,
 *  and a router would put the back button in a fight with the sidebar. It can
 *  be added later without touching a screen. */
type Route = { name: 'projects' } | { name: 'project'; id: string }

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [authView, setAuthView] = useState<'landing' | 'signin' | 'signup'>('landing')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (!ready) return <Booting />
  if (!session && !isDemo()) {
    // The landing page is the front door; sign-in and sign-up are one click
    // behind it, and can send you to each other without going back through it.
    if (authView === 'signup') {
      return <SignUp onDone={() => { /* the auth listener re-renders us */ }} onHaveAccount={() => setAuthView('signin')} />
    }
    if (authView === 'signin') {
      return (
        <SignIn onDone={() => { /* the auth listener re-renders us */ }}
                onCreateAccount={() => setAuthView('signup')} />
      )
    }
    return <Landing onSignIn={() => setAuthView('signin')} />
  }
  return <SignedIn />
}

function Booting() {
  return (
    <div className="screen is-active"
         style={{ display: 'grid', placeItems: 'center', height: '100dvh', color: 'var(--ink-3)' }}>
      Loading…
    </div>
  )
}

function SignedIn() {
  const ws = useWorkspace()
  const { toast, node: toastNode } = useToast()
  const [route, setRoute] = useState<Route>({ name: 'projects' })

  if (ws.loading) return <Booting />

  if (ws.error && ws.projects.length === 0) {
    return (
      <div className="auth">
        <div className="auth-card">
          <div className="auth-head"><h2>Could not load</h2><p className="auth-err">{ws.error}</p></div>
          <div className="auth-form">
            <button className="btn btn--block" onClick={() => void ws.reload()}>Try again</button>
            <button className="btn btn--ghost btn--block" onClick={() => void supabase.auth.signOut()}>Sign out</button>
          </div>
        </div>
      </div>
    )
  }

  // A salesperson has one screen: their own leads. Projects are the owner's view.
  if (ws.me?.role === 'member') {
    return <><Member ws={ws} toast={toast} />{toastNode}</>
  }

  return (
    <>
      {route.name === 'projects' ? (
        <Projects ws={ws} onOpen={(id) => setRoute({ name: 'project', id })} />
      ) : (
        <ProjectShell
          ws={ws}
          projectId={route.id}
          onBack={() => setRoute({ name: 'projects' })}
          onOpenProject={(id) => setRoute({ name: 'project', id })}
          toast={toast}
        />
      )}
      {toastNode}
    </>
  )
}
