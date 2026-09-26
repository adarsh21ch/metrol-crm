import { Fragment, useEffect, useRef, useState } from 'react'
import type { useHoverTip } from '@/components/HoverTip'
import type { usePanes } from '@/lib/usePanes'
import type { Workspace } from '@/data/useWorkspace'
import { AccountControls } from '@/components/AccountControls'

/**
 * The persistent left-hand nav on every owner-level screen (the owner's and
 * HR's — THE ACCESS RULE).
 *
 * It draws whatever list it is given, in the groups the list names: one
 * model (lib/ownerNav.tsx) feeds HR's screen, Projects, a project, Team and
 * Profile alike, which is how they stopped disagreeing about what the app
 * contains. Collapsed to icons, a group's label becomes a thin rule, so the
 * groups still read at a glance.
 */
export interface RailItem {
  key: string
  label: string
  icon: React.ReactNode
  onClick: () => void
  /** The group it sits in — its label is drawn above the first item of each. */
  group?: string
  /** Nested under the item above it: each project under Projects. */
  sub?: boolean
}

export function Rail({
  ws, active, panes, tip, items, roleLabel, onOpenProfile,
}: {
  ws: Workspace
  /** The key of the item that is lit. */
  active: string
  panes: ReturnType<typeof usePanes>
  tip: ReturnType<typeof useHoverTip>
  items: RailItem[]
  /** What prints under the name in the foot — "Owner", "HR", a department.
   *  Each screen already had its own answer; they are not interchangeable. */
  roleLabel?: string
  onOpenProfile?: () => void
}) {
  /* The list scrolls once the window is shorter than it — on a 768px laptop
     the last of Settings is already behind the edge. A hidden item must read
     as "more below", not as missing: the edge with more behind it fades. */
  const listRef = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState({ up: false, down: false })
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const measure = () => {
      const up = el.scrollTop > 2
      const down = el.scrollTop + el.clientHeight < el.scrollHeight - 2
      setMore((m) => (m.up === up && m.down === down ? m : { up, down }))
    }
    measure()
    el.addEventListener('scroll', measure, { passive: true })
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', measure); ro.disconnect() }
  }, [items.length, panes.railWide])

  // The lit item is never the hidden one: open Workflows & lists and the rail
  // shows it, clear of the fade.
  useEffect(() => {
    const el = listRef.current
    const on = el?.querySelector<HTMLElement>('.rail-btn.is-on')
    if (!el || !on) return
    const box = el.getBoundingClientRect()
    const r = on.getBoundingClientRect()
    if (r.top < box.top) el.scrollTop -= box.top - r.top + 28
    else if (r.bottom > box.bottom) el.scrollTop += r.bottom - box.bottom + 28
  }, [active, items.length])

  return (
    <nav className={'rail' + (panes.railWide ? ' is-wide' : '')} aria-label="Navigation">
      <div ref={listRef} className={'rail-list' + (more.up ? ' more-up' : '') + (more.down ? ' more-down' : '')}>
        {items.map((it, i) => (
          <Fragment key={it.key}>
            {i > 0 && it.group !== items[i - 1].group && (
              it.group ? <div className="rail-group"><span>{it.group}</span></div> : <span className="rail-sep" />
            )}
            <button className={'rail-btn' + (it.sub ? ' rail-btn--sub' : '') + (active === it.key ? ' is-on' : '')}
                    onClick={it.onClick} aria-label={it.label} aria-current={active === it.key ? 'page' : undefined}
                    {...tip.bind(it.label)}>
              <span className="rail-mark">{it.icon}</span>
              <span className="rail-name">{it.label}</span>
            </button>
          </Fragment>
        ))}
      </div>

      {/* Who you are, and the way out. Adarsh's point, and he is right: on a
          desktop this app IS a sidebar and a canvas, so the account block is
          navigation chrome and belongs here rather than floating above the
          content. The same component renders in the topbar on a phone, where
          there is no rail to put it in. */}
      {onOpenProfile && (
        <AccountControls ws={ws} variant="rail" roleLabel={roleLabel ?? ''} onOpenProfile={onOpenProfile} />
      )}

      <button className="rail-toggle" onClick={panes.toggleRail} aria-label={panes.railWide ? 'Icons only' : 'Show names'}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d={panes.railWide ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} />
        </svg>
      </button>
      <span className="pane-rz" title="Drag to widen · double-click to reset"
            onPointerDown={panes.dragHandle('rail')} onDoubleClick={panes.resetPane('rail')} />
    </nav>
  )
}
