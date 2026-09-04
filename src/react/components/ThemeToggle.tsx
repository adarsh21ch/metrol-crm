import { useTheme } from '@/lib/useTheme'

const MOON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
       strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
)
const SUN = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2.6v2.2M12 19.2v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.6 12h2.2M19.2 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" />
  </svg>
)

export function ThemeToggle() {
  const { resolved, toggle } = useTheme()
  const to = resolved === 'dark' ? 'light' : 'dark'
  return (
    <button className="icon-btn" onClick={toggle} title={`Switch to ${to} mode`} aria-label={`Switch to ${to} mode`}>
      {resolved === 'dark' ? SUN : MOON}
    </button>
  )
}
