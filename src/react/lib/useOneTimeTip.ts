import { useState } from 'react'

const PREFIX = 'metrol-crm-tip-'

/**
 * "Did they need this text again after the first time? No, right?" — Adarsh,
 * 2026-09-18, about the permanent helper line on Attendance. PunchCard had
 * already solved exactly this for its own three paragraphs of rules (a
 * one-time popup, then an ⓘ button); this is that same idea, generalised so
 * any screen can turn a permanent line of copy into something shown once.
 *
 * localStorage, not sessionStorage: once dismissed it should stay dismissed
 * in a new tab tomorrow, not just for this session — a permanent preference,
 * the same reasoning usePersistedState's own comment draws for the opposite
 * case.
 */
export function useOneTimeTip(key: string): [boolean, () => void] {
  const storageKey = PREFIX + key
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false
    try { return window.localStorage.getItem(storageKey) === '1' } catch { return false }
  })
  const dismiss = () => {
    setDismissed(true)
    try { window.localStorage.setItem(storageKey, '1') } catch { /* private mode — it just re-shows next time */ }
  }
  return [dismissed, dismiss]
}
