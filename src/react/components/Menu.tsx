import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface MenuItem {
  value: string
  label?: string
  cls?: string
  node?: React.ReactNode
}

/**
 * The prototype's dropdown: anchored to the element that opened it, flipped
 * above when it would fall off the bottom, and closed by any click outside.
 * It renders in a portal because a table cell is a poor place to hang a
 * floating layer from — the grid scroller would clip it.
 */
export function Menu({
  anchor, items, current, onPick, onClose,
}: {
  anchor: HTMLElement
  items: MenuItem[]
  current?: string | null
  onPick: (value: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = anchor.getBoundingClientRect()
    let top = r.bottom + 6
    if (top + el.offsetHeight > window.innerHeight - 10) top = r.top - el.offsetHeight - 6
    setPos({
      top: Math.max(10, top),
      left: Math.min(r.left, window.innerWidth - el.offsetWidth - 12),
    })
  }, [anchor])

  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    // A click that lands in the same tick that opened the menu would close it.
    const t = setTimeout(() => document.addEventListener('click', away), 0)
    window.addEventListener('resize', onClose)
    return () => {
      clearTimeout(t)
      document.removeEventListener('click', away)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  return createPortal(
    <div
      className="menu"
      ref={ref}
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, visibility: pos ? 'visible' : 'hidden' }}
    >
      {items.map((it) => (
        <button key={it.value} className={it.value === current ? 'is-on' : ''} onClick={() => { onPick(it.value); onClose() }}>
          {it.node ?? <span className={'chip ' + (it.cls ?? '')}>{it.label}</span>}
          <svg className="tick" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
        </button>
      ))}
    </div>,
    document.body,
  )
}
