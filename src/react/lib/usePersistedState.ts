import { useState } from 'react'

/**
 * Same shape as useState, but the value survives a page refresh.
 *
 * Every screen in this app is "screen-based, like the prototype" (App.tsx's
 * own words) — which tab or section you're on lives only in React state, so
 * refreshing the page used to always throw it away and land back on
 * whatever the default was, no matter which tab you were actually reading.
 * This is the fix: the value is mirrored into sessionStorage on every
 * change and read back on mount, so a refresh on Salary reopens Salary, a
 * refresh on somebody's Attendance tab reopens that same tab.
 *
 * sessionStorage on purpose, not localStorage — this is "the tab I was just
 * on", not a permanent preference that should follow you into a brand new
 * tab or a different device days later. It also does not touch the URL, so
 * it changes nothing about the back button or bookmarking, which is exactly
 * what App.tsx's own comment says a real router would have put at risk.
 */
export function usePersistedState<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const storageKey = 'metrol:' + key

  const [state, setState] = useState<T>(() => {
    if (typeof window === 'undefined') return initial
    try {
      const raw = window.sessionStorage.getItem(storageKey)
      return raw === null ? initial : (JSON.parse(raw) as T)
    } catch {
      // Corrupt JSON, or storage blocked (private mode, quota) — the
      // default is always a safe fallback, never a crash.
      return initial
    }
  })

  const set = (v: T | ((prev: T) => T)) => {
    setState((prev) => {
      const next = typeof v === 'function' ? (v as (prev: T) => T)(prev) : v
      try { window.sessionStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* private mode, quota — the tab still works, it just won't remember */ }
      return next
    })
  }

  return [state, set]
}

/** Set another screen's remembered value before it opens — how a rail link on
 *  Projects lands on HR's Salary section: HrPage reads this on mount. */
export function setPersisted<T>(key: string, value: T) {
  try { window.sessionStorage.setItem('metrol:' + key, JSON.stringify(value)) } catch { /* private mode — the screen opens on its default */ }
}
