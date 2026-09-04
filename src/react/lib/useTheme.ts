import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark' | 'system'
const KEY = 'metrol-crm-theme'

const read = (): Theme => {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    // Private windows and blocked site data both throw; following the device is fine.
    return 'system'
  }
}

/** Three states are kept alive: explicit light, explicit dark, and no attribute
 *  at all, which means "follow the device". */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(read)

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
    try {
      if (theme === 'system') localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, theme)
    } catch { /* the stamp applied; only persistence is lost */ }
  }, [theme])

  const resolved: 'light' | 'dark' =
    theme !== 'system'
      ? theme
      : typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'

  const toggle = useCallback(() => setTheme(resolved === 'dark' ? 'light' : 'dark'), [resolved])
  return { theme, resolved, setTheme, toggle }
}
