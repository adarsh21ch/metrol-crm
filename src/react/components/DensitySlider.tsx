import { ROW_STEPS, useDensity } from '@/lib/useDensity'

/**
 * The Compact / Comfortable pair as a range instead. Two buttons could only
 * ever offer two heights; this offers the two they had plus a tighter and a
 * looser end, without adding a second control to learn.
 *
 * Uncontrolled on purpose. `onChange` fires on every step in React (it maps to
 * the DOM's `input` event), and it writes straight to a CSS custom property —
 * no React state, so no fifty-row table re-rendering under the drag. The value
 * is only persisted when the pointer is released.
 */
export function DensitySlider() {
  const { step, apply, commit } = useDensity()

  return (
    <div className="density" id="density" title="Row height">
      {/* Three lines close together, then the same three spread out. */}
      <svg className="density-ic" width="13" height="13" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M4 9h16M4 12h16M4 15h16" />
      </svg>
      <input
        type="range" min={0} max={ROW_STEPS.length - 1} step={1} defaultValue={step}
        aria-label="Row height"
        onChange={(e) => apply(Number(e.target.value))}
        onPointerUp={(e) => commit(Number((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => commit(Number((e.target as HTMLInputElement).value))}
      />
      {/* Same three lines, further apart — the control explains itself. */}
      <svg className="density-ic" width="13" height="13" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M4 4h16M4 12h16M4 20h16" />
      </svg>
    </div>
  )
}
