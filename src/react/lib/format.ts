const inr = new Intl.NumberFormat('en-IN')

export const money = (n: number) => '₹' + inr.format(Math.round(n || 0))
export const num = (n: number) => inr.format(n || 0)

export function pct(a: number, b: number) {
  if (!b) return '0%'
  return Math.round((a / b) * 100) + '%'
}

/**
 * "1 lead", "2 leads". Every count in this app is written by hand, and with a
 * hundred-odd sample rows nobody ever saw the singular — a real project that
 * opens with six leads and one sale says "1 closed deals" and "1 payments
 * pending" on its first day, which is exactly the kind of thing that reads as
 * unfinished. Pass a second form for words English does not pluralise with s.
 */
export const plural = (n: number, one: string, many = one + 's') =>
  n === 1 ? one : many

/** The count and its noun together, the way most of these read. */
export const count = (n: number, one: string, many?: string) =>
  num(n) + ' ' + plural(n, one, many)

export function initials(name: string) {
  return String(name || '?')
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
}

const DAY = 86400000
export const daysSince = (iso: string | null) =>
  iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY)) : 0

/** The prototype's wording, so a closed deal reads the same as it always did. */
export function agoDays(d: number) {
  if (d === 0) return 'Today'
  if (d === 1) return 'Yesterday'
  if (d < 7) return d + ' days ago'
  if (d < 31) return Math.round(d / 7) + ' weeks ago'
  return Math.round(d / 30) + ' months ago'
}

export function agoWords(iso: string | null) {
  if (!iso) return 'just now'
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 3600) { const m = Math.max(1, Math.round(s / 60)); return count(m, 'minute') + ' ago' }
  if (s < 86400) { const h = Math.round(s / 3600); return count(h, 'hour') + ' ago' }
  if (s < 172800) return 'Yesterday'
  if (s < 604800) { const d = Math.round(s / 86400); return count(d, 'day') + ' ago' }
  return 'Last week'
}

export function fmtWhen(ms: number) {
  const d = new Date(ms)
  return (
    d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) +
    ', ' +
    d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
  )
}
