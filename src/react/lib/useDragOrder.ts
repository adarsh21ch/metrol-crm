import { useRef, useState } from 'react'

/**
 * Drag a row by its handle to reorder a short list — mouse, finger and pen
 * alike. Pointer events, not HTML drag-and-drop: that one does nothing on a
 * phone. The rows move while the pointer crosses them, so what is on screen
 * is exactly the order that will be saved; letting go hands it to `onDrop`
 * (only if something moved). Arrow keys on a focused handle move a row one
 * place, for anyone not dragging.
 *
 * Each row carries `data-drag-id` and lives inside `listRef`.
 */
export function useDragOrder(ids: string[], onDrop: (ids: string[]) => void) {
  const listRef = useRef<HTMLDivElement>(null)
  const [preview, setPreview] = useState<string[] | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  // Move events outrun renders; the live values are read from here.
  const live = useRef<{ id: string; order: string[] } | null>(null)

  const finish = (commit: boolean) => {
    const cur = live.current
    live.current = null
    setDragging(null)
    setPreview(null)
    if (commit && cur && cur.order.join() !== ids.join()) onDrop(cur.order)
  }

  const refocus = (id: string) => requestAnimationFrame(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-drag-id="${id}"] [data-drag-handle]`)?.focus()
  })

  const handle = (id: string) => ({
    'data-drag-handle': '',
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      live.current = { id, order: ids }
      setDragging(id)
      setPreview(ids)
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const cur = live.current
      if (!cur || cur.id !== id || !listRef.current) return
      // Where it lands: after every other row whose middle is above the pointer.
      const others = [...listRef.current.querySelectorAll<HTMLElement>('[data-drag-id]')]
        .filter((row) => row.dataset.dragId !== id)
      let at = 0
      for (const row of others) {
        const r = row.getBoundingClientRect()
        if (e.clientY > r.top + r.height / 2) at++
      }
      const next = cur.order.filter((x) => x !== id)
      next.splice(at, 0, id)
      if (next.join() !== cur.order.join()) {
        live.current = { id, order: next }
        setPreview(next)
      }
    },
    onPointerUp: () => finish(true),
    onPointerCancel: () => finish(false),
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
      e.preventDefault()
      const from = ids.indexOf(id)
      const to = from + (e.key === 'ArrowUp' ? -1 : 1)
      if (from < 0 || to < 0 || to >= ids.length) return
      const next = [...ids]
      next.splice(from, 1)
      next.splice(to, 0, id)
      onDrop(next)
      refocus(id)
    },
  })

  return { listRef, order: preview ?? ids, dragging, handle }
}
