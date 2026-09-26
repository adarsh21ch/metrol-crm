import { useEffect, useRef, useState } from 'react'

const DRAG_THRESHOLD = 6
const RETURN_MS = 180

export interface BoardCol {
  key: string
  label: string
  /** A chip tone class — the column head's dot is drawn in it. */
  dotCls: string
}

/**
 * One column per status (Leads) or per stage (Content), cards dragged
 * between them. Dragging is a shortcut for the exact same write the list
 * makes — the caller's onDrop — so the two views can never disagree.
 *
 * Built on pointer events rather than the HTML5 drag-and-drop API: native
 * drag-and-drop does not fire from a touch screen in the browsers the team
 * actually carries, so a board only draggable with a mouse would be a
 * desktop demo, not a tool anybody could use from their phone.
 *
 * The card that moves is a floating clone, not the real one — the real card
 * stays in its slot as a dashed placeholder so the column doesn't reflow
 * mid-drag. Drop it somewhere that isn't a valid column (or back on its own)
 * and the clone flies back to that placeholder rather than just vanishing;
 * drop it on a different column and the write happens immediately.
 */
export function Board<T extends { id: string }>({
  cols, rows, colOf, renderCard, onOpen, onDrop, canDrag, emptyText, cardClass,
}: {
  cols: BoardCol[]
  rows: T[]
  colOf: (row: T) => string
  renderCard: (row: T) => React.ReactNode
  onOpen: (row: T) => void
  onDrop: (row: T, col: string) => void
  /** A card this person may not move still opens; it just does not lift. */
  canDrag?: (row: T) => boolean
  emptyText: string
  cardClass?: (row: T) => string | undefined
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<string | null>(null)
  const [ghost, setGhost] = useState<{ row: T; x: number; y: number; w: number; h: number } | null>(null)
  const byId = useRef(new Map<string, T>())
  byId.current = new Map(rows.map((r) => [r.id, r]))
  // The latest props for the window listeners, which are registered once.
  const live = useRef({ onDrop, colOf })
  live.current = { onDrop, colOf }

  const ghostRef = useRef<HTMLDivElement>(null)

  // Mutable so the window listeners registered once at mount always see the
  // latest values without having to be torn down and rebuilt every render.
  const drag = useRef<{
    id: string; startX: number; startY: number; dragging: boolean; overCol: string | null
    offsetX: number; offsetY: number; w: number; h: number; originX: number; originY: number
  } | null>(null)

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const st = drag.current
      if (!st) return
      const dx = e.clientX - st.startX
      const dy = e.clientY - st.startY
      if (!st.dragging) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
        const row = byId.current.get(st.id)
        if (!row) { drag.current = null; return }
        st.dragging = true
        setDraggingId(st.id)
        setGhost({ row, x: e.clientX - st.offsetX, y: e.clientY - st.offsetY, w: st.w, h: st.h })
      }
      e.preventDefault()
      const x = e.clientX - st.offsetX
      const y = e.clientY - st.offsetY
      if (ghostRef.current) ghostRef.current.style.transform = `translate(${x}px, ${y}px)`
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const col = el?.closest<HTMLElement>('[data-col]')
      const next = col?.dataset.col ?? null
      if (next !== st.overCol) { st.overCol = next; setOverCol(next) }
    }
    const up = () => {
      const st = drag.current
      drag.current = null
      setOverCol(null)
      if (!st?.dragging) { setGhost(null); return }
      const row = byId.current.get(st.id)
      const committed = !!(row && st.overCol && live.current.colOf(row) !== st.overCol)
      if (committed) {
        live.current.onDrop(row!, st.overCol!)
        setDraggingId(null)
        setGhost(null)
        return
      }
      // Not a valid new column — fly the clone back to where it started rather
      // than just snapping it away, so releasing in the wrong place still
      // looks like the card going home, not an error.
      const g = ghostRef.current
      if (g) {
        g.classList.add('is-returning')
        g.style.transform = `translate(${st.originX}px, ${st.originY}px)`
        window.setTimeout(() => { setDraggingId(null); setGhost(null) }, RETURN_MS)
      } else {
        setDraggingId(null)
        setGhost(null)
      }
    }
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [])

  return (
    <div className="board">
      {cols.map((col) => {
        const inCol = rows.filter((r) => colOf(r) === col.key)
        return (
          <div key={col.key} data-col={col.key} className={'board-col' + (overCol === col.key ? ' is-over' : '')}>
            <div className="board-col-head">
              <span className={'dot ' + col.dotCls} aria-hidden="true" />
              <span className="board-col-nm">{col.label}</span>
              <span className="board-col-count">{inCol.length}</span>
            </div>
            <div className="board-col-body">
              {inCol.length === 0 && <div className="board-empty">{emptyText}</div>}
              {inCol.map((r) => {
                const movable = canDrag ? canDrag(r) : true
                const extra = cardClass?.(r)
                return (
                  <div
                    key={r.id}
                    className={'board-card' + (draggingId === r.id ? ' is-placeholder' : '')
                      + (movable ? '' : ' is-fixed') + (extra ? ' ' + extra : '')}
                    onPointerDown={(e) => {
                      if (!movable) return
                      if (e.button !== 0 && e.pointerType === 'mouse') return
                      const rect = e.currentTarget.getBoundingClientRect()
                      drag.current = {
                        id: r.id, startX: e.clientX, startY: e.clientY, dragging: false, overCol: null,
                        offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top,
                        w: rect.width, h: rect.height, originX: rect.left, originY: rect.top,
                      }
                    }}
                    onClick={() => { if (draggingId !== r.id) onOpen(r) }}
                  >
                    {renderCard(r)}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {ghost && (
        <div
          ref={ghostRef}
          className="board-card board-card--ghost"
          style={{ width: ghost.w, height: ghost.h, transform: `translate(${ghost.x}px, ${ghost.y}px)` }}
        >
          {renderCard(ghost.row)}
        </div>
      )}
    </div>
  )
}
