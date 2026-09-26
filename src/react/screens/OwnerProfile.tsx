import { AccountControls } from '@/components/AccountControls'
import { BottomNav, type BottomNavItems } from '@/components/BottomNav'
import { ProfileSection } from '@/components/ProfileSection'
import { Rail, type RailItem } from '@/components/Rail'
import { useHoverTip } from '@/components/HoverTip'
import { usePanes } from '@/lib/usePanes'
import { ownerProfileRows, type OwnerDest } from '@/lib/ownerNav'
import type { AgencySchema } from '@/data/agencySchema'
import type { Workspace } from '@/data/useWorkspace'

/**
 * The owner's fifth tab.
 *
 * The owner had no Profile anywhere: their account lived behind an avatar chip
 * in the top-right corner that opened a modal, and **Company settings could not
 * be reached from a phone at all** — the gear that opens it is in the rail, and
 * the rail is `display:none` below 860px.
 *
 * On a phone this is also the whole app's menu: every destination the rail
 * has on a desktop, in the same groups (lib/ownerNav.tsx), minus the four the
 * tab bar already holds (Projects, the last project, Team, and HR's
 * Dashboard behind the HR tab).
 */
export function OwnerProfile({
  ws, nav, rail, go, schema,
}: {
  ws: Workspace
  nav: BottomNavItems
  rail: RailItem[]
  go: (d: OwnerDest) => void
  schema: AgencySchema | null
}) {
  const panes = usePanes()
  const tip = useHoverTip()
  const oldClients = schema?.clients === false
  const rows = ownerProfileRows(go, {
    hide: ['dashboard', 'projects', 'team', ...(oldClients ? ['reels' as const] : [])],
    label: oldClients ? { clientsPages: 'Clients & Pages' } : {},
  })

  return (
    <div className="screen screen--app is-active">
      <div className="topbar">
        <div className="brand">
          <div className="monogram">M</div>
          <div className="brand-name">Metrol Media</div>
        </div>
        <div className="topbar-right">
          <AccountControls ws={ws} variant="topbar" hasRail roleLabel={ws.me?.email ?? 'Owner'}
                           onOpenProfile={() => {}} />
        </div>
      </div>

      <div className="shell">
        <Rail ws={ws} roleLabel={ws.me?.email ?? 'Owner'} onOpenProfile={() => {}} active="profile"
              panes={panes} tip={tip} items={rail} />

        <div className="workspace">
          <div className="wrap">
            <div className="page-head"><h1>Profile</h1></div>
            <ProfileSection ws={ws} subtitle={ws.me?.email ?? 'Owner'} photoUrl={ws.me?.avatarUrl} rows={rows} />
          </div>
        </div>
      </div>

      <BottomNav items={nav} active="profile" />

      {tip.node}
    </div>
  )
}
