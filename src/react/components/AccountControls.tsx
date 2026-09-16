import { Avatar, IconBtn } from '@/components/bits'
import { ThemeToggle } from '@/components/ThemeToggle'
import { initials } from '@/lib/format'
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
  ws, roleLabel, onOpenProfile, variant, extra, alwaysShow,
}: {
  ws: Workspace
  /** What to print under the name — "Owner", "HR", a department. Each screen
   *  already had its own answer and they are not interchangeable. */
  roleLabel: string
  onOpenProfile: () => void
  variant: 'rail' | 'topbar'
  /** The employee's own app has no rail at all, so its topbar block is the
   *  only one there is and must stay visible on a desktop too. */
  alwaysShow?: boolean
  /** Screen-specific controls that belong beside the account block rather than
   *  in the page (the density slider on the employee's own app). */
  extra?: React.ReactNode
}) {
  const name = ws.me?.name ?? '—'
  return (
    <div className={variant === 'rail' ? 'rail-foot'
        : 'topbar-account' + (alwaysShow ? ' topbar-account--always' : '')}>
      <div className="acct-row">
        <ThemeToggle />
        {extra}
        <IconBtn title="Sign out" onClick={() => void signOut()}>{SIGN_OUT}</IconBtn>
      </div>
      <button className="user-chip" title="My profile" onClick={onOpenProfile}>
        <Avatar lg src={ws.me?.avatarUrl}>{initials(name === '—' ? '?' : name)}</Avatar>
        <div>
          <div className="name">{name}</div>
          <div className="role">{roleLabel}</div>
        </div>
      </button>
    </div>
  )
}
