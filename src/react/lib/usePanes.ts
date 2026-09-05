import { useCallback, useEffect, useRef, useState } from 'react'

/* The prototype's numbers, unchanged. */
export const RAIL_MIN = 56, RAIL_MAX = 300, RAIL_DEF = 64, RAIL_WIDE = 132
export const SIDE_MIN = 168, SIDE_MAX = 380, SIDE_DEF = 214
export const SIDE_SNAP = 150, SIDE_MINI = 64

const get = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const set = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* preferences only */ } }

/**
 * Widths live in CSS custom properties, not in React state that every child
 * re-reads — the grid measures itself off the real layout, so the DOM has to be
 * the source of truth during a drag or the two disagree mid-gesture.
 *
 * Dragging is the primary gesture: pull the sidebar edge past SIDE_SNAP and it
 * folds to icons by itself; pull it back and it opens. The chevron does the
 * same in one click for anyone who would rather not drag.
 */
export function usePanes() {
  const [railWide, setRailWide] = useState(false)
  const [sideMini, setSideMini] = useState(() => get('metrol-crm-side-mini') === '1')

  const applyRail = useCallback((w: number) => {
    const v = Math.max(RAIL_MIN, Math.min(RAIL_MAX, Math.round(w)))
    document.documentElement.style.setProperty('--rail-w', v + 'px')
    setRailWide(v >= RAIL_WIDE)
    return v
  }, [])

  const applySide = useCallback((w: number) => {
    if (w < SIDE_SNAP) { setSideMini(true); return SIDE_MINI }
    setSideMini(false)
    const v = Math.max(SIDE_MIN, Math.min(SIDE_MAX, Math.round(w)))
    document.documentElement.style.setProperty('--side-w', v + 'px')
    return v
  }, [])

  useEffect(() => {
    const r = parseInt(get('metrol-crm-rail-w') ?? '', 10)
    const d = parseInt(get('metrol-crm-side-w') ?? '', 10)
    applyRail(Number.isNaN(r) ? RAIL_DEF : r)
    // Not applySide(d) here: applySide derives sideMini from the width
    // threshold, which would stomp the mini flag this hook already read
    // correctly from storage in its own useState initializer above — folding
    // the sidebar, then reloading, silently unfolded it again. --side-w only
    // matters once it's not mini, and .is-mini's width:64px wins over the CSS
    // var by specificity regardless, so writing the var directly is enough.
    const w = Math.max(SIDE_MIN, Math.min(SIDE_MAX, Number.isNaN(d) ? SIDE_DEF : d))
    document.documentElement.style.setProperty('--side-w', w + 'px')
  }, [applyRail])

  useEffect(() => { set('metrol-crm-side-mini', sideMini ? '1' : '0') }, [sideMini])

  const dragging = useRef(false)

  /** Returns a pointerdown handler for a .pane-rz strip. */
  const dragHandle = useCallback(
    (which: 'rail' | 'side') => (e: React.PointerEvent<HTMLSpanElement>) => {
      e.preventDefault()
      const strip = e.currentTarget
      const pane = strip.parentElement as HTMLElement
      const startX = e.clientX
      const startW = pane.getBoundingClientRect().width
      let frame = 0
      let latest = startW
      try { strip.setPointerCapture(e.pointerId) } catch { /* older engines */ }
      strip.classList.add('is-drag')
      document.body.classList.add('is-resizing')
      dragging.current = true

      const move = (ev: PointerEvent) => {
        const w = startW + (ev.clientX - startX)
        if (frame) return
        frame = requestAnimationFrame(() => {
          frame = 0
          latest = which === 'rail' ? applyRail(w) : applySide(w)
          window.dispatchEvent(new Event('resize'))   // grids re-measure their slack
        })
      }
      const up = () => {
        dragging.current = false
        if (frame) cancelAnimationFrame(frame)
        strip.classList.remove('is-drag')
        document.body.classList.remove('is-resizing')
        set(which === 'rail' ? 'metrol-crm-rail-w' : 'metrol-crm-side-w', String(latest))
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', up)
        window.dispatchEvent(new Event('resize'))
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', up)
    },
    [applyRail, applySide],
  )

  const resetPane = useCallback(
    (which: 'rail' | 'side') => () => {
      const w = which === 'rail' ? applyRail(RAIL_DEF) : applySide(SIDE_DEF)
      set(which === 'rail' ? 'metrol-crm-rail-w' : 'metrol-crm-side-w', String(w))
      window.dispatchEvent(new Event('resize'))
    },
    [applyRail, applySide],
  )

  const toggleRail = useCallback(() => {
    const w = applyRail(railWide ? RAIL_DEF : 208)
    set('metrol-crm-rail-w', String(w))
    window.dispatchEvent(new Event('resize'))
  }, [railWide, applyRail])

  const toggleSide = useCallback(() => {
    setSideMini((m) => {
      if (m) applySide(parseInt(get('metrol-crm-side-w') ?? '', 10) || SIDE_DEF)
      return !m
    })
    window.dispatchEvent(new Event('resize'))
  }, [applySide])

  return { railWide, sideMini, dragHandle, resetPane, toggleRail, toggleSide }
}
