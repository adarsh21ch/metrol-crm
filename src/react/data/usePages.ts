import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { demoPages, isDemo } from '@/data/demo'
import type { IncentivePageType, Page } from '@/lib/hr'

type Row = Record<string, unknown>

const toPage = (r: Row): Page => ({
  id: String(r.id),
  clientId: String(r.client_id),
  pageType: (r.page_type as IncentivePageType) ?? 'main',
  instagramHandle: String(r.instagram_handle ?? ''),
  label: String(r.label ?? ''),
  isActive: r.is_active !== false,
  createdAt: String(r.created_at ?? ''),
})

/**
 * One Instagram page per row, under a Client (0032). Realtime like
 * incentive_claims: an employee's own dashboard and a department head's
 * roster both want a fresh assignment or a new page to show up without a
 * reload.
 */
let channelSeq = 0

export function usePages(enabled = true) {
  const [rows, setRows] = useState<Page[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const fetched = useRef(false)

  const load = useCallback(async (force = false) => {
    if (!enabled) { setLoading(false); return }
    if (fetched.current && !force) { setLoading(false); return }
    fetched.current = true
    if (isDemo()) {
      setRows(demoPages)
      setLoading(false)
      return
    }
    const { data, error: err } = await supabase
      .from('pages').select('*').order('created_at', { ascending: true })
    if (err) { setError(err.message); setLoading(false); return }
    setRows((data ?? []).map((r) => toPage(r as Row)))
    setLoading(false)
  }, [enabled])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!enabled || isDemo()) return
    const channel = supabase.channel(`pages-live-${++channelSeq}`)
    try {
      channel
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pages' }, (p: any) => {
          const row = toPage(p.new as Row)
          setRows((prev) => (prev.some((r) => r.id === row.id) ? prev : [...prev, row]))
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pages' }, (p: any) => {
          const row = toPage(p.new as Row)
          setRows((prev) => prev.map((r) => (r.id === row.id ? row : r)))
        })
        .subscribe()
    } catch (e) {
      console.error('[Metrol CRM] pages realtime unavailable:', e)
    }
    return () => { void supabase.removeChannel(channel) }
  }, [enabled])

  const add = useCallback(async (draft: {
    clientId: string; pageType: IncentivePageType; instagramHandle?: string; label?: string
  }): Promise<string | null> => {
    if (isDemo()) {
      setRows((p) => [...p, {
        id: 'demo-page-' + (p.length + 1), clientId: draft.clientId, pageType: draft.pageType,
        instagramHandle: draft.instagramHandle?.trim() ?? '', label: draft.label?.trim() ?? '',
        isActive: true, createdAt: new Date().toISOString(),
      }])
      return null
    }
    const { data, error: err } = await supabase
      .from('pages').insert({
        client_id: draft.clientId, page_type: draft.pageType,
        instagram_handle: draft.instagramHandle?.trim() || null, label: draft.label?.trim() || null,
      }).select('*').single()
    if (err) return err.message
    if (data) setRows((p) => [...p, toPage(data as Row)])
    return null
  }, [])

  const update = useCallback(async (id: string, patch: { instagramHandle?: string; label?: string }): Promise<string | null> => {
    if (isDemo()) {
      setRows((p) => p.map((pg) => (pg.id === id ? { ...pg, ...patch } : pg)))
      return null
    }
    const row: Row = {}
    if (patch.instagramHandle !== undefined) row.instagram_handle = patch.instagramHandle.trim() || null
    if (patch.label !== undefined) row.label = patch.label.trim() || null
    const { error: err } = await supabase.from('pages').update(row).eq('id', id)
    if (err) return err.message
    setRows((p) => p.map((pg) => (pg.id === id ? { ...pg, ...patch } : pg)))
    return null
  }, [])

  /** Retires independently of its Client (Adarsh, 2026-09-22). */
  const setActive = useCallback(async (id: string, isActive: boolean): Promise<string | null> => {
    if (isDemo()) {
      setRows((p) => p.map((pg) => (pg.id === id ? { ...pg, isActive } : pg)))
      return null
    }
    const { error: err } = await supabase.from('pages').update({ is_active: isActive }).eq('id', id)
    if (err) return err.message
    setRows((p) => p.map((pg) => (pg.id === id ? { ...pg, isActive } : pg)))
    return null
  }, [])

  return { rows, loading, error, reload: () => load(true), add, update, setActive, clearError: () => setError(null) }
}

export type Pages = ReturnType<typeof usePages>
