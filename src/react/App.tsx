import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useWorkspace } from '@/data/useWorkspace'
import { NotificationsProvider } from '@/data/useNotifications'
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
import { ApplyPage } from '@/screens/ApplyPage'
import { OwnerProfile } from '@/screens/OwnerProfile'
import { NAV_ICONS, type BottomNavItems } from '@/components/BottomNav'
import { CompanyAdminModal } from '@/modals/CompanyAdminModal'
import { useAgencySchema } from '@/data/agencySchema'
import { isOwnerLevel } from '@/lib/hr'
import { initials } from '@/lib/format'
import { ownerRail, type OwnerDest } from '@/lib/ownerNav'
import { setPersisted, usePersistedState } from '@/lib/usePersistedState'

/** Screen-based, like the prototype: everyone reaches this from one bookmark,
 *  and a router would put the back button in a fight with the sidebar. It can
 *  be added later without touching a screen. */
type Route =
  | { name: 'projects' }
  | { name: 'project'; id: string }
  | { name: 'team' }
  | { name: 'member'; id: string }
  | { name: 'hr' }
  /** The owner's fifth tab. A route rather than the modal it used to be,
   *  because Profile is a place on every screen now and a place has to be
   *  somewhere you can BE — including on a desktop, where the rail's avatar
   *  chip lands here too. */
  | { name: 'profile' }

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [authView, setAuthView] = useState<'landing' | 'signin' | 'signup'>('landing')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  // The one screen a signed-out stranger can reach: checked before the
  // session gate below, and before useWorkspace is ever called, so it never
  // waits on — or is blocked by — a login that does not exist yet.
  if (window.location.pathname === '/apply') return <ApplyPage />

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
  // null = this login's home: the owner starts on Projects, HR on HR.
  const [chosen, setRoute] = usePersistedState<Route | null>('route', null)
  const [lastProject, setLastProject] = usePersistedState<string | null>('last-project', null)
  // Settings → Company. One modal for every owner-level screen, opened from
  // the rail or Profile wherever you are — it used to be five copies.
  const [companyOpen, setCompanyOpen] = useState(false)
  const schema = useAgencySchema()

  /* A failed write used to roll the row back in silence: the chip flicked back
     to its old value and nothing said why, which is precisely what makes a
     permission problem look like a sync problem. Surface it. */
  useEffect(() => {
    if (!ws.error || ws.loading) return
    /* A failed WRITE is what this is for — toast it, clear it, carry on. A
       failed LOAD is not: the workspace is empty, the "Could not load" screen
       below owns that case, and clearing the error here would wipe that screen
       out from under the person and drop them into an app with no data in it.
       Same condition the screen below tests, so exactly one of the two ever
       handles any given error. */
    if (ws.projects.length === 0) return
    toast('Could not save: ' + ws.error)
    ws.clearError()
  }, [ws.error, ws.loading, ws.projects.length, toast, ws])

  /* Every screen below is wrapped in this. The notifications feed has to
     live ABOVE them: AccountControls renders twice on any screen with a rail
     and would otherwise open two subscriptions on one realtime topic, which
     threw and took the whole tree — and the window — down with it. Here it is
     also built once per session instead of once per navigation. */
  const withFeed = (screen: ReactNode) => (
    <NotificationsProvider enabled={!!ws.me}>
      {screen}
      {toastNode}
    </NotificationsProvider>
  )

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

  // Which screens a member gets is decided by their DEPARTMENT, never by a
  // role column — see migration 0006. HR walks every screen the owner does
  // (Adarsh's rule, 0040: HR = owner until he names an exception), landing
  // on HR; everyone else gets their own dashboard. Everything anyone may read
  // is enforced by policy in the database, not by this line.
  if (ws.me?.role === 'member' && !isOwnerLevel(ws)) {
    return withFeed(<Member ws={ws} toast={toast} />)
  }
  const route: Route = chosen ?? (ws.me?.role === 'owner' ? { name: 'projects' } : { name: 'hr' })

  const onOpenProjects = () => setRoute({ name: 'projects' })
  const onOpenProject = (id: string) => { setLastProject(id); setRoute({ name: 'project', id }) }
  const onOpenTeam = () => setRoute({ name: 'team' })
  const onOpenMember = (id: string) => setRoute({ name: 'member', id })
  const onOpenHr = () => setRoute({ name: 'hr' })
  const onOpenProfile = () => setRoute({ name: 'profile' })

  /* Every rail link and Profile row of the owner's and HR's app lands here
     (lib/ownerNav.tsx). A section of HR's screen is remembered for it before
     it opens — HrPage reads it on mount — with no employee left open, so a
     link always lands on the section itself. HrPage handles its own
     sections while it is open, and only hands the rest up. */
  const go = (d: OwnerDest) => {
    if (d === 'company') { setCompanyOpen(true); return }
    if (d === 'projects') { onOpenProjects(); return }
    if (d === 'team') { onOpenTeam(); return }
    setPersisted('hr-section', d)
    setPersisted('hr-openId', null)
    if (d === 'clientsPages') setPersisted('agency-open-client', null)
    onOpenHr()
  }
  /* One grouped list for Projects, a project, Team and Profile. Inside a
     project, every project sits under Projects — one click between them, as
     the old rail gave — and folds away everywhere else. Not on the Projects
     page itself: its cards ARE that list, and listing six projects a second
     time pushed all of Settings below a laptop's fold (2026-09-26). */
  const inProject = route.name === 'project'
  const rail = ownerRail(go, {
    hide: schema?.clients === false ? ['reels'] : [],
    label: schema?.clients === false ? { clientsPages: 'Clients & Pages' } : {},
    under: inProject ? {
      projects: ws.projects.map((p) => ({ key: p.id, label: p.name, icon: initials(p.name), onClick: () => onOpenProject(p.id) })),
    } : {},
  })

  /* The owner's second tab, "Project" — resume the one you were working in.
     The owner has only three app-level destinations (Projects, Team, HR) and
     the bar wants four, and inventing a fourth screen would have been exactly
     the feature creep the quality bar forbids. This is not invented: it is
     where the owner actually spends the day, one tap from anywhere. Falls back
     to the first active project, then to any project, then to the grid — so
     the tab is never a button that does nothing. */
  const resumeProject = ws.projects.find((p) => p.id === lastProject)
    ?? ws.projects.find((p) => p.status === 'active')
    ?? ws.projects[0]
    ?? null
  const onOpenLastProject = () => (resumeProject ? onOpenProject(resumeProject.id) : onOpenProjects())

  /* Every owner screen's tab bar, outside a project. Built once, here, rather
     than three times in three screens — which is how they came to disagree in
     the first place. Each screen only says which tab is lit. */
  const ownerNav: BottomNavItems = [
    { key: 'projects', label: 'Projects', icon: NAV_ICONS.projects, onClick: onOpenProjects },
    { key: 'project', label: resumeProject?.name ?? 'Project', short: 'Project', icon: NAV_ICONS.overview, onClick: onOpenLastProject },
    { key: 'team', label: 'Team', icon: NAV_ICONS.team, onClick: onOpenTeam },
    { key: 'hr', label: 'HR', icon: NAV_ICONS.hr, onClick: onOpenHr },
    { key: 'profile', label: 'Profile', icon: NAV_ICONS.profile, onClick: onOpenProfile },
  ]

  return withFeed(
    <>
      {route.name === 'projects' && (
        <Projects ws={ws} onOpen={onOpenProject} onOpenProfile={onOpenProfile} nav={ownerNav} rail={rail} />
      )}
      {route.name === 'project' && (
        <ProjectShell
          ws={ws}
          projectId={route.id}
          onBack={onOpenProjects}
          onOpenProject={onOpenProject}
          onOpenTeam={onOpenTeam}
          onOpenProfile={onOpenProfile}
          rail={rail}
          toast={toast}
        />
      )}
      {(route.name === 'team' || route.name === 'member') && (
        <TeamPage
          ws={ws}
          memberId={route.name === 'member' ? route.id : null}
          onOpenMember={onOpenMember}
          onBackToTeam={onOpenTeam}
          onOpenProfile={onOpenProfile}
          nav={ownerNav}
          rail={rail}
        />
      )}
      {/* The owner's home is Projects, so a phone gets a way back to it here;
          HR's home is this screen, and a desktop has Projects in the rail. */}
      {route.name === 'hr' && (
        <HrPage ws={ws} toast={toast} onNav={go}
                onBackToProjects={ws.me?.role === 'owner' ? onOpenProjects : undefined} />
      )}
      {route.name === 'profile' && <OwnerProfile ws={ws} nav={ownerNav} rail={rail} go={go} schema={schema} />}
      {companyOpen && <CompanyAdminModal ws={ws} onClose={() => setCompanyOpen(false)} />}
    </>,
  )
}
