import { useEffect, useMemo, useRef, useState } from 'react'
import { Chip } from '@/components/bits'
import { useWeeklyViews } from '@/data/useWeeklyViews'
import { useTargetSummary } from '@/data/useTargetSummary'
import { usePageWeekViews } from '@/data/usePageWeekViews'
import { officeToday } from '@/lib/attendance'
import { fmtCompact } from '@/lib/format'
import { INCENTIVE_PAGE_TYPE, type Client, type Page, type PageAssignment } from '@/lib/hr'
import { PLATFORM, PLATFORMS, type PageChannel } from '@/lib/agency'
import { addDays, currentPeriod, lastCompletedWeek, paceOf, parseViews, weekLabel } from '@/lib/targets'
import type { Agency } from '@/data/useAgency'
import type { PageReels } from '@/data/usePageReels'

type RowState = 'saving' | 'saved' | 'error' | null

/**
 * "This week" (Phase 1, step 3) — every channel of every page this person
 * holds, grouped by client, with ONE box for the week's views and ONE
 * screenshot button each. The week is the one that just ended: the Monday
 * reminder (remind_weekly_views, 0037) asks for exactly this.
 */
export function WeeklyViewsSection({
  agency, clients, pages, pageAssignments, toast, onOpenClient, pageReels,
}: {
  agency: Agency
  clients: Client[]
  pages: Page[]
  pageAssignments: PageAssignment[]
  toast: (m: string) => void
  /** the client's own page — its team, its target, the whole grid */
  onOpenClient?: (clientId: string) => void
  /** Reads the person's pages' reel views when they are a day old, so the
   *  automatic weekly figure (0047) has readings to work from. */
  pageReels?: PageReels
}) {
  const { channels, targets, myEmployee, access } = agency
  const today = officeToday()
  const lastWeek = lastCompletedWeek(today)
  const [week, setWeek] = useState(lastWeek)

  const mine = useMemo(() => {
    if (!myEmployee) return []
    const held = new Set(pageAssignments.filter((a) => a.employeeId === myEmployee.id).map((a) => a.pageId))
    return pages.filter((p) => held.has(p.id) && p.isActive && clients.some((c) => c.id === p.clientId && c.isActive))
  }, [myEmployee, pageAssignments, pages, clients])
  const myChannels = useMemo(
    () => channels.rows.filter((c) => c.isActive && mine.some((p) => p.id === c.pageId))
      .sort((a, b) => PLATFORMS.indexOf(a.platform) - PLATFORMS.indexOf(b.platform)),
    [channels.rows, mine],
  )
  const ids = useMemo(() => myChannels.map((c) => c.id), [myChannels])
  // Twelve weeks at a time, so stepping back a little does not refetch.
  const from = week < addDays(lastWeek, -77) ? addDays(week, -77) : addDays(lastWeek, -77)
  const weekly = useWeeklyViews(ids, from)
  // 0047: what each page's reels gained, read automatically — a figure to
  // check the typed one against, or to take when Insights is out of reach.
  const pageIds = useMemo(() => mine.map((p) => p.id), [mine])
  const [readTick, setReadTick] = useState(0)
  const auto = usePageWeekViews(pageIds, from, agency.installed.posting, readTick)
  // Readings are what the figure is made of: a page whose reels were last
  // read over 20 hours ago is read again when this screen opens — about one
  // Apify run per page per day at most, and only for the pages you hold.
  const reelRows = pageReels?.rows
  const refreshPage = pageReels?.refresh
  const readOnce = useRef(new Set<string>())
  useEffect(() => {
    if (!agency.installed.posting || !reelRows || !refreshPage || pageReels?.loading) return
    const stale = mine.filter((p) => p.instagramHandle && !readOnce.current.has(p.id) && (() => {
      const last = reelRows.filter((r) => r.pageId === p.id).reduce((m, r) => (r.fetchedAt > m ? r.fetchedAt : m), '')
      return !last || Date.now() - new Date(last).getTime() > 20 * 3600000
    })())
    if (stale.length === 0) return
    for (const p of stale) readOnce.current.add(p.id)
    void (async () => {
      for (const p of stale) await refreshPage(p.id)
      setReadTick((n) => n + 1)
    })()
  }, [agency.installed.posting, reelRows, refreshPage, pageReels?.loading, mine])
  const autoOf = (pageId: string) => auto.find((a) => a.pageId === pageId && a.weekStart === week) ?? null
  const summary = useTargetSummary(lastWeek)
  const reloadSummary = summary.reload

  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [state, setState] = useState<Record<string, RowState>>({})
  const fileFor = useRef<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  useEffect(() => { setDrafts({}); setState({}) }, [week])

  const valueOf = (c: PageChannel) => weekly.rows.find((w) => w.channelId === c.id && w.weekStart === week) ?? null
  const entered = myChannels.filter((c) => valueOf(c)).length

  const save = async (c: PageChannel, typed?: string) => {
    const text = typed ?? drafts[c.id]
    if (text === undefined) return
    const n = parseViews(text)
    const current = valueOf(c)
    if (n == null) {
      if (text.trim()) { setState((p) => ({ ...p, [c.id]: 'error' })); toast('That is not a number of views.') }
      return
    }
    if (current && current.views === n) { setDrafts((p) => { const q = { ...p }; delete q[c.id]; return q }); return }
    setState((p) => ({ ...p, [c.id]: 'saving' }))
    const m = await weekly.saveViews(c.id, week, n)
    setState((p) => ({ ...p, [c.id]: m ? 'error' : 'saved' }))
    if (m) toast(m)
    else {
      setDrafts((p) => { const q = { ...p }; delete q[c.id]; return q })
      // The client's "July – Sep: 142M / 225M" line moves with the number.
      void reloadSummary()
    }
  }

  const attach = async (file: File | undefined) => {
    const channelId = fileFor.current
    if (!file || !channelId) return
    setState((p) => ({ ...p, [channelId]: 'saving' }))
    const m = await weekly.attachProof(channelId, week, file)
    setState((p) => ({ ...p, [channelId]: m ? 'error' : 'saved' }))
    toast(m ?? 'Screenshot attached.')
  }

  const byClient = useMemo(() => clients
    .filter((c) => mine.some((p) => p.clientId === c.id))
    .map((c) => ({
      client: c,
      rows: mine.filter((p) => p.clientId === c.id)
        .sort((a, b) => (a.pageType === b.pageType ? a.createdAt.localeCompare(b.createdAt) : a.pageType === 'main' ? -1 : 1))
        .flatMap((p) => myChannels.filter((ch) => ch.pageId === p.id).map((ch) => ({ page: p, channel: ch }))),
    })), [clients, mine, myChannels])

  if (!myEmployee) return null
  if (mine.length === 0) {
    return (
      <div className="banner">
        <div><div className="t">No pages yet</div><div className="d">Once you are given a client's page, its weekly numbers are entered here.</div></div>
      </div>
    )
  }

  return (
    <div className="section">
      <div className="month-step wk-step">
        <button className="btn btn--sm" aria-label="Previous week" onClick={() => setWeek((w) => addDays(w, -7))}>←</button>
        <strong>{weekLabel(week)}{week === lastWeek ? ' · last week' : ''}</strong>
        <button className="btn btn--sm" aria-label="Next week" disabled={week >= lastWeek} onClick={() => setWeek((w) => addDays(w, 7))}>→</button>
      </div>

      {byClient.map(({ client, rows }) => {
        const target = targets.targets.find((t) => t.clientId === client.id && t.isActive && today >= t.startsOn && today <= t.endsOn)
        const s = target ? summary.byTarget.get(target.id) : undefined
        const per = target ? currentPeriod(targets.periods.filter((p) => p.targetId === target.id), today) : null
        const prog = s && per ? s.periods.get(per.id) ?? null : null
        const pace = prog ? paceOf(prog) : null
        return (
          <div className="ov-card" key={client.id}>
            <div className="ov-head">
              {onOpenClient
                ? <button className="wv-client" onClick={() => onOpenClient(client.id)}><h4>{client.name} →</h4></button>
                : <h4>{client.name}</h4>}
              {prog && per && pace && (
                <span className="wv-prog" title={`${per.label}: ${prog.achieved.toLocaleString('en-IN')} of ${prog.goal.toLocaleString('en-IN')}`}>
                  {per.label}: {fmtCompact(prog.achieved)} / {fmtCompact(prog.goal)} <Chip cls={'chip--' + pace.tone}>{pace.label}</Chip>
                </span>
              )}
            </div>
            <div className="wv-rows">
              {rows.map(({ page, channel }) => {
                const v = valueOf(channel)
                const st = state[channel.id]
                const can = access.canEnterViews({ id: client.id, departmentId: client.departmentId }, true)
                return (
                  <div className="wv-row" key={channel.id}>
                    <span className="wv-page">
                      <span className="cell-strong">{page.label || INCENTIVE_PAGE_TYPE[page.pageType]}</span>
                      <span className={'tg-plat tg-plat--' + channel.platform}>{PLATFORM[channel.platform].short}</span>
                      <span className="cell-mute wv-handle">{channel.handle}</span>
                    </span>
                    {channel.platform === 'instagram' && (() => {
                      const a = autoOf(page.id)
                      if (!a || (!a.viewsGained && !a.reels)) return null
                      const n = String(a.viewsGained)
                      const same = (drafts[channel.id] ?? (v ? String(v.views) : '')) === n
                      return (
                        <button type="button" className="wv-auto" disabled={!can || same || st === 'saving'}
                                title={`Public views ${a.reels === 1 ? 'its reel' : `its ${a.reels} reels`} gained ${weekLabel(week)}, read automatically${a.reelsUnmeasured ? ` (${a.reelsUnmeasured} had no earlier reading, so not counted)` : ''}. Insights' account views are usually higher — type that when you have it; tap to use this one.`}
                                onClick={() => { setDrafts((p) => ({ ...p, [channel.id]: n })); void save(channel, n) }}>
                          Reels&nbsp;{fmtCompact(a.viewsGained)}{same ? ' ✓' : ''}
                        </button>
                      )
                    })()}
                    <input className="input wv-input" inputMode="numeric" aria-label={`${page.label} ${PLATFORM[channel.platform].label} views`}
                           placeholder="Views" disabled={!can}
                           value={drafts[channel.id] ?? (v ? String(v.views) : '')}
                           onChange={(e) => setDrafts((p) => ({ ...p, [channel.id]: e.target.value }))}
                           onBlur={() => void save(channel)}
                           onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
                    <button className={'btn btn--sm wv-shot' + (v?.proofPath ? ' is-done' : '')} disabled={!v || !can || st === 'saving'}
                            title={v ? (v.proofPath ? 'Replace the screenshot' : 'Attach the Insights screenshot') : 'Enter the number first'}
                            onClick={() => { fileFor.current = channel.id; fileRef.current?.click() }}>
                      {v?.proofPath ? '✓ SS' : 'SS'}
                    </button>
                    <span className={'wv-state' + (st === 'error' ? ' is-bad' : '')}>
                      {st === 'saving' ? '…' : st === 'error' ? '!' : v ? '✓' : ''}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { void attach(e.target.files?.[0]); e.target.value = '' }} />
      <div className="grid-foot">
        <span>{entered} of {myChannels.length} channels in for {weekLabel(week)}</span>
        <span className="grid-hint">Type the number, press Enter; then attach its screenshot (SS)</span>
      </div>
    </div>
  )
}
