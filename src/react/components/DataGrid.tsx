import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

export interface GridCol<T> {
  key: string
  label: string
  width: number
  render: (row: T, index: number) => React.ReactNode
}

const MIN_W = 64
const MAX_W = 720

/** The one breakpoint in this app, matching prototype.css's 860px. A media
 *  query cannot change markup, and on a phone this grid needs different
 *  markup rather than smaller markup — see the card branch below. */
const PHONE = '(max-width: 860px)'

function useIsPhone() {
  const [is, setIs] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(PHONE).matches)
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return
    const mq = matchMedia(PHONE)
    const on = () => setIs(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return is
}

/** Cards read well and cost vertical space; the table costs a sideways drag
 *  and fits four times as many rows on a screen. Which one is right depends on
 *  whether you are reading one person or scanning forty, so it is the reader's
 *  choice, remembered per table — not ours. */
export type PhoneView = 'cards' | 'list'

/** Exported so a screen can hoist this switch onto its page-title line —
 *  THE LAYOUT LAW, rule 1. A screen that does that owns the state and passes
 *  it back in, so the grid still renders the view the switch is pointing at.
 *  Screens that do not care keep the built-in toggle and change nothing. */
export function usePhoneView(storageKey: string): [PhoneView, (v: PhoneView) => void] {
  const key = 'metrol-gridview-' + storageKey
  const [view, setView] = useState<PhoneView>(() => {
    try { return localStorage.getItem(key) === 'list' ? 'list' : 'cards' } catch { return 'cards' }
  })
  const pick = (v: PhoneView) => {
    setView(v)
    try { localStorage.setItem(key, v) } catch { /* a view preference is not worth throwing over */ }
  }
  return [view, pick]
}

/**
 * The Cards/List switch as a bare .seg, to be dropped into a .section-tools
 * that is already on a heading line rather than taking a row of its own above
 * the grid — THE LAYOUT LAW, rule 1. Same shape as attToggle and joiningToggle,
 * so it sits beside them. Pair it with usePhoneView and pass that value to
 * DataGrid's phoneView prop; the grid then renders no switch of its own.
 *
 * It disappears above the phone breakpoint, where the grid is always the
 * resizable table and a Cards button would be a control that does nothing —
 * the same call .seg-cards already makes for My leads.
 *
 * One switch can front several grids: the directory's per-department tables
 * are one decision ("cards or rows"), not one decision per department.
 */
export function PhoneViewPick({ view, onPick, className }: { view: PhoneView; onPick: (v: PhoneView) => void; className?: string }) {
  const isPhone = useIsPhone()
  if (!isPhone) return null
  return (
    <div className={'seg' + (className ? ' ' + className : '')}>
      <button className={view === 'cards' ? 'is-on' : ''} onClick={() => onPick('cards')}>Cards</button>
      <button className={view === 'list' ? 'is-on' : ''} onClick={() => onPick('list')}>List</button>
    </div>
  )
}

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
  phoneView: phoneViewProp,
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
  /** Pass a value from usePhoneView() to host the Cards/List switch yourself
   *  (in the page head). The grid then follows it and renders no switch of
   *  its own. Omit it and the grid keeps its own switch, as before. */
  phoneView?: PhoneView
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
  const isPhone = useIsPhone()
  const [ownView, setOwnView] = usePhoneView(storageKey)
  const controlled = phoneViewProp !== undefined
  const phoneView = controlled ? phoneViewProp : ownView

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

  /* ------------------------------------------------------------- phone
     A 972px table in a 375px window is read by dragging it sideways, which
     is the single thing that makes this app feel like a desktop site on a
     phone. The same rows become cards instead: no horizontal scroll at all.
     The desktop table below is untouched — the resizable columns are the
     client's first requirement and nothing here changes them. */
  /* Shown on a phone above either view. Deliberately small and right-aligned:
     it is a preference, not an action, and a full-width control here would
     spend the vertical space this whole change is meant to save. */
  const viewToggle = isPhone && !controlled ? (
    <div className="grid-view-pick">
      <div className="seg">
        <button className={phoneView === 'cards' ? 'is-on' : ''} onClick={() => setOwnView('cards')}>Cards</button>
        <button className={phoneView === 'list' ? 'is-on' : ''} onClick={() => setOwnView('list')}>List</button>
      </div>
    </div>
  ) : null

  if (isPhone && phoneView === 'cards') {
    // A column with no heading is an actions cell (Approve / Edit / Mark
    // paid). On a card those belong in a strip along the bottom, not in a
    // label/value pair with a blank label.
    const fields = cols.map((c, i) => ({ col: c, i })).filter(({ col }) => col.label.trim() !== '')
    const actions = cols.map((c, i) => ({ col: c, i })).filter(({ col }) => col.label.trim() === '')
    /* The heading of a card is the row's name, and the name column is always a
       wide one — the narrow leader in front of it is a row number ("#", 52px),
       which as a card heading reads as a card titled "1". So the title is the
       first column with room for a name in it, and anything narrower sitting
       in front of it becomes a small line above rather than being dropped. */
    const titleAt = Math.max(0, fields.findIndex(({ col }) => col.width >= 100))
    const lead = fields.slice(0, titleAt)
    const title = fields[titleAt]
    const detail = fields.slice(titleAt + 1)

    return (
      <div className="grid-shell">
        {viewToggle}
        <div className="grid-cards">
          {rows.length === 0 && <div className="grid-cards-empty">{empty ?? 'Nothing here yet.'}</div>}
          {rows.map((r, i) => {
            const extra = rowClass?.(r)
            const cls = ['grid-card', r.isNew ? 'is-new' : '', extra ?? '', onRowClick ? 'is-tap' : ''].filter(Boolean).join(' ')
            return (
              <div key={r.id} className={cls} onClick={onRowClick ? () => onRowClick(r) : undefined}>
                {(lead.length > 0 || title) && (
                  <div className="grid-card-head">
                    {lead.length > 0 && (
                      <div className="grid-card-lead">
                        {lead.map(({ col }) => (
                          <span key={col.key}>{col.label} {col.render(r, i)}</span>
                        ))}
                      </div>
                    )}
                    {title && <div className="grid-card-top">{title.col.render(r, i)}</div>}
                  </div>
                )}
                {detail.length > 0 && (
                  <div className="grid-card-fields">
                    {detail.map(({ col }) => (
                      <div className="grid-card-fld" key={col.key}>
                        <span className="l">{col.label}</span>
                        <span className="v">{col.render(r, i)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {actions.length > 0 && (
                  <div className="grid-card-acts">
                    {actions.map(({ col }) => <span key={col.key}>{col.render(r, i)}</span>)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {foot}
      </div>
    )
  }

  return (
    <div className={'grid-shell' + (isPhone ? ' grid-shell--list' : '')}>
      {viewToggle}
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
