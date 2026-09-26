import { useMemo, useState } from 'react'
import { Chip } from '@/components/bits'
import { TargetModal } from '@/modals/TargetModal'
import { WeekEntryModal } from '@/modals/WeekEntryModal'
import { AdjustmentModal } from '@/modals/AdjustmentModal'
import { SheetImportModal } from '@/modals/SheetImportModal'
import { useWeeklyViews } from '@/data/useWeeklyViews'
import { fmtCompact } from '@/lib/format'
import { officeToday } from '@/lib/attendance'
import { INCENTIVE_PAGE_TYPE, type Client, type Page } from '@/lib/hr'
import { PLATFORM, PLATFORMS, type PageChannel, type ViewAdjustment, type ViewTarget } from '@/lib/agency'
import {
  addDays, computeProgress, currentPeriod, lastCompletedWeek, mondayOf, paceOf, weekLabel, weekShort, weeksOf,
  type PeriodProgress, type Progress,
} from '@/lib/targets'
import type { Agency } from '@/data/useAgency'
import type { PageAssignments } from '@/data/usePageAssignments'
import type { Pages } from '@/data/usePages'
import type { Workspace } from '@/data/useWorkspace'

/** 1.2M on screen, every digit on hover — the sheet check compares exact numbers. */
const Num = ({ n, signed }: { n: number; signed?: boolean }) => (
  <span title={n.toLocaleString('en-IN')} className={n < 0 ? 'tg-neg' : undefined}>
    {signed && n > 0 ? '+' : ''}{fmtCompact(n)}
  </span>
)

/** A channel row of the grid: the page's sheet number, and whether this
 *  target counts it at all (a YouTube row on an Instagram-only target is
 *  still shown, greyed, because its numbers are still the team's work). */
interface GridRow { key: string; page: Page; num: string; channel: PageChannel; counts: boolean }

/** How many weeks back the grid reaches when there is no target to bound it
 *  — an editor reading a client's weekly numbers. */
const PLAIN_WEEKS = 12

/**
 * The client's Dashboard tab — the two sheets on one screen:
 *   * the Client Master's TARGET block: the total and each period's target,
 *     achieved, left and pace;
 *   * its weekly block: every page's Instagram and YouTube number per week,
 *     with LavBhusan's totals under it — fan pages, main pages, adjustments,
 *     the weekly total and the running LEFT.
 * Numbers come from computeProgress(), the twin of v_target_progress (0037).
 * With no target yet the weekly block still shows — the last twelve weeks,
 * open for entry — so a new client is never an empty screen.
 */
export function ClientTargets({
  ws, agency, client, pages, pagesHook, pageAssignments, canViewTargets, toast,
}: {
  ws: Workspace
  agency: Agency
  client: Client
  pages: Page[]
  pagesHook: Pages
  pageAssignments: PageAssignments
  canViewTargets: boolean
  toast: (m: string) => void
}) {
  const { access, targets, channels, lists, myEmployee } = agency
  const ref = { id: client.id, departmentId: client.departmentId }
  const canManageTargets = access.canForClient(ref, 'manage_targets')
  const today = officeToday()
  const lastWeek = lastCompletedWeek(today)

  const mine = useMemo(
    () => targets.targets.filter((t) => t.clientId === client.id)
      .sort((a, b) => Number(b.isActive) - Number(a.isActive) || b.startsOn.localeCompare(a.startsOn)),
    [targets.targets, client.id],
  )
  const [pickedTarget, setPickedTarget] = useState<string | null>(null)
  const target: ViewTarget | null = (canViewTargets ? mine.find((t) => t.id === pickedTarget)
    ?? mine.find((t) => t.isActive && today >= t.startsOn && today <= t.endsOn) ?? mine[0] : null) ?? null
  const periods = useMemo(
    () => (target ? targets.periods.filter((p) => p.targetId === target.id).sort((a, b) => a.startsOn.localeCompare(b.startsOn)) : []),
    [targets.periods, target],
  )
  const [pickedPeriod, setPickedPeriod] = useState<string | null>(null)
  const period = periods.find((p) => p.id === pickedPeriod) ?? currentPeriod(periods, today)

  const clientChannels = useMemo(() => {
    const ids = new Set(pages.map((p) => p.id))
    return channels.rows.filter((c) => ids.has(c.pageId))
  }, [channels.rows, pages])
  const channelIds = useMemo(() => clientChannels.map((c) => c.id), [clientChannels])
  const fromWeek = target ? addDays(mondayOf(target.startsOn), -7) : addDays(lastWeek, -7 * (PLAIN_WEEKS - 1))
  const weekly = useWeeklyViews(channelIds, fromWeek)

  const progress = useMemo(() => (target ? computeProgress({
    target, periods, pages, channels: clientChannels, weekly: weekly.rows, adjustments: targets.adjustments, today,
  }) : null), [target, periods, pages, clientChannels, weekly.rows, targets.adjustments, today])
  const pp: PeriodProgress | null = progress && period ? progress.periods.find((x) => x.period.id === period.id) ?? null : null

  // The weeks the grid shows: the chosen period's, or the last twelve.
  const weeks = useMemo(() => {
    if (target && period) return weeksOf(period.startsOn, period.endsOn, target.weekCountsIn)
    if (target) return weeksOf(target.startsOn, target.endsOn, target.weekCountsIn).filter((w) => w <= lastWeek).slice(-PLAIN_WEEKS)
    return Array.from({ length: PLAIN_WEEKS }, (_, i) => addDays(lastWeek, -7 * (PLAIN_WEEKS - 1 - i)))
  }, [target, period, lastWeek])

  const rows: GridRow[] = useMemo(() => {
    const ordered = [
      ...pages.filter((p) => p.pageType === 'main').sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      ...pages.filter((p) => p.pageType === 'fan').sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    ]
    const hasData = (c: PageChannel) => weekly.rows.some((w) => w.channelId === c.id && weeks.includes(w.weekStart))
    let fan = 0
    const out: GridRow[] = []
    for (const p of ordered) {
      const num = p.pageType === 'main' ? 'M' : String(++fan)
      const chans = clientChannels.filter((c) => c.pageId === p.id && (c.isActive || hasData(c)))
        .sort((a, b) => PLATFORMS.indexOf(a.platform) - PLATFORMS.indexOf(b.platform))
      for (const c of chans) {
        const counts = !target || (target.platforms.includes(c.platform) && (p.pageType === 'main' ? target.countMain : target.countFan))
        if (!p.isActive && !hasData(c)) continue
        out.push({ key: c.id, page: p, num, channel: c, counts })
      }
    }
    return out
  }, [pages, clientChannels, weekly.rows, weeks, target])

  const cell = (channelId: string, week: string) => weekly.rows.find((w) => w.channelId === channelId && w.weekStart === week) ?? null
  // The sheet's Followers/Subs: each channel's newest count, beside its name.
  const followers = useMemo(() => {
    const m = new Map<string, { n: number; week: string }>()
    for (const w of weekly.rows) {
      if (w.followers == null) continue
      const cur = m.get(w.channelId)
      if (!cur || w.weekStart > cur.week) m.set(w.channelId, { n: w.followers, week: w.weekStart })
    }
    return m
  }, [weekly.rows])
  const holds = (pageId: string) => !!myEmployee && pageAssignments.rows.some((a) => a.pageId === pageId && a.employeeId === myEmployee.id)
  const canEnter = (r: GridRow) => access.canEnterViews(ref, holds(r.page.id))
  const entered = rows.filter((r) => r.channel.isActive && cell(r.channel.id, lastWeek)).length
  const liveRows = rows.filter((r) => r.channel.isActive).length

  const [entry, setEntry] = useState<{ row: GridRow; week: string } | null>(null)
  const [editingTarget, setEditingTarget] = useState<ViewTarget | 'new' | null>(null)
  const [adjusting, setAdjusting] = useState<ViewAdjustment | 'new' | null>(null)
  const [importing, setImporting] = useState(false)

  const periodAdjustments = useMemo(() => {
    if (!target || !period) return []
    return targets.adjustments.filter((a) => a.targetId === target.id && (
      a.periodId === period.id
      || (!a.periodId && a.weekStart && weeks.includes(a.weekStart))
    )).sort((a, b) => (a.weekStart ?? '9999').localeCompare(b.weekStart ?? '9999'))
  }, [targets.adjustments, target, period, weeks])
  const typeName = (id: string) => lists.view_adjustment_types.find((t) => t.id === id)?.name ?? 'Adjustment'
  const whoName = (profileId: string | null) => (profileId ? ws.members.find((m) => m.id === profileId)?.name
    ?? agency.team.rows.find((t) => t.profileId === profileId)?.fullName ?? null : null)

  const split = (p: Progress | null) => ({
    both: !!target && target.countMain && target.countFan && !!p && p.main > 0,
    platforms: target ? target.platforms.filter((x) => rows.some((r) => r.counts && r.channel.platform === x)) : [],
  })
  const shape = split(pp)
  const weekOf = (w: string) => pp?.weeks.find((x) => x.weekStart === w) ?? null

  const noTarget = canViewTargets && !target

  return (
    <div className="section">
      {target && progress && (
        <>
          <div className="section-head">
            <h3>{target.label}</h3>
            {!target.isActive && <Chip cls="chip--mute">Retired</Chip>}
            <div className="section-tools section-tools--tight">
              {mine.length > 1 && (
                <select className="input" aria-label="Which target" value={target.id} onChange={(e) => { setPickedTarget(e.target.value); setPickedPeriod(null) }}>
                  {mine.map((t) => <option key={t.id} value={t.id}>{t.label}{t.isActive ? '' : ' (retired)'}</option>)}
                </select>
              )}
              {canManageTargets && <button className="btn btn--sm" onClick={() => setImporting(true)}>Import</button>}
              {canManageTargets && <button className="btn btn--sm" onClick={() => setEditingTarget(target)}>Edit</button>}
            </div>
          </div>

          {/* The sheet's TARGET block. A period's column heading picks the
              weeks shown below it. */}
          <div className="grid-shell">
            <div className="grid-scroll">
              <table className="grid tg-sum">
                <thead>
                  <tr>
                    <th className="tg-sticky" />
                    <th>Total</th>
                    {progress.periods.map((x) => (
                      <th key={x.period.id} className={x.period.id === period?.id ? 'is-on' : ''}>
                        <button className="tg-pick" onClick={() => setPickedPeriod(x.period.id)} aria-pressed={x.period.id === period?.id}>
                          {x.period.label}{x.period.sharePct != null ? ` (${x.period.sharePct}%)` : ''}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th className="tg-sticky">Target</th>
                    <td><Num n={progress.target.goal} /></td>
                    {progress.periods.map((x) => (
                      <td key={x.period.id} className={x.period.id === period?.id ? 'is-on' : ''}>
                        <Num n={x.goal} />
                        {x.period.targetViews != null && x.period.sharePct != null && (
                          <span className="tg-own" title={`${x.period.sharePct}% of the total would be ${fmtCompact(Math.round(target.totalViews * x.period.sharePct / 100))} — this period has its own number`}> own</span>
                        )}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th className="tg-sticky">Achieved</th>
                    <td><Num n={progress.target.achieved} /></td>
                    {progress.periods.map((x) => <td key={x.period.id} className={x.period.id === period?.id ? 'is-on' : ''}>{x.elapsedShare > 0 ? <Num n={x.achieved} /> : <span className="cell-dash">—</span>}</td>)}
                  </tr>
                  <tr>
                    <th className="tg-sticky">Left</th>
                    <td><Num n={progress.target.left} /></td>
                    {progress.periods.map((x) => <td key={x.period.id} className={x.period.id === period?.id ? 'is-on' : ''}><Num n={x.left} /></td>)}
                  </tr>
                  <tr>
                    <th className="tg-sticky">Pace</th>
                    <td><PaceChip p={progress.target} /></td>
                    {progress.periods.map((x) => <td key={x.period.id} className={x.period.id === period?.id ? 'is-on' : ''}><PaceChip p={x} /></td>)}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <div className="section-head">
        <h3>{period ? period.label : target ? 'Weeks' : 'Weekly views'}</h3>
        {noTarget && <Chip cls="chip--mute">No target yet</Chip>}
        {((period && periods.length > 1) || (target && canManageTargets) || (noTarget && canManageTargets)) && (
          <div className="section-tools section-tools--tight">
            {noTarget && canManageTargets && (
              <button className="btn btn--sm btn--primary" onClick={() => setEditingTarget('new')}>Set a target</button>
            )}
            {period && periods.length > 1 && (
              <>
                <button className="btn btn--sm" aria-label="Previous period" disabled={periods[0]?.id === period.id}
                        onClick={() => setPickedPeriod(periods[periods.findIndex((p) => p.id === period.id) - 1]!.id)}>←</button>
                <button className="btn btn--sm" aria-label="Next period" disabled={periods[periods.length - 1]?.id === period.id}
                        onClick={() => setPickedPeriod(periods[periods.findIndex((p) => p.id === period.id) + 1]!.id)}>→</button>
              </>
            )}
            {target && canManageTargets && <button className="btn btn--sm" onClick={() => setAdjusting('new')}>+ Adjustment</button>}
          </div>
        )}
      </div>

      <div className="grid-shell">
        <div className="grid-scroll tg-scroll">
          <table className="grid tg-grid">
            <thead>
              <tr>
                <th className="tg-sticky">{followers.size ? 'Page · followers' : 'Page'}</th>
                {weeks.map((w) => (
                  <th key={w} title={weekLabel(w)} className={w === lastWeek ? 'is-now' : undefined}>{weekShort(w)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr className="grid-empty"><td colSpan={weeks.length + 1}>No pages with channels yet — add them on the Pages tab.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.key} className={r.counts ? undefined : 'tg-muted'}>
                  <th className="tg-sticky">
                    <span className="tg-row">
                      <span className="tg-num">{r.num}</span>
                      <span className="tg-name">{r.page.label || r.channel.handle || INCENTIVE_PAGE_TYPE[r.page.pageType]}</span>
                      <span className={'tg-plat tg-plat--' + r.channel.platform}>{PLATFORM[r.channel.platform].short}</span>
                      {followers.has(r.channel.id) && (() => {
                        const f = followers.get(r.channel.id)!
                        return <span className="tg-fol" title={`${f.n.toLocaleString('en-IN')} followers — ${weekLabel(f.week)}`}>{fmtCompact(f.n)}</span>
                      })()}
                    </span>
                  </th>
                  {weeks.map((w) => {
                    const v = cell(r.channel.id, w)
                    const future = w > today
                    const editable = !future && canEnter(r)
                    return (
                      <td key={w} className={'num tg-cell' + (w === lastWeek ? ' is-now' : '')}>
                        {future ? <span className="cell-dash" /> : (v || editable) ? (
                          <button className="tg-cellbtn" onClick={() => setEntry({ row: r, week: w })}
                                  title={v ? `${v.views.toLocaleString('en-IN')} views${v.proofPath ? ' · screenshot attached' : ''}` : 'Enter this week'}>
                            {v ? <>{fmtCompact(v.views)}{v.proofPath && <i className="tg-proof" aria-label="screenshot attached" />}</> : <span className="tg-add">+</span>}
                          </button>
                        ) : <span className="cell-dash">—</span>}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
            {pp && (
              <tfoot>
                {shape.both && (
                  <>
                    <FootRow label="Fan pages" weeks={weeks} value={(w) => weekOf(w)?.fan ?? 0} />
                    <FootRow label="Main pages" weeks={weeks} value={(w) => weekOf(w)?.main ?? 0} />
                  </>
                )}
                {shape.platforms.length > 1 && shape.platforms.map((pl) => (
                  <FootRow key={pl} label={PLATFORM[pl].label} weeks={weeks} value={(w) => weekOf(w)?.[pl] ?? 0} />
                ))}
                {periodAdjustments.some((a) => a.weekStart) && (
                  <FootRow label="Adjustments" weeks={weeks} value={(w) => weekOf(w)?.adjustments ?? 0} signed />
                )}
                <FootRow label="Weekly total" weeks={weeks} value={(w) => weekOf(w)?.achieved ?? 0} strong />
                <FootRow label="Left" weeks={weeks} value={(w) => weekOf(w)?.runningLeft ?? 0} strong
                         upTo={lastWeek} />
              </tfoot>
            )}
            {!pp && rows.length > 1 && (
              <tfoot>
                <FootRow label="Weekly total" weeks={weeks} strong upTo={lastWeek}
                         value={(w) => rows.reduce((s, r) => s + (cell(r.channel.id, w)?.views ?? 0), 0)} />
              </tfoot>
            )}
          </table>
        </div>
        <div className="grid-foot">
          <span>{liveRows ? `${entered} of ${liveRows} channels in for ${weekLabel(lastWeek)}` : 'No channels yet'}</span>
          {pp && <span className="grid-hint">Period so far: <Num n={pp.achieved} /> of <Num n={pp.goal} /></span>}
        </div>
      </div>

      {target && period && periodAdjustments.length > 0 && (
        <div className="ov-card">
          <div className="ov-head"><h4>Adjustments</h4></div>
          <div className="ov-feed">
            {periodAdjustments.map((a) => (
              <div className="ov-ev" key={a.id}>
                <span className="ov-ev-nm">{a.weekStart ? weekLabel(a.weekStart) : 'Whole period'}</span>
                <span className="ov-ev-what">{typeName(a.typeId)}{a.note ? ` — ${a.note}` : ''}</span>
                <span className="ov-ev-by"><Num n={a.views} signed /></span>
                {canManageTargets && <button className="link-btn" onClick={() => setAdjusting(a)}>Edit</button>}
              </div>
            ))}
          </div>
        </div>
      )}

      {entry && (() => {
        const row = cell(entry.row.channel.id, entry.week)
        const editable = canEnter(entry.row)
        return (
          <WeekEntryModal
            channelName={`${entry.row.page.label || INCENTIVE_PAGE_TYPE[entry.row.page.pageType]} · ${PLATFORM[entry.row.channel.platform].label}`}
            weekStart={entry.week} row={row} canEdit={editable} canRemove={canManageTargets} whoName={whoName}
            onClose={() => setEntry(null)}
            onSave={async (views, followers) => {
              const m = await weekly.saveViews(entry.row.channel.id, entry.week, views, followers)
              if (!m) toast('Saved.')
              return m
            }}
            onProof={async (file) => {
              const m = await weekly.attachProof(entry.row.channel.id, entry.week, file)
              toast(m ?? 'Screenshot attached.')
              return m
            }}
            proofUrl={weekly.proofUrl}
            history={weekly.history}
            onRemove={async () => (row ? weekly.remove(row.id) : null)}
          />
        )
      })()}
      {editingTarget && (
        <TargetModal clientId={client.id} target={editingTarget === 'new' ? null : editingTarget} periods={targets.periods}
                     onClose={() => setEditingTarget(null)}
                     onSave={async (d, ps) => {
                       const r = await targets.saveTarget(editingTarget === 'new' ? null : editingTarget.id, d, ps)
                       if (!r.error) { toast('Target saved.'); setPickedTarget(r.id) }
                       return r.error
                     }} />
      )}
      {adjusting && target && (
        <AdjustmentModal target={target} periods={targets.periods} types={lists.view_adjustment_types}
                         adjustment={adjusting === 'new' ? null : adjusting} defaultPeriodId={period?.id ?? null}
                         onClose={() => setAdjusting(null)}
                         onSave={async (d) => {
                           const m = await targets.saveAdjustment(adjusting === 'new' ? null : adjusting.id, d)
                           if (!m) toast('Adjustment saved.')
                           return m
                         }}
                         onRemove={async () => {
                           if (adjusting === 'new') return null
                           const m = await targets.removeAdjustment(adjusting.id)
                           if (!m) toast('Adjustment removed.')
                           return m
                         }} />
      )}
      {importing && target && (
        <SheetImportModal agency={agency} client={client} target={target} pages={pages} pagesHook={pagesHook} weekly={weekly}
                          onClose={() => setImporting(false)}
                          onDone={() => { void weekly.reload(); void targets.reload() }}
                          toast={toast} />
      )}
    </div>
  )
}

function PaceChip({ p }: { p: Progress | PeriodProgress }) {
  const pace = paceOf(p)
  return <Chip cls={'chip--' + pace.tone}>{pace.label}</Chip>
}

/** One LavBhusan-style total row under the grid. `upTo` stops a running
 *  column (LEFT) at the last finished week, where the sheet stops too. */
function FootRow({ label, weeks, value, signed, strong, upTo }: {
  label: string
  weeks: string[]
  value: (week: string) => number
  signed?: boolean
  strong?: boolean
  upTo?: string
}) {
  return (
    <tr className={strong ? 'tg-strong' : undefined}>
      <th className="tg-sticky">{label}</th>
      {weeks.map((w) => (
        <td key={w} className="num">
          {upTo && w > upTo ? <span className="cell-dash" /> : value(w) === 0 && signed ? <span className="cell-dash">—</span> : <Num n={value(w)} signed={signed} />}
        </td>
      ))}
    </tr>
  )
}
