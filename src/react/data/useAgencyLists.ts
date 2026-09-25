import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { demoAdjustmentTypes, demoClientStatuses, demoPageStatuses, isDemo } from '@/data/demo'
import { loadTable, newId, str, type Row } from '@/data/agencySchema'
import type { ListItem, Tone } from '@/lib/agency'

/** The three small lists management edits instead of asking for a deploy:
 *  client statuses and page statuses (0036), adjustment types (0037). */
export type ListKind = 'client_statuses' | 'page_statuses' | 'view_adjustment_types'

const toItem = (r: Row): ListItem => ({
  id: str(r.id),
  name: str(r.name),
  // view_adjustment_types has no colour of its own.
  tone: (r.tone as Tone) ?? 'mute',
  sortOrder: Number(r.sort_order) || 0,
  isActive: r.is_active !== false,
})

const byOrder = (a: ListItem, b: ListItem) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)

export function useAgencyLists(enabled = true) {
  const [lists, setLists] = useState<Record<ListKind, ListItem[]>>({
    client_statuses: [], page_statuses: [], view_adjustment_types: [],
  })
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const fetched = useRef(false)

  const load = useCallback(async (force = false) => {
    if (!enabled) { setLoading(false); return }
    if (fetched.current && !force) { setLoading(false); return }
    fetched.current = true
    if (isDemo()) {
      setLists({ client_statuses: demoClientStatuses, page_statuses: demoPageStatuses, view_adjustment_types: demoAdjustmentTypes })
      setLoading(false)
      return
    }
    const [c, p, a] = await Promise.all([
      loadTable('client_statuses', toItem),
      loadTable('page_statuses', toItem),
      loadTable('view_adjustment_types', toItem),
    ])
    setError(c.error ?? p.error ?? a.error)
    setLists({
      client_statuses: c.rows.sort(byOrder),
      page_statuses: p.rows.sort(byOrder),
      view_adjustment_types: a.rows.sort(byOrder),
    })
    setLoading(false)
  }, [enabled])

  useEffect(() => { void load() }, [load])

  const save = useCallback(async (kind: ListKind, id: string | null, patch: { name: string; tone: Tone; isActive: boolean }): Promise<string | null> => {
    if (!patch.name.trim()) return 'Give it a name.'
    const current = lists[kind]
    const row: Row = { name: patch.name.trim(), is_active: patch.isActive }
    if (kind !== 'view_adjustment_types') row.tone = patch.tone
    if (!id) row.sort_order = (current.reduce((m, x) => Math.max(m, x.sortOrder), 0) || 0) + 1
    if (isDemo()) {
      const item: ListItem = id
        ? { ...current.find((x) => x.id === id)!, name: patch.name.trim(), tone: patch.tone, isActive: patch.isActive }
        : { id: newId('li'), name: patch.name.trim(), tone: patch.tone, isActive: true, sortOrder: Number(row.sort_order) }
      setLists((p) => ({ ...p, [kind]: id ? p[kind].map((x) => (x.id === id ? item : x)) : [...p[kind], item] }))
      return null
    }
    const q = id ? supabase.from(kind).update(row).eq('id', id) : supabase.from(kind).insert(row)
    const { data, error: err } = await q.select('*').single()
    if (err) return err.code === '23505' ? 'That name is already on the list.' : err.message
    if (!data) return 'You do not have permission to change this list.'
    const item = toItem(data as Row)
    setLists((p) => ({ ...p, [kind]: id ? p[kind].map((x) => (x.id === id ? item : x)) : [...p[kind], item] }))
    return null
  }, [lists])

  return { ...lists, loading, error, reload: () => load(true), save }
}

export type AgencyLists = ReturnType<typeof useAgencyLists>
