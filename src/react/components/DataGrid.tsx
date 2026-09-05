import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

export interface GridCol<T> {
  key: string
  label: string
  width: number
  render: (row: T, index: number) => React.ReactNode
}

const MIN_W = 64
const MAX_W = 720

/**
 * The prototype's grid, ported rather than reimagined. Three things it learned
 * the hard way, all preserved:
 *
 *  1. No min-width:100% on the table. That let the browser stretch every column
 *     proportionally when the grid was narrower than its container, so a 100px
 *     drag moved the edge ~135px and the guide sat left of the real boundary.
 *     Slack goes to the LAST column only, which keeps widths[] the truth.
 *  2. The grab strips span the full height of the grid in their own layer, so a
 *     boundary can be caught beside row 10 — and they stay out of the sticky
 *     header's stacking context, which used to paint over half the handle.
 *  3. The guide is position:fixed, placed from the header cell's own rectangle.
 *     Absolutely positioned inside a scroller, it drifted with the scroll.
 */
export function DataGrid<T extends { id: string; isNew?: boolean }>({
  cols,
  rows,
  storageKey,
  rowClass,
  onRowClick,
  foot,
  empty,
}: {
  cols: GridCol<T>[]
  rows: T[]
  storageKey: string
  rowClass?: (row: T) => string | undefined
  onRowClick?: (row: T) => void
  foot?: React.ReactNode
  /** Shown in place of the rows when there are none. Every table wants one:
   *  a new project's Leads, a new salesperson's list, a project nobody has
   *  closed a sale in yet. Bare column headers over nothing read as a page
   *  that failed to load rather than one with nothing in it yet. */
  empty?: React.ReactNode
}) {
  const [widths, setWidths] = useState<number[]>(() => {
    try {
      const raw = localStorage.getItem('metrol-cols-' + storageKey)
      if (raw) {
        const v = JSON.parse(raw)
        if (Array.isArray(v) && v.length === cols.length && v.every((n) => typeof n === 'number')) return v
      }
    } catch {
      /* fall through to the defaults */
    }
    return cols.map((c) => c.width)
  })

  const scrollRef = useRef<HTMLDivElement>(null)
  const tableRef = useRef<HTMLTableElement>(null)
  const guideRef = useRef<HTMLDivElement>(null)
  const [slack, setSlack] = useState(0)

  const total = widths.reduce((a, b) => a + b, 0)

  useEffect(() => {
    try { localStorage.setItem('metrol-cols-' + storageKey, JSON.stringify(widths)) } catch { /* not worth breaking a drag over */ }
  }, [widths, storageKey])

  // The container width decides the slack, so recompute when either changes.
  const measure = useCallback(() => {
    const avail = scrollRef.current?.clientWidth ?? 0
    setSlack(avail && total < avail ? avail - total : 0)
  }, [total])

  useLayoutEffect(measure, [measure, rows.length])
  useEffect(() => {
    const el = scrollRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure])

  const onStripDown = (i: number) => (e: React.PointerEvent<HTMLSpanElement>) => {
    e.preventDefault()
    const strip = e.currentTarget
    const startX = e.clientX
    const startW = widths[i]!
    let frame = 0
    let live = true
    try { strip.setPointerCapture(e.pointerId) } catch { /* older engines */ }
    strip.classList.add('is-drag')
    document.body.classList.add('is-resizing')

    const place = () => {
      const g = guideRef.current
      const sc = scrollRef.current
      const th = tableRef.current?.querySelectorAll('thead th')[i] as HTMLElement | undefined
      if (!g || !sc || !th || !live) return
      const r = th.getBoundingClientRect()
      const sr = sc.getBoundingClientRect()
      g.style.display = 'block'
      g.style.left = Math.min(Math.max(r.right, sr.left), sr.right) + 'px'
      g.style.top = sr.top + 'px'
      g.style.height = sr.height + 'px'
    }
    place()

    const move = (ev: PointerEvent) => {
      const w = Math.max(MIN_W, Math.min(MAX_W, startW + (ev.clientX - startX)))
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        setWidths((prev) => {
          if (prev[i] === w) return prev
          const next = [...prev]
          next[i] = w
          return next
        })
        place()
      })
    }
    const up = () => {
      live = false
      if (frame) cancelAnimationFrame(frame)
      strip.classList.remove('is-drag')
      document.body.classList.remove('is-resizing')
      if (guideRef.current) guideRef.current.style.display = 'none'
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const reset = (i: number) => () =>
    setWidths((prev) => {
      const next = [...prev]
      next[i] = cols[i]!.width
      return next
    })

  // Strip positions follow the running sum of the widths, less half a strip.
  const offsets: number[] = []
  let run = 0
  for (let i = 0; i < widths.length - 1; i++) { run += widths[i]!; offsets.push(run - 5) }

  return (
    <div className="grid-shell">
      <div className="grid-scroll grid-scroll--page" ref={scrollRef}>
        <table className="grid" ref={tableRef} style={{ width: total + slack }}>
          <colgroup>
            {widths.map((w, i) => (
              <col key={cols[i]!.key} style={{ width: w + (i === widths.length - 1 ? slack : 0) }} />
            ))}
          </colgroup>
          <thead>
            <tr>{cols.map((c) => <th key={c.key} className="rz-col">{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr className="grid-empty">
                <td colSpan={cols.length}>{empty ?? 'Nothing here yet.'}</td>
              </tr>
            )}
            {rows.map((r, i) => {
              const extra = rowClass?.(r)
              const cls = [r.isNew ? 'is-new' : '', extra ?? ''].filter(Boolean).join(' ')
              return (
                <tr
                  key={r.id}
                  className={cls || undefined}
                  onClick={onRowClick ? () => onRowClick(r) : undefined}
                >
                  {cols.map((c) => <td key={c.key}>{c.render(r, i)}</td>)}
                </tr>
              )
            })}
          </tbody>
        </table>

        <div className="rz-layer" style={{ width: total + slack, height: '100%' }}>
          {offsets.map((left, i) => (
            <span
              key={i}
              className="rz-strip"
              style={{ left }}
              title="Drag to resize · double-click to reset"
              onPointerDown={onStripDown(i)}
              onDoubleClick={reset(i)}
            />
          ))}
        </div>
      </div>

      {foot}
      <div className="rz-guide" ref={guideRef} />
    </div>
  )
}

export function Pager({
  page, total, size, onPage,
}: { page: number; total: number; size: number; onPage: (p: number) => void }) {
  const pages = Math.ceil(total / size)
  if (pages <= 1) return null
  return (
    <span className="pager">
      <button className="pager-btn" disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="Previous page">‹</button>
      <span className="pager-now">Page {page + 1} of {pages}</span>
      <button className="pager-btn" disabled={page >= pages - 1} onClick={() => onPage(page + 1)} aria-label="Next page">›</button>
    </span>
  )
}

/** "1–50 of 122", the prototype's wording. */
export function pageRange(total: number, page: number, size: number) {
  if (!total) return '0'
  return `${page * size + 1}–${Math.min(total, (page + 1) * size)} of ${total}`
}
