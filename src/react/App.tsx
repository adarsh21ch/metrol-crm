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
import { TeamPage } from '@/screens/TeamPage'
import { Member } from '@/screens/Member'
import { HrPage } from '@/screens/HrPage'
import { HR_DEPARTMENT } from '@/lib/hr'

/** Screen-based, like the prototype: everyone reaches this from one bookmark,
 *  and a router would put the back button in a fight with the sidebar. It can
 *  be added later without touching a screen. */
type Route =
  | { name: 'projects' }
  | { name: 'project'; id: string }
  | { name: 'team' }
  | { name: 'member'; id: string }

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

  /* A failed write used to roll the row back in silence: the chip flicked back
     to its old value and nothing said why, which is precisely what makes a
     permission problem look like a sync problem. Surface it. */
  useEffect(() => {
    if (!ws.error || ws.loading) return
    toast('Could not save: ' + ws.error)
    ws.clearError()
  }, [ws.error, ws.loading, toast, ws])

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

  // Which dashboard a member gets is decided by their DEPARTMENT, never by a
  // role column — see migration 0006. Sales gets their own leads; Human
  // Resources gets the HR dashboard. Everything either one may read is
  // enforced by policy in the database, not by this line.
  if (ws.me?.role === 'member') {
    if (ws.departmentName(ws.me.departmentId) === HR_DEPARTMENT) {
      return <><HrPage ws={ws} toast={toast} />{toastNode}</>
    }
    return <><Member ws={ws} toast={toast} />{toastNode}</>
  }

  const onOpenProjects = () => setRoute({ name: 'projects' })
  const onOpenProject = (id: string) => setRoute({ name: 'project', id })
  const onOpenTeam = () => setRoute({ name: 'team' })
  const onOpenMember = (id: string) => setRoute({ name: 'member', id })

  return (
    <>
      {route.name === 'projects' && <Projects ws={ws} onOpen={onOpenProject} onOpenTeam={onOpenTeam} />}
      {route.name === 'project' && (
        <ProjectShell
          ws={ws}
          projectId={route.id}
          onBack={onOpenProjects}
          onOpenProject={onOpenProject}
          onOpenTeam={onOpenTeam}
          toast={toast}
        />
      )}
      {(route.name === 'team' || route.name === 'member') && (
        <TeamPage
          ws={ws}
          memberId={route.name === 'member' ? route.id : null}
          onOpenMember={onOpenMember}
          onBackToTeam={onOpenTeam}
          onOpenProjects={onOpenProjects}
          onOpenProject={onOpenProject}
        />
      )}
      {toastNode}
    </>
  )
}
