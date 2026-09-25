import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { demoPageChannels, isDemo } from '@/data/demo'
import { loadTable, newId, str, type Row } from '@/data/agencySchema'
import { channelUrl, type PageChannel, type Platform } from '@/lib/agency'

const toChannel = (r: Row): PageChannel => ({
  id: str(r.id),
  pageId: str(r.page_id),
  platform: (r.platform as Platform) ?? 'instagram',
  handle: str(r.handle),
  url: str(r.url),
  isActive: r.is_active !== false,
  createdAt: str(r.created_at),
})

/**
 * The Instagram / YouTube / Facebook accounts behind each page (0036) — the
 * Client Master puts an Instagram page AND a YouTube channel on one numbered
 * fan page. Readable by everyone, like pages. Retired, never deleted: a
 * channel's weekly numbers hang off it.
 *
 * `onPageHandle` tells the page list when an Instagram channel changed the
 * page's own handle (the database keeps pages.instagram_handle in step with
 * the live Instagram channel, for the Edge Functions that still read it).
 */
export function usePageChannels(enabled = true, onPageHandle?: (pageId: string, handle: string) => void) {
  const [rows, setRows] = useState<PageChannel[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const fetched = useRef(false)
  const rowsRef = useRef<PageChannel[]>([])
  useEffect(() => { rowsRef.current = rows }, [rows])
  const onHandle = useRef(onPageHandle)
  useEffect(() => { onHandle.current = onPageHandle }, [onPageHandle])

  const load = useCallback(async (force = false) => {
    if (!enabled) { setLoading(false); return }
    if (fetched.current && !force) { setLoading(false); return }
    fetched.current = true
    if (isDemo()) { setRows(demoPageChannels); setLoading(false); return }
    const r = await loadTable('page_channels', toChannel, (q) => q.order('created_at', { ascending: true }))
    setError(r.error)
    setRows(r.rows)
    setLoading(false)
  }, [enabled])

  useEffect(() => { void load() }, [load])

  const liveIgHandle = (list: PageChannel[], pageId: string) =>
    list.find((c) => c.pageId === pageId && c.platform === 'instagram' && c.isActive)?.handle ?? ''

  /** One live channel per platform per page: saving a platform the page
   *  already has edits that channel rather than adding a second. Returns the
   *  channel's id, for a caller (the sheet import) that fills it straight away. */
  const ensure = useCallback(async (pageId: string, platform: Platform, handle: string, url: string): Promise<{ error: string | null; id: string | null }> => {
    const clean = handle.trim()
    if (!clean) return { error: 'Give the channel a handle or a name.', id: null }
    const link = channelUrl(platform, clean, url)
    const existing = rowsRef.current.find((c) => c.pageId === pageId && c.platform === platform && c.isActive)
    if (isDemo()) {
      const id = existing?.id ?? newId('ch')
      const next = existing
        ? rowsRef.current.map((c) => (c.id === existing.id ? { ...c, handle: clean, url: link } : c))
        : [...rowsRef.current, { id, pageId, platform, handle: clean, url: link, isActive: true, createdAt: new Date().toISOString() }]
      rowsRef.current = next
      setRows(next)
      if (platform === 'instagram') onHandle.current?.(pageId, liveIgHandle(next, pageId))
      return { error: null, id }
    }
    const q = existing
      ? supabase.from('page_channels').update({ handle: clean, url: link }).eq('id', existing.id)
      : supabase.from('page_channels').insert({ page_id: pageId, platform, handle: clean, url: link })
    const { data, error: err } = await q.select('*').single()
    if (err) return { error: err.message, id: null }
    if (!data) return { error: 'You do not have permission to change this page.', id: null }
    const saved = toChannel(data as Row)
    const next = existing ? rowsRef.current.map((c) => (c.id === saved.id ? saved : c)) : [...rowsRef.current, saved]
    rowsRef.current = next
    setRows(next)
    if (platform === 'instagram') onHandle.current?.(pageId, liveIgHandle(next, pageId))
    return { error: null, id: saved.id }
  }, [])

  const save = useCallback(async (pageId: string, platform: Platform, handle: string, url: string): Promise<string | null> =>
    (await ensure(pageId, platform, handle, url)).error, [ensure])

  const retire = useCallback(async (id: string): Promise<string | null> => {
    const ch = rows.find((c) => c.id === id)
    if (!ch) return null
    const next = rows.map((c) => (c.id === id ? { ...c, isActive: false } : c))
    setRows(next)
    if (ch.platform === 'instagram') onHandle.current?.(ch.pageId, liveIgHandle(next, ch.pageId))
    if (isDemo()) return null
    const { data, error: err } = await supabase.from('page_channels').update({ is_active: false }).eq('id', id).select('id')
    if (err || !data?.length) {
      setRows(rows)
      if (ch.platform === 'instagram') onHandle.current?.(ch.pageId, liveIgHandle(rows, ch.pageId))
      return err?.message ?? 'You do not have permission to change this page.'
    }
    return null
  }, [rows])

  return { rows, loading, error, reload: () => load(true), save, ensure, retire }
}

export type PageChannels = ReturnType<typeof usePageChannels>
