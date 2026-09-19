import { useState } from 'react'
import { AccountControls } from '@/components/AccountControls'
import { BottomNav, type BottomNavItems } from '@/components/BottomNav'
import { ProfileSection } from '@/components/ProfileSection'
import { Rail } from '@/components/Rail'
import { useHoverTip } from '@/components/HoverTip'
import { CompanyAdminModal } from '@/modals/CompanyAdminModal'
import { usePanes } from '@/lib/usePanes'
import type { Workspace } from '@/data/useWorkspace'

/**
 * The owner's fifth tab.
 *
 * The owner had no Profile anywhere: their account lived behind an avatar chip
 * in the top-right corner that opened a modal, and **Company settings could not
 * be reached from a phone at all** — the gear that opens it is in the rail, and
 * the rail is `display:none` below 860px. So the owner was the one role who
 * could not change the company code, add a department or see the team list
 * without finding a laptop.
 *
 * The chrome is the same chrome every other owner screen has, deliberately:
 * this is a place in the app, not a dialog over one.
 */
export function OwnerProfile({
  ws, nav, onOpenProjects, onOpenProject, onOpenTeam, onOpenHr,
}: {
  ws: Workspace
  nav: BottomNavItems
  onOpenProjects: () => void
  onOpenProject: (id: string) => void
  onOpenTeam: () => void
  onOpenHr: () => void
}) {
  const [adminOpen, setAdminOpen] = useState(false)
  const panes = usePanes()
  const tip = useHoverTip()

  return (
    <div className="screen screen--app is-active">
      <div className="topbar">
        <div className="brand">
          <div className="monogram">M</div>
          <div className="brand-name">Metrol Media</div>
        </div>
        <div className="topbar-right">
          <AccountControls ws={ws} variant="topbar" roleLabel={ws.me?.email ?? 'Owner'}
                           onOpenProfile={() => {}} />
        </div>
      </div>

      <div className="shell">
        <Rail ws={ws} roleLabel={ws.me?.email ?? 'Owner'} onOpenProfile={() => {}} active="profile"
              panes={panes} tip={tip}
              onOpenProjects={onOpenProjects} onOpenProject={onOpenProject}
              onOpenTeam={onOpenTeam} onOpenHr={onOpenHr} onOpenSettings={() => setAdminOpen(true)} />

        <div className="workspace">
          <div className="wrap">
            <div className="page-head"><h1>Profile</h1></div>
            <ProfileSection
              ws={ws}
              subtitle={ws.me?.email ?? 'Owner'}
              photoUrl={ws.me?.avatarUrl}
              rows={[
                /* The one thing the owner has that nobody else does, and the
                   one thing a phone could not reach before this round. */
                { key: 'company', label: 'Company settings', onClick: () => setAdminOpen(true) },
              ]}
            />
          </div>
        </div>
      </div>

      <BottomNav items={nav} active="profile" />

      {tip.node}
      {adminOpen && <CompanyAdminModal ws={ws} onClose={() => setAdminOpen(false)} />}
    </div>
  )
}
