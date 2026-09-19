/** Shape-compatible with RailItem, plus two things only a phone needs:
 *  a shorter label (a tab bar has ~64px per item, a sidebar has 180px) and a
 *  count that belongs on the icon rather than inside the words. */
export interface BottomNavItem {
  key: string
  label: string
  /** Used on the tab bar when `label` is too long for it. ~10 characters. */
  short?: string
  icon: React.ReactNode
  /** Rendered as a pill on the icon. Hidden when 0 or undefined. */
  badge?: number
  onClick: () => void
}

/**
 * EXACTLY five. Not "at most five" — five, checked by the compiler.
 *
 * This used to be `BottomNavItem[]` with an overflow sheet behind a "More"
 * button, and that escape hatch is precisely how the bar came to mean a
 * different thing on every screen: a screen could add a sixth item, never see
 * a consequence, and the tab that mattered quietly fell into a drawer. A team
 * lead's Profile tab was in there. So the rule is a type now, and a sixth
 * destination does not overflow — it fails `npm run typecheck` and you go and
 * decide which four are the daily ones.
 */
export type BottomNavItems = readonly [BottomNavItem, BottomNavItem, BottomNavItem, BottomNavItem, BottomNavItem]

/** Icons for the sections that are not HR's — those already carry their own in
 *  HrPage's rail. Kept in one place so five screens do not each hand-roll an
 *  SVG for "Leads". */
export const NAV_ICONS: Record<string, React.ReactNode> = {
  overview: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  ),
  leads: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    </svg>
  ),
  sales: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><path d="M12 7v10M9.5 9.5a2.5 2.5 0 0 1 2.5-1h.3a2.2 2.2 0 0 1 0 4.4h-.6a2.2 2.2 0 0 0 0 4.4h.3a2.5 2.5 0 0 0 2.5-1" />
    </svg>
  ),
  team: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 20V10M9 20V4M15 20v-7M21 20v-11" />
    </svg>
  ),
  dash: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 0 1 18 0" /><path d="M12 12l4-3" /><circle cx="12" cy="12" r="1.3" />
    </svg>
  ),
  attendance: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
    </svg>
  ),
  projects: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  hr: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    </svg>
  ),
  profile: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
    </svg>
  ),
  leave: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M3 10h18M8 2v4M16 2v4" />
    </svg>
  ),
  salary: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><path d="M12 7v10M9.5 9.5a2.5 2.5 0 0 1 2.5-1h.3a2.2 2.2 0 0 1 0 4.4h-.6a2.2 2.2 0 0 0 0 4.4h.3a2.5 2.5 0 0 0 2.5-1" />
    </svg>
  ),
  onboarding: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ),
  exit: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  ),
}

/**
 * The phone's navigation. It replaces the strip of chips that used to sit
 * under the topbar, for one reason: that strip scrolled sideways, so half the
 * sections were off the edge and you had to drag the bar to find out they
 * existed. A tab bar shows what there is without being asked, and it sits
 * under the thumb rather than at the top of the screen where a phone is
 * hardest to reach.
 *
 * Five tabs, and the fifth is Profile — on every screen, for every role, in
 * the same place with the same icon. Whatever is not one of a screen's four
 * daily destinations lives INSIDE Profile, which is why there is no longer
 * anything for an overflow sheet to hold.
 *
 * Rendered on every screen; CSS hides it above 860px, where the rail and the
 * tab strip are the better tools and nothing about the desktop layout changes.
 */
export function BottomNav({ items, active }: { items: BottomNavItems; active: string }) {
  return (
    <nav className="bnav" aria-label="Sections">
      {items.map((it) => (
        <button
          key={it.key}
          className={'bnav-btn' + (active === it.key ? ' is-on' : '')}
          onClick={it.onClick}
          aria-current={active === it.key ? 'page' : undefined}
        >
          <span className="bnav-ico">
            {it.icon}
            {!!it.badge && <span className="bnav-badge">{it.badge > 99 ? '99+' : it.badge}</span>}
          </span>
          <span className="bnav-lbl">{it.short ?? it.label}</span>
        </button>
      ))}
    </nav>
  )
}
