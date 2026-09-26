import { useEffect, useState } from 'react'
import { demoPageWeekViews, isDemo } from '@/data/demo'
import { loadTable, str, type Row } from '@/data/agencySchema'
import type { PageWeekViews } from '@/lib/agency'

const toRow = (r: Row): PageWeekViews => ({
  pageId: str(r.page_id),
  weekStart: str(r.week_start),
  viewsGained: Number(r.views_gained ?? 0),
  reelsUnmeasured: Number(r.reels_unmeasured ?? 0),
  reels: Number(r.reels ?? 0),
})

/**
 * What these pages' reels gained per week (0047's v_page_week_views), from
 * `fromWeek` on — worked out from the reel view readings the app keeps every
 * time a page's reels are fetched. Nothing until 0047 is on the database.
 */
export function usePageWeekViews(pageIds: string[], fromWeek: string, enabled: boolean, reloadKey = 0): PageWeekViews[] {
  const [rows, setRows] = useState<PageWeekViews[]>([])
  const key = [...pageIds].sort().join(',')
  useEffect(() => {
    if (!enabled || !key) { setRows([]); return }
    const ids = key.split(',')
    if (isDemo()) { setRows(demoPageWeekViews.filter((r) => ids.includes(r.pageId) && r.weekStart >= fromWeek)); return }
    let alive = true
    void loadTable('v_page_week_views', toRow, (q) => q.in('page_id', ids).gte('week_start', fromWeek))
      .then((r) => { if (alive) setRows(r.rows) })
    return () => { alive = false }
  }, [key, fromWeek, enabled, reloadKey])
  return rows
}
