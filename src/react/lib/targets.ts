import type { IncentivePageType } from './hr'
import type { PageChannel, ViewAdjustment, ViewTarget, ViewTargetPeriod, WeekRule, WeeklyView } from './agency'

/**
 * Weeks, and how a target is doing — the rules of v_target_progress (0037),
 * restated for the screens. Every total on the client page, the Clients list
 * and "This week" comes out of computeProgress() below, so none of them can
 * disagree with each other. Keep it in step with the view: the numbers were
 * checked against LavBhushan's own sheet (CLAUDE.md, Agency OS Phase 1).
 *
 * Dates are ISO 'YYYY-MM-DD' strings throughout, read as UTC midnight, so a
 * week is the same seven days in every timezone the app is opened in.
 */

const DAY = 86_400_000
const toTime = (d: string) => Date.parse(d + 'T00:00:00Z')
const toIso = (t: number) => new Date(t).toISOString().slice(0, 10)

export const addDays = (d: string, n: number) => toIso(toTime(d) + n * DAY)
/** 1 = Monday … 7 = Sunday, like Postgres' isodow. */
export const isoDow = (d: string) => { const w = new Date(toTime(d)).getUTCDay(); return w === 0 ? 7 : w }
export const mondayOf = (d: string) => addDays(d, 1 - isoDow(d))
export const daysBetween = (a: string, b: string) => Math.round((toTime(b) - toTime(a)) / DAY)
/** The week that most recently ENDED — what an SMM enters on a Monday. */
export const lastCompletedWeek = (today: string) => addDays(mondayOf(today), -7)

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dm = (d: string) => `${Number(d.slice(8, 10))} ${MON[Number(d.slice(5, 7)) - 1]}`
/** "27 Apr – 3 May", the sheet's own way of naming a week. */
export const weekLabel = (weekStart: string) => `${dm(weekStart)} – ${dm(addDays(weekStart, 6))}`
/** "27 Apr" — a column heading, where the whole range does not fit. */
export const weekShort = (weekStart: string) => dm(weekStart)
export const fmtDay = (d: string) => `${dm(d)} ${d.slice(0, 4)}`

/** Which day of a week decides where it counts (Q4). */
const anchor = (rule: WeekRule) => (rule === 'end' ? 6 : 0)
export const weekCountsIn = (weekStart: string, from: string, to: string, rule: WeekRule) => {
  const a = addDays(weekStart, anchor(rule))
  return a >= from && a <= to
}

/** Every Monday whose week counts inside [from, to]. */
export function weeksOf(from: string, to: string, rule: WeekRule): string[] {
  const off = anchor(rule)
  const first = addDays(from, -off)
  let m = addDays(first, (8 - isoDow(first)) % 7)
  const last = addDays(to, -off)
  const out: string[] = []
  while (m <= last) { out.push(m); m = addDays(m, 7) }
  return out
}

/** A period's own number if it has one, else the target × its share. */
export const periodGoal = (p: ViewTargetPeriod, t: ViewTarget) =>
  p.targetViews ?? Math.round((t.totalViews * (p.sharePct ?? 0)) / 100)

export interface Split {
  fan: number
  main: number
  instagram: number
  youtube: number
  facebook: number
  /** everything counted, before adjustments */
  views: number
}

export interface WeekProgress extends Split {
  weekStart: string
  adjustments: number
  achieved: number
  /** The period's LEFT column after this week. */
  runningLeft: number
}

export interface Progress extends Split {
  goal: number
  adjustments: number
  achieved: number
  left: number
  /** 0–1: how much of the time has gone */
  elapsedShare: number
  /** 0–1+: how much of the goal is done */
  achievedShare: number | null
}

export interface PeriodProgress extends Progress {
  period: ViewTargetPeriod
  weeks: WeekProgress[]
}

export interface TargetProgress {
  target: Progress
  periods: PeriodProgress[]
}

/** The page fields progress needs — Page from hr.ts satisfies it. */
export interface PageRef { id: string; clientId: string; pageType: IncentivePageType }

const zero = (): Split => ({ fan: 0, main: 0, instagram: 0, youtube: 0, facebook: 0, views: 0 })
const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
const elapsed = (from: string, to: string, today: string) =>
  clamp01((daysBetween(from, today) + 1) / (daysBetween(from, to) + 1))

export function computeProgress({
  target, periods, pages, channels, weekly, adjustments, today,
}: {
  target: ViewTarget
  periods: ViewTargetPeriod[]
  pages: PageRef[]
  channels: PageChannel[]
  weekly: WeeklyView[]
  adjustments: ViewAdjustment[]
  today: string
}): TargetProgress {
  const rule = target.weekCountsIn
  const pageById = new Map(pages.filter((p) => p.clientId === target.clientId).map((p) => [p.id, p]))
  const chanById = new Map(channels.filter((c) => pageById.has(c.pageId)).map((c) => [c.id, c]))

  // counted → per week
  const perWeek = new Map<string, Split>()
  for (const w of weekly) {
    const ch = chanById.get(w.channelId)
    if (!ch || !target.platforms.includes(ch.platform)) continue
    const page = pageById.get(ch.pageId)!
    if (page.pageType === 'main' ? !target.countMain : !target.countFan) continue
    if (!weekCountsIn(w.weekStart, target.startsOn, target.endsOn, rule)) continue
    const s = perWeek.get(w.weekStart) ?? zero()
    s[page.pageType] += w.views
    s[ch.platform] += w.views
    s.views += w.views
    perWeek.set(w.weekStart, s)
  }

  const ordered = periods.filter((p) => p.targetId === target.id).sort((a, b) => a.startsOn.localeCompare(b.startsOn))
  const mine = adjustments.filter((a) => a.targetId === target.id)
  // An adjustment belongs to its own period, else the period its week counts in.
  const periodOfAdj = (a: ViewAdjustment) =>
    a.periodId
    ?? (a.weekStart ? ordered.find((p) => weekCountsIn(a.weekStart!, p.startsOn, p.endsOn, rule))?.id ?? null : null)
  const adjPeriod = mine.map((a) => ({ a, periodId: periodOfAdj(a) }))

  const periodRows: PeriodProgress[] = ordered.map((p) => {
    const goal = periodGoal(p, target)
    let running = 0
    const total = zero()
    const weeks = weeksOf(p.startsOn, p.endsOn, rule).map((weekStart) => {
      const s = perWeek.get(weekStart) ?? zero()
      const adj = adjPeriod.filter((x) => x.periodId === p.id && x.a.weekStart === weekStart).reduce((t, x) => t + x.a.views, 0)
      running += s.views + adj
      for (const k of ['fan', 'main', 'instagram', 'youtube', 'facebook', 'views'] as const) total[k] += s[k]
      return { ...s, weekStart, adjustments: adj, achieved: s.views + adj, runningLeft: goal - running }
    })
    const adjustmentsAll = adjPeriod.filter((x) => x.periodId === p.id).reduce((t, x) => t + x.a.views, 0)
    const achieved = total.views + adjustmentsAll
    return {
      ...total, period: p, weeks, goal, adjustments: adjustmentsAll, achieved, left: goal - achieved,
      elapsedShare: elapsed(p.startsOn, p.endsOn, today),
      achievedShare: goal > 0 ? achieved / goal : null,
    }
  })

  const t = zero()
  for (const s of perWeek.values()) for (const k of ['fan', 'main', 'instagram', 'youtube', 'facebook', 'views'] as const) t[k] += s[k]
  const adjAll = mine.reduce((sum, a) => sum + a.views, 0)
  const achieved = t.views + adjAll
  return {
    target: {
      ...t, goal: target.totalViews, adjustments: adjAll, achieved, left: target.totalViews - achieved,
      elapsedShare: elapsed(target.startsOn, target.endsOn, today),
      achievedShare: target.totalViews > 0 ? achieved / target.totalViews : null,
    },
    periods: periodRows,
  }
}

/** On pace or behind — done-share against time-share. A period that has not
 *  started yet is neither. */
export function paceOf(p: Pick<Progress, 'elapsedShare' | 'achievedShare' | 'left'>): { tone: 'good' | 'warn' | 'bad' | 'mute'; label: string } {
  if (p.elapsedShare <= 0 || p.achievedShare == null) return { tone: 'mute', label: 'Not started' }
  if (p.left <= 0) return { tone: 'good', label: 'Target beaten' }
  const gap = p.achievedShare - p.elapsedShare
  if (gap >= 0) return { tone: 'good', label: 'On pace' }
  const behind = Math.round(-gap * 100)
  return { tone: behind > 15 ? 'bad' : 'warn', label: `Behind by ${behind}%` }
}

/** The period today falls in — what a target opens on — else the last one. */
export function currentPeriod(periods: ViewTargetPeriod[], today: string): ViewTargetPeriod | null {
  const sorted = [...periods].sort((a, b) => a.startsOn.localeCompare(b.startsOn))
  return sorted.find((p) => today >= p.startsOn && today <= p.endsOn)
    ?? [...sorted].reverse().find((p) => p.startsOn <= today)
    ?? sorted[0]
    ?? null
}

/** "750M", "750 M", "1.2B", "40L", "2 Cr" or plain digits — the sheet writes
 *  targets the first way, so the form reads them that way. */
export function parseViews(text: string): number | null {
  const s = text.replace(/[,\s]/g, '').toLowerCase()
  if (!s) return null
  const m = s.match(/^(-?\d+(?:\.\d+)?)(k|m|b|l|lakh|lakhs|cr|crore|crores)?$/)
  if (!m) return null
  const n = Number(m[1])
  const mult: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9, l: 1e5, lakh: 1e5, lakhs: 1e5, cr: 1e7, crore: 1e7, crores: 1e7 }
  return Math.round(n * (m[2] ? mult[m[2]]! : 1))
}
