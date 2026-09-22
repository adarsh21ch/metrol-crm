import { useCallback, useEffect, useRef, useState } from 'react'
import { functionErrorMessage, supabase } from '@/lib/supabase'
import { demoPageReels, isDemo } from '@/data/demo'
import type { PageReel } from '@/lib/hr'

type Row = Record<string, unknown>

const toReel = (r: Row): PageReel => ({
  id: String(r.id),
  pageId: String(r.page_id),
  shortCode: String(r.short_code ?? ''),
  reelUrl: String(r.reel_url ?? ''),
  caption: (r.caption as string | null) ?? null,
  views: r.views == null ? null : Number(r.views),
  likes: r.likes == null ? null : Number(r.likes),
  comments: r.comments == null ? null : Number(r.comments),
  shares: r.shares == null ? null : Number(r.shares),
  thumbnailUrl: (r.thumbnail_url as string | null) ?? null,
  postedAt: (r.posted_at as string | null) ?? null,
  fetchedAt: String(r.fetched_at ?? ''),
})

/**
 * Per-reel analytics (0034) — a cache of what Apify last returned for each
 * page. Small enough to load in full, like clients/pages; `refresh` is the
 * only write path and it goes through the Edge Function (needs the Apify
 * key), never a direct insert.
 */
export function usePageReels(enabled = true) {
  const [rows, setRows] = useState<PageReel[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const fetched = useRef(false)

  const load = useCallback(async (force = false) => {
    if (!enabled) { setLoading(false); return }
    if (fetched.current && !force) { setLoading(false); return }
    fetched.current = true
    if (isDemo()) {
      setRows(demoPageReels)
      setLoading(false)
      return
    }
    const { data, error: err } = await supabase.from('page_reels').select('*')
    if (err) { setError(err.message); setLoading(false); return }
    setRows((data ?? []).map((r) => toReel(r as Row)))
    setLoading(false)
  }, [enabled])

  useEffect(() => { void load() }, [load])

  /** Calls fetch-page-reels for one page, then re-reads this table and
   *  returns whatever the function said about matched claims — the caller
   *  decides whether to also reload incentive claims (Member.tsx and
   *  ClientsPagesSection both already have that hook in scope). */
  const refresh = useCallback(async (pageId: string): Promise<{ message: string | null; matchedClaims: number; debugSample?: Record<string, unknown> | null }> => {
    if (isDemo()) return { message: 'Not available in demo mode.', matchedClaims: 0 }
    const { data, error: err } = await supabase.functions.invoke('fetch-page-reels', { body: { pageId } })
    const message = err ? await functionErrorMessage(err) : data?.error ? String(data.error) : null
    if (message) return { message, matchedClaims: 0 }
    await load(true)
    return {
      message: data?.warning ? String(data.warning) : null,
      matchedClaims: Number(data?.matchedClaims ?? 0),
      debugSample: (data?.debugSample as Record<string, unknown> | null) ?? null,
    }
  }, [load])

  return { rows, loading, error, reload: () => load(true), refresh, clearError: () => setError(null) }
}

export type PageReels = ReturnType<typeof usePageReels>
