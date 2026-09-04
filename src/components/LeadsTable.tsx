import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export interface Column<T> {
  key: string
  label: string
  width: number
  min?: number
  render: (row: T) => React.ReactNode
}

/**
 * Column resizing, with the three things the prototype had to learn the hard way:
 *
 *  1. The widths array is the only source of truth. The table is never given
 *     min-width:100%, because the browser then redistributes every column and
 *     the drag stops being 1:1 with the cursor.
 *  2. Slack goes to the last column alone, so the other widths survive it.
 *  3. The grab strip runs the full height of the grid, so a column can be taken
 *     from any row, not just the header.
 */
export function DataTable<T extends { id: string }>({
  columns,
  rows,
  empty = 'Nothing here yet.',
  storageKey,
}: {
  columns: Column<T>[]
  rows: T[]
  empty?: string
  storageKey?: string
}) {
  const [widths, setWidths] = useState<number[]>(() => {
    if (storageKey) {
      try {
        const saved = localStorage.getItem('metrol-cols-' + storageKey)
        if (saved) {
          const parsed = JSON.parse(saved)
          if (Array.isArray(parsed) && parsed.length === columns.length) return parsed
        }
      } catch {
        /* fall through to the defaults */
      }
    }
    return columns.map((c) => c.width)
  })

  const wrapRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ i: number; startX: number; startW: number } | null>(null)
  const [guideX, setGuideX] = useState<number | null>(null)

  useEffect(() => {
    if (!storageKey) return
    try {
      localStorage.setItem('metrol-cols-' + storageKey, JSON.stringify(widths))
    } catch {
      /* a width that does not persist is not worth breaking the drag over */
    }
  }, [widths, storageKey])

  const onDown = useCallback(
    (i: number) => (e: React.PointerEvent) => {
      e.preventDefault()
      drag.current = { i, startX: e.clientX, startW: widths[i]! }
      document.body.classList.add('is-resizing')
      setGuideX(e.clientX)
    },
    [widths],
  )

  useEffect(() => {
    function move(e: PointerEvent) {
      const d = drag.current
      if (!d) return
      const min = columns[d.i]?.min ?? 72
      const next = Math.max(min, d.startW + (e.clientX - d.startX))
      setWidths((w) => {
        const copy = [...w]
        copy[d.i] = next
        return copy
      })
      // The guide is positioned in viewport coordinates. Anchoring it inside the
      // scroller made it drift by the scroll offset on the earlier build.
      setGuideX(e.clientX)
    }
    function up() {
      if (!drag.current) return
      drag.current = null
      document.body.classList.remove('is-resizing')
      setGuideX(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [columns])

  const total = widths.reduce((a, b) => a + b, 0)

  return (
    <div className="relative">
      <div ref={wrapRef} className="overflow-x-auto rounded border border-line bg-surface">
        <table className="border-collapse text-sm" style={{ width: total }}>
          <colgroup>
            {widths.map((w, i) => (
              <col key={columns[i]!.key} style={{ width: w }} />
            ))}
          </colgroup>
          <thead>
            <tr className="bg-surface-2">
              {columns.map((c, i) => (
                <th
                  key={c.key}
                  className="relative border-b border-line px-3 py-2 text-left text-[12px] font-semibold uppercase tracking-wide text-ink-3"
                >
                  <span className="block truncate">{c.label}</span>
                  {i < columns.length - 1 && (
                    <span
                      onPointerDown={onDown(i)}
                      title="Drag to resize"
                      className="absolute right-0 top-0 z-10 h-full w-[9px] translate-x-[4px] cursor-col-resize touch-none
                                 after:absolute after:right-[4px] after:top-0 after:h-full after:w-px after:bg-line
                                 hover:after:bg-accent hover:after:w-[2px]"
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-10 text-center text-ink-3">
                  {empty}
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-line-2 last:border-0 hover:bg-surface-2">
                {columns.map((c) => (
                  <td key={c.key} className="px-3 py-2 align-middle">
                    <div className="truncate">{c.render(row)}</div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {guideX !== null && (
        <div
          className="pointer-events-none fixed top-0 z-50 h-screen w-px bg-accent"
          style={{ left: guideX }}
        />
      )}
    </div>
  )
}

export const cellMuted = (v: string | null) =>
  v ? <span className="text-ink-2">{v}</span> : <span className={cn('text-ink-3')}>—</span>
