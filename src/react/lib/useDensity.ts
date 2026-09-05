import { useCallback, useEffect, useState } from 'react'

/**
 * Row height as a range rather than two buttons.
 *
 * Stops, not free dragging. The floor is real: an avatar and an editable chip
 * are 26px, so under ~32px they start touching the row's own borders and the
 * table reads as broken; over ~56px it is just wasted screen. Six stops span
 * that honestly, and snapping means the control cannot be left somewhere that
 * looks like a bug.
 *
 * DEF is the middle-ish stop on purpose: it is exactly the 38px the old
 * Compact button gave, so nobody's table moves until they touch this.
 */
export const ROW_STEPS = [32, 35, 38, 44, 48, 56]
export const DENSITY_DEF = 2          // 38px — what Compact always was
const COMFORTABLE = 4                 // 48px — what Comfortable always was

const KEY = 'metrol-crm-density'
const OLD_KEY = 'metrol-crm-dense'    // the two-button era: 'compact' | 'comfortable'

const clamp = (i: number) => Math.max(0, Math.min(ROW_STEPS.length - 1, i))

/** Reads the new key, falling back to the old two-button preference so anyone
 *  who had picked Comfortable lands on the same 48px they already had. */
function stored(): number {
  try {
    const n = parseInt(localStorage.getItem(KEY) ?? '', 10)
    if (!Number.isNaN(n)) return clamp(n)
    return localStorage.getItem(OLD_KEY) === 'comfortable' ? COMFORTABLE : DENSITY_DEF
  } catch {
    return DENSITY_DEF
  }
}

/**
 * The height lives in a CSS custom property, not in React state — dragging the
 * slider must not re-render a fifty-row table on every pixel. Same division of
 * labour usePanes uses for the sidebars: the DOM is the truth while the gesture
 * is happening, localStorage gets it once on release.
 */
export function useDensity() {
  const [step] = useState(stored)

  const apply = useCallback((i: number) => {
    document.documentElement.style.setProperty('--row-h', ROW_STEPS[clamp(i)] + 'px')
  }, [])

  // On mount, and again if the whole screen remounts — the property lives on
  // <html>, so it survives navigation between screens on its own.
  useEffect(() => { apply(step) }, [apply, step])

  const commit = useCallback((i: number) => {
    try { localStorage.setItem(KEY, String(clamp(i))) } catch { /* a reading preference */ }
    // Grids re-measure their slack; nothing here changes a column width, but a
    // taller row can add or remove the vertical scrollbar, which changes it.
    window.dispatchEvent(new Event('resize'))
  }, [])

  return { step, apply, commit }
}
