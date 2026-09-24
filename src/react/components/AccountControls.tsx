import { Avatar, IconBtn, RefreshIcon } from '@/components/bits'
import { NotificationBell } from '@/components/NotificationBell'
import { ThemeToggle } from '@/components/ThemeToggle'
import { useNotificationFeed } from '@/data/useNotifications'
import { initials } from '@/lib/format'
import { HR_DEPARTMENT } from '@/lib/hr'
import { signOut } from '@/lib/supabase'
import type { Workspace } from '@/data/useWorkspace'

const SIGN_OUT = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5" /><path d="M21 12H9" />
  </svg>
)

/**
 * Who you are signed in as, and the way out. ONE component, rendered in two
 * places — the rail's foot on a desktop, the topbar on a phone (where there
 * is no rail at all) — because Adarsh's point was right: on a desktop this
 * app is a sidebar and a canvas, and "who am I / sign out" is navigation
 * chrome, not something the content area should be carrying.
 *
 * Which of the two shows is decided in CSS, not here: `.topbar-account` is
 * `display:none` above 860px and the rail is `display:none` below it, so
 * exactly one is ever on screen and neither can drift from the other.
 */
export function AccountControls({
  ws, roleLabel, onOpenProfile, variant, extra, alwaysShow, hasRail, onRefresh, refreshing,
}: {
  ws: Workspace
  /** What to print under the name — "Owner", "HR", a department. Each screen
   *  already had its own answer and they are not interchangeable. Rail only:
   *  the topbar has no chip to print it on. */
  roleLabel: string
  onOpenProfile: () => void
  variant: 'rail' | 'topbar'
  /** The employee's own app has no rail at all, so its topbar block is the
   *  only one there is and must stay visible on a desktop too. */
  alwaysShow?: boolean
  /** True on every screen that renders a <Rail> alongside this (HrPage,
   *  Projects, OwnerProfile, ProjectShell, TeamPage) — 2026-09-21: the bell
   *  and theme toggle move OUT of the rail's foot and into this component's
   *  topbar copy, visible on a desktop too rather than mobile-only, so the
   *  corner beside the brand name is not sitting empty on every one of them.
   *  Sign-out and the account chip stay exactly where they were, rail-only. */
  hasRail?: boolean
  /** Screen-specific controls that belong beside the account block rather than
   *  in the page (the density slider on the employee's own app). */
  extra?: React.ReactNode
  /** Refresh as an icon up here, where it costs nothing, instead of a labelled
   *  button on a row of its own under every page title. */
  onRefresh?: () => void
  refreshing?: boolean
}) {
  const name = ws.me?.name ?? '—'
  /* The topbar is the PHONE's copy — the rail is hidden below 860px and this
     takes over. It used to carry a theme toggle, a sign-out icon and an avatar
     chip on the owner's and HR's screens, and all three are Profile's job now:
     Profile is the fifth tab on every screen, so a second door to it in the
     corner, and two settings sitting outside it, were exactly the scatter this
     round exists to end. The member's app had already been cut back this way —
     "remove the logout button and [the avatar] at the top right ... so their
     space becomes clean" — and what is left is what the bar cannot do: the
     bell, whose whole job is to show an unread count without being asked.
     The rail keeps all of it; on a desktop it IS the navigation. */
  const full = variant === 'rail'
  const isPrivileged = ws.me?.role === 'owner' || ws.departmentName(ws.me?.departmentId ?? null) === HR_DEPARTMENT
  /* The session's one feed, NOT a new one per copy of this component: this
     renders twice on every screen with a rail (rail + topbar, one hidden by
     CSS), and two subscribers on one realtime topic is what used to throw. */
  const n = useNotificationFeed()
  return (
    <div className={variant === 'rail' ? 'rail-foot'
        : 'topbar-account' + (alwaysShow ? ' topbar-account--always' : '') + (hasRail ? ' topbar-account--desktop' : '')}>
      <div className="acct-row">
        {onRefresh && (
          <IconBtn title={refreshing ? 'Refreshing…' : 'Refresh'} onClick={onRefresh}>
            <RefreshIcon spinning={refreshing} />
          </IconBtn>
        )}
        {/* Desktop-only (a rail already exists below 860px only in the sense
            that it's CSS-hidden there too) — on a phone this stays in
            Profile, unchanged. */}
        {!full && hasRail && <span className="on-desktop"><ThemeToggle /></span>}
        {!full && <NotificationBell ws={ws} n={n} isPrivileged={isPrivileged} />}
        {extra}
        {full && <IconBtn title="Sign out" onClick={() => void signOut()}>{SIGN_OUT}</IconBtn>}
      </div>
      {full && (
        <button className="user-chip" title="My profile" onClick={onOpenProfile}>
          <Avatar lg src={ws.me?.avatarUrl}>{initials(name === '—' ? '?' : name)}</Avatar>
          <div>
            <div className="name">{name}</div>
            <div className="role">{roleLabel}</div>
          </div>
        </button>
      )}
    </div>
  )
}
