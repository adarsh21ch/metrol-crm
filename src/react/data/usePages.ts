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
  statusId: (r.status_id as string | null) ?? null,
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
        isActive: true, createdAt: new Date().toISOString(), statusId: null,
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

  /** A page with its channels, for the client page (0036). The page row goes
   *  in first, then its channels — page_channels' trigger fills the page's
   *  own instagram_handle, so the Edge Functions keep reading the same column. */
  const create = useCallback(async (draft: {
    clientId: string; pageType: IncentivePageType; label: string
  }): Promise<{ error: string | null; id: string | null }> => {
    if (isDemo()) {
      const id = 'demo-page-' + Date.now().toString(36)
      setRows((p) => [...p, {
        id, clientId: draft.clientId, pageType: draft.pageType, instagramHandle: '', label: draft.label.trim(),
        isActive: true, createdAt: new Date().toISOString(), statusId: null,
      }])
      return { error: null, id }
    }
    const { data, error: err } = await supabase
      .from('pages').insert({ client_id: draft.clientId, page_type: draft.pageType, label: draft.label.trim() || null })
      .select('*').single()
    if (err) return { error: err.message, id: null }
    const row = toPage(data as Row)
    setRows((p) => [...p, row])
    return { error: null, id: row.id }
  }, [])

  /** The sheet's red / orange row, and anything else about a page that is
   *  not its handle. */
  const updateMeta = useCallback(async (id: string, patch: { label?: string; pageType?: IncentivePageType; statusId?: string | null }): Promise<string | null> => {
    const row: Row = {}
    if (patch.label !== undefined) row.label = patch.label.trim() || null
    if (patch.pageType !== undefined) row.page_type = patch.pageType
    if (patch.statusId !== undefined) row.status_id = patch.statusId
    if (isDemo()) {
      setRows((p) => p.map((pg) => (pg.id === id ? { ...pg, ...patch, label: patch.label?.trim() ?? pg.label } : pg)))
      return null
    }
    const { data, error: err } = await supabase.from('pages').update(row).eq('id', id).select('*').single()
    if (err) return err.message
    if (!data) return 'You do not have permission to change this page.'
    setRows((p) => p.map((pg) => (pg.id === id ? toPage(data as Row) : pg)))
    return null
  }, [])

  /** page_channels' trigger rewrites pages.instagram_handle; this is how the
   *  list hears about it without a reload. */
  const patchLocal = useCallback((id: string, patch: Partial<Page>) => {
    setRows((p) => p.map((pg) => (pg.id === id ? { ...pg, ...patch } : pg)))
  }, [])

  return { rows, loading, error, reload: () => load(true), add, update, setActive, create, updateMeta, patchLocal, clearError: () => setError(null) }
}

export type Pages = ReturnType<typeof usePages>
