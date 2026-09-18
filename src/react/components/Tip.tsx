import { useOneTimeTip } from '@/lib/useOneTimeTip'

/**
 * A permanent line of copy, downgraded to something you see once. "Why would
 * we permanently show there? We can show in the notification top bar kind of
 * thing. They click on cross button, that's it" — Adarsh, 2026-09-18, meant
 * as a general rule for disclaimer/instructional text, not just the one line
 * on Attendance it was said about.
 *
 * Reuses .banner (the same box "N leads assigned to you" already uses)
 * rather than inventing a second notice style.
 */
export function Tip({ tipKey, children }: { tipKey: string; children: React.ReactNode }) {
  const [dismissed, dismiss] = useOneTimeTip(tipKey)
  if (dismissed) return null
  return (
    <div className="banner banner--tip">
      <div className="d">{children}</div>
      <button className="icon-btn" aria-label="Dismiss" onClick={dismiss}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
