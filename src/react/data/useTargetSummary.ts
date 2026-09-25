import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { demoAdjustments, demoPageChannels, demoPages, demoTargetPeriods, demoTargets, isDemo } from '@/data/demo'
import { demoRows } from '@/data/useWeeklyViews'
import { numOrNull, str, type Row } from '@/data/agencySchema'
import { computeProgress, type Progress } from '@/lib/targets'

export type ProgressLite = Pick<Progress, 'goal' | 'achieved' | 'left' | 'elapsedShare' | 'achievedShare'>

export interface TargetSummary {
  /** target id → its own numbers and each period's */
  byTarget: Map<string, { total: ProgressLite; periods: Map<string, ProgressLite> }>
  /** channels with a number for the given week — "This week: 12 of 14 in" */
  entered: Set<string>
}

const lite = (r: Row): ProgressLite => ({
  goal: Number(r.goal) || 0,
  achieved: Number(r.achieved) || 0,
  left: Number(r.left_views) || 0,
  elapsedShare: Number(r.elapsed_share) || 0,
  achievedShare: numOrNull(r.achieved_share),
})

/**
 * Every target's progress, for the Clients list — read from
 * v_target_progress (0037) so the list never has to load a year of weekly
 * rows for every client. Demo mode works the same numbers out with
 * computeProgress(), the view's twin.
 */
export function useTargetSummary(week: string, enabled = true) {
  const [summary, setSummary] = useState<TargetSummary>({ byTarget: new Map(), entered: new Set() })
  const [loading, setLoading] = useState(enabled)
  const fetched = useRef<string | null>(null)

  const load = useCallback(async (force = false) => {
    if (!enabled) { setLoading(false); return }
    if (fetched.current === week && !force) { setLoading(false); return }
    fetched.current = week
    const byTarget: TargetSummary['byTarget'] = new Map()
    if (isDemo()) {
      const weekly = demoRows()
      const today = new Date().toISOString().slice(0, 10)
      for (const t of demoTargets) {
        const tp = computeProgress({
          target: t, periods: demoTargetPeriods, pages: demoPages, channels: demoPageChannels,
          weekly, adjustments: demoAdjustments, today,
        })
        byTarget.set(t.id, { total: tp.target, periods: new Map(tp.periods.map((p) => [p.period.id, p])) })
      }
      setSummary({ byTarget, entered: new Set(weekly.filter((w) => w.weekStart === week).map((w) => w.channelId)) })
      setLoading(false)
      return
    }
    const [prog, wk] = await Promise.all([
      supabase.from('v_target_progress').select('*').in('grain', ['target', 'period']),
      supabase.from('weekly_views').select('channel_id').eq('week_start', week),
    ])
    for (const r of (prog.data ?? []) as Row[]) {
      const tid = str(r.target_id)
      const entry = byTarget.get(tid) ?? { total: lite({}), periods: new Map<string, ProgressLite>() }
      if (r.grain === 'target') entry.total = lite(r)
      else entry.periods.set(str(r.period_id), lite(r))
      byTarget.set(tid, entry)
    }
    setSummary({ byTarget, entered: new Set(((wk.data ?? []) as Row[]).map((r) => str(r.channel_id))) })
    setLoading(false)
  }, [enabled, week])

  useEffect(() => { void load() }, [load])

  return { ...summary, loading, reload: () => load(true) }
}

export type TargetSummaryHook = ReturnType<typeof useTargetSummary>
