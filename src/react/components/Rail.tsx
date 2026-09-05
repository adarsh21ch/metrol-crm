import type { useHoverTip } from '@/components/HoverTip'
import type { usePanes } from '@/lib/usePanes'
import { initials } from '@/lib/format'
import type { Workspace } from '@/data/useWorkspace'

/**
 * The persistent left-hand nav for the owner's whole app — not just inside a
 * project. It used to live only in ProjectShell, which is why leaving a
 * project (back to the Projects grid) made it vanish outright; the same
 * markup now renders on every owner screen so jumping between Projects, a
 * project, and Team never loses your place. Settings stays a modal (opened
 * from here, or from the gear already in each topbar) rather than becoming a
 * page of its own — Company settings is a handful of admin fields, not
 * something that needs its own navigable URL.
 */
export interface RailItem {
  key: string
  label: string
  icon: React.ReactNode
  onClick: () => void
}

export function Rail({
  ws, active, panes, tip, items, onOpenProjects, onOpenProject, onOpenTeam, onOpenSettings,
}: {
  ws: Workspace
  active: 'projects' | 'team' | string
  panes: ReturnType<typeof usePanes>
  tip: ReturnType<typeof useHoverTip>
  /** When given, these replace the owner's projects list and Team button. The
   *  same rail, carrying another department's nav — HR's Directory and
   *  Departments today, and the room Leave, Salary, Onboarding and Exits will
   *  need in phases 2 to 5. A second rail component would drift from this one. */
  items?: RailItem[]
  onOpenProjects?: () => void
  onOpenProject?: (id: string) => void
  onOpenTeam?: () => void
  onOpenSettings?: () => void
}) {
  return (
    <nav className={'rail' + (panes.railWide ? ' is-wide' : '')} aria-label="Navigation">
      <div className="rail-list">
        {items ? items.map((it) => (
          <button key={it.key} className={'rail-btn' + (active === it.key ? ' is-on' : '')}
                  onClick={it.onClick} aria-label={it.label} {...tip.bind(it.label)}>
            <span className="rail-mark">{it.icon}</span>
            <span className="rail-name">{it.label}</span>
          </button>
        )) : (<>
        <button className={'rail-btn' + (active === 'projects' ? ' is-on' : '')}
                onClick={() => onOpenProjects?.()} aria-label="All projects" {...tip.bind('All projects')}>
          <span className="rail-mark">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
              <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
            </svg>
          </span>
          <span className="rail-name">All projects</span>
        </button>
        <span className="rail-sep" />
        {ws.projects.map((p) => (
          <button key={p.id} className={'rail-btn' + (active === p.id ? ' is-on' : '')}
                  onClick={() => onOpenProject?.(p.id)} {...tip.bind(p.name)}>
            <span className="rail-mark">{initials(p.name)}</span>
            <span className="rail-name">{p.name}</span>
          </button>
        ))}
        </>)}
      </div>

      {!items && (<>
      <span className="rail-sep" />
      <button className={'rail-btn' + (active === 'team' ? ' is-on' : '')} onClick={() => onOpenTeam?.()} {...tip.bind('Team')}>
        <span className="rail-mark">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
            <path d="M3 20V10M9 20V4M15 20v-7M21 20v-11" />
          </svg>
        </span>
        <span className="rail-name">Team</span>
      </button>
      </>)}
      {onOpenSettings && (
      <button className="rail-btn" onClick={onOpenSettings} {...tip.bind('Settings')}>
        <span className="rail-mark">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </span>
        <span className="rail-name">Settings</span>
      </button>
      )}

      <button className="rail-toggle" onClick={panes.toggleRail} aria-label="Show project names">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d={panes.railWide ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} />
        </svg>
      </button>
      <span className="pane-rz" title="Drag to widen · double-click to reset"
            onPointerDown={panes.dragHandle('rail')} onDoubleClick={panes.resetPane('rail')} />
    </nav>
  )
}
