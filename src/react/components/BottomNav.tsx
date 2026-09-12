import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

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

const MORE_ICON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" />
  </svg>
)

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

const MAX_TABS = 5

/**
 * The phone's navigation. It replaces the strip of chips that used to sit
 * under the topbar, for one reason: that strip scrolled sideways, so half the
 * sections were off the edge and you had to drag the bar to find out they
 * existed. A tab bar shows what there is without being asked, and it sits
 * under the thumb rather than at the top of the screen where a phone is
 * hardest to reach.
 *
 * Five is the ceiling — past that the labels stop being readable, so the
 * fifth slot becomes "More" and opens a sheet with the rest. HR has eight
 * sections and is the reason the overflow exists at all.
 *
 * Rendered on every screen; CSS hides it above 860px, where the rail and the
 * tab strip are the better tools and nothing about the desktop layout changes.
 */
export function BottomNav({ items, active }: { items: BottomNavItem[]; active: string }) {
  const [sheet, setSheet] = useState(false)

  const overflows = items.length > MAX_TABS
  const tabs = overflows ? items.slice(0, MAX_TABS - 1) : items
  const rest = overflows ? items.slice(MAX_TABS - 1) : []
  const activeInRest = rest.some((i) => i.key === active)

  useEffect(() => {
    if (!sheet) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setSheet(false) }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [sheet])

  return (
    <>
      <nav className="bnav" aria-label="Sections">
        {tabs.map((it) => (
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

        {overflows && (
          <button
            className={'bnav-btn' + (activeInRest ? ' is-on' : '')}
            onClick={() => setSheet(true)}
            aria-haspopup="dialog"
          >
            <span className="bnav-ico">
              {MORE_ICON}
              {/* A count hidden behind "More" is a count nobody sees, so any
                  badge in the overflow is surfaced on the button itself. */}
              {!!rest.reduce((t, i) => t + (i.badge ?? 0), 0) && <span className="bnav-badge bnav-badge--dot" />}
            </span>
            <span className="bnav-lbl">
              {activeInRest ? (rest.find((i) => i.key === active)?.short ?? 'More') : 'More'}
            </span>
          </button>
        )}
      </nav>

      {sheet && createPortal(
        <div className="bsheet-back" onClick={(e) => { if (e.target === e.currentTarget) setSheet(false) }}>
          <div className="bsheet" role="dialog" aria-label="More sections">
            <div className="bsheet-grip" />
            <div className="bsheet-list">
              {rest.map((it) => (
                <button
                  key={it.key}
                  className={'bsheet-row' + (active === it.key ? ' is-on' : '')}
                  onClick={() => { it.onClick(); setSheet(false) }}
                >
                  <span className="bsheet-ico">{it.icon}</span>
                  <span className="bsheet-lbl">{it.label}</span>
                  {!!it.badge && <span className="bsheet-count">{it.badge}</span>}
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
