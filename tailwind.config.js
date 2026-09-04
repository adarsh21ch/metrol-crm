/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Every colour resolves to a CSS variable, so the light/dark swap happens
      // in one place (index.css) and never as a second set of Tailwind classes.
      colors: {
        ground: 'var(--ground)',
        surface: { DEFAULT: 'var(--surface)', 2: 'var(--surface-2)', 3: 'var(--surface-3)' },
        ink: { DEFAULT: 'var(--ink)', 2: 'var(--ink-2)', 3: 'var(--ink-3)' },
        line: { DEFAULT: 'var(--line)', 2: 'var(--line-2)' },
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          on: 'var(--accent-on)',
          soft: 'var(--accent-soft)',
          line: 'var(--accent-line)',
          ink: 'var(--accent-ink)',
        },
        pri: { DEFAULT: 'var(--pri)', hover: 'var(--pri-hover)', on: 'var(--pri-on)' },
        good: { DEFAULT: 'var(--good)', soft: 'var(--good-soft)', line: 'var(--good-line)' },
        warn: { DEFAULT: 'var(--warn)', soft: 'var(--warn-soft)', line: 'var(--warn-line)' },
        bad: { DEFAULT: 'var(--bad)', soft: 'var(--bad-soft)', line: 'var(--bad-line)' },
      },
      fontFamily: {
        sans: ['IBM Plex Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Archivo', 'IBM Plex Sans', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'Menlo', 'monospace'],
      },
      borderRadius: { DEFAULT: 'var(--r)', md: 'var(--r)' },
      boxShadow: { sm: 'var(--shadow-sm)', md: 'var(--shadow-md)', lg: 'var(--shadow-lg)' },
    },
  },
  plugins: [],
}
