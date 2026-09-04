import { useCallback, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * One tooltip node, fixed to the viewport. It used to live inside each button,
 * which worked in the sidebar but not the projects rail: .rail-list is a
 * scroller, and a scroller clips, so the rail's tooltip was cut off at 64px the
 * moment it tried to sit beside the icon. Nothing can clip this one.
 */
export function useHoverTip() {
  const [tip, setTip] = useState<{ text: string; top: number; left: number } | null>(null)
  const raf = useRef(0)

  const bind = useCallback((text: string) => ({
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      const r = e.currentTarget.getBoundingClientRect()
      cancelAnimationFrame(raf.current)
      raf.current = requestAnimationFrame(() => {
        // Flip to the left when the label would run off the right edge.
        const wouldOverflow = r.right + 12 + text.length * 7 > window.innerWidth
        setTip({
          text,
          top: r.top + r.height / 2 - 12,
          left: wouldOverflow ? Math.max(8, r.left - text.length * 7 - 18) : r.right + 10,
        })
      })
    },
    onMouseLeave: () => { cancelAnimationFrame(raf.current); setTip(null) },
  }), [])

  const node = tip
    ? createPortal(
        <div className="hover-tip is-on" style={{ top: tip.top, left: tip.left }}>{tip.text}</div>,
        document.body,
      )
    : null

  return { bind, node }
}
