import { useEffect, useRef, useState } from 'react'
import { Chip } from '@/components/bits'
import { QUALITY, STATUS, type Lead, type LeadStatus } from '@/lib/types'
import { money } from '@/lib/format'

const COLUMNS = Object.keys(STATUS) as LeadStatus[]
const DRAG_THRESHOLD = 6

/**
 * The same leads as the list, laid out as one column per status. Dragging a
 * card to another column is a shortcut for the exact same write the list's
 * status dropdown makes — there is no second code path, so the two views can
 * never disagree about what a lead's status is.
 *
 * Built on pointer events rather than the HTML5 drag-and-drop API: native
 * drag-and-drop does not fire from a touch screen in the browsers a
 * salesperson actually carries, so a board only draggable with a mouse would
 * be a desktop demo, not a tool the team could use from their phone.
 */
export function LeadsBoard({
  leads, projectName, onOpenHistory, onDropStatus,
}: {
  leads: Lead[]
  projectName: (id: string) => string
  onOpenHistory: (l: Lead) => void
  onDropStatus: (lead: Lead, status: LeadStatus) => void
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<LeadStatus | null>(null)
  const byId = useRef(new Map(leads.map((l) => [l.id, l])))
  byId.current = new Map(leads.map((l) => [l.id, l]))

  // Mutable so the window listeners registered at pointerdown always see the
  // latest values without having to be torn down and rebuilt every render.
  const drag = useRef<{ id: string; startX: number; startY: number; dragging: boolean; overCol: LeadStatus | null } | null>(null)

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const st = drag.current
      if (!st) return
      const dx = e.clientX - st.startX
      const dy = e.clientY - st.startY
      if (!st.dragging) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
        st.dragging = true
        setDraggingId(st.id)
      }
      e.preventDefault()
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const col = el?.closest<HTMLElement>('[data-col]')
      const next = (col?.dataset.col as LeadStatus | undefined) ?? null
      if (next !== st.overCol) { st.overCol = next; setOverCol(next) }
    }
    const up = () => {
      const st = drag.current
      drag.current = null
      setDraggingId(null)
      setOverCol(null)
      if (!st?.dragging) return
      const lead = byId.current.get(st.id)
      if (lead && st.overCol && lead.status !== st.overCol) onDropStatus(lead, st.overCol)
    }
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onDropStatus])

  return (
    <div className="board">
      {COLUMNS.map((col) => {
        const rows = leads.filter((l) => l.status === col)
        return (
          <div key={col} data-col={col} className={'board-col' + (overCol === col ? ' is-over' : '')}>
            <div className="board-col-head">
              <span className={'dot ' + STATUS[col].cls} aria-hidden="true" />
              <span className="board-col-nm">{STATUS[col].label}</span>
              <span className="board-col-count">{rows.length}</span>
            </div>
            <div className="board-col-body">
              {rows.length === 0 && <div className="board-empty">No leads here</div>}
              {rows.map((l) => (
                <div
                  key={l.id}
                  className={'board-card' + (draggingId === l.id ? ' is-dragging' : '')}
                  onPointerDown={(e) => {
                    if (e.button !== 0 && e.pointerType === 'mouse') return
                    drag.current = { id: l.id, startX: e.clientX, startY: e.clientY, dragging: false, overCol: null }
                  }}
                >
                  <button className="board-card-nm" onClick={() => onOpenHistory(l)}>
                    {l.isNew && <span className="new-dot" title="New lead" />}
                    {l.name}
                  </button>
                  <div className="board-card-sub">{projectName(l.projectId)}</div>
                  <div className="board-card-foot">
                    {l.quality && <Chip cls={QUALITY[l.quality].cls}>{QUALITY[l.quality].label}</Chip>}
                    {l.amount > 0 && <span className="cell-money">{money(l.amount)}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
