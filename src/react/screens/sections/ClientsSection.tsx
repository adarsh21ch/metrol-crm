import { useEffect, useMemo, useRef, useState } from 'react'
import { DataGrid, PhoneViewPick, usePhoneView, type GridCol } from '@/components/DataGrid'
import { Chip } from '@/components/bits'
import { ClientModal } from '@/modals/ClientModal'
import { ClientPage } from '@/screens/sections/ClientPage'
import { ReelsMaster, type ReelTier } from '@/screens/sections/ReelsMaster'
import { useTargetSummary, type ProgressLite } from '@/data/useTargetSummary'
import { usePersistedState } from '@/lib/usePersistedState'
import { officeToday } from '@/lib/attendance'
import { count, fmtCompact } from '@/lib/format'
import { byCode } from '@/lib/agency'
import { CONTENT_MARKETING_DEPARTMENT, type Client } from '@/lib/hr'
import { currentPeriod, lastCompletedWeek, paceOf, weekLabel } from '@/lib/targets'
import type { Agency } from '@/data/useAgency'
import type { Clients } from '@/data/useClients'
import type { Pages } from '@/data/usePages'
import type { PageAssignments } from '@/data/usePageAssignments'
import type { PageReels } from '@/data/usePageReels'
import type { IncentiveClaims } from '@/data/useIncentiveClaims'
import type { Workspace } from '@/data/useWorkspace'

/** One row of the Clients list — the client and what the list says about it. */
interface ClientRow extends Client {
  statusName: string
  statusTone: string
  livePages: number
  fanPages: number
  smm: string[]
  others: number
  period: { label: string; p: ProgressLite } | null
  channels: number
  entered: number
}

/**
 * The Clients list — the Client Master Sheet's tabs, as one table: a client
 * per row with its Client ID, status, pages, SMMs, how its current period
 * stands against target, and how many of last week's numbers are in. A click
 * opens the client. Reels, beside it, is every reel on every page in one
 * place (the reel master view, v1).
 *
 * `asPage` draws the heading as the screen's own title (HR's and the owner's
 * app); without it the heading is a section's (inside the Content &
 * Marketing head's Manage team tab). Either way the controls ride on it.
 */
export function ClientsSection({
  ws, agency, clients, pages, pageAssignments, pageReels, incentiveClaims, toast, asPage, lead, onOpenChange,
}: {
  ws: Workspace
  agency: Agency
  clients: Clients
  pages: Pages
  pageAssignments: PageAssignments
  pageReels: PageReels
  incentiveClaims: IncentiveClaims
  toast: (m: string) => void
  asPage?: boolean
  /** a control for the far left of the heading — HR's "← Profile" on a phone */
  lead?: React.ReactNode
  /** told when a client opens or closes, so a host can give up its own heading */
  onOpenChange?: (open: boolean) => void
}) {
  const { access, team, lists, channels, targets, myEmployee } = agency
  const [openId, setOpenId] = usePersistedState<string | null>('agency-open-client', null)
  const [view, setView] = usePersistedState<'clients' | 'reels'>('agency-clients-view', 'clients')
  const [adding, setAdding] = useState(false)
  const [phoneView, setPhoneView] = usePhoneView('agency-clients')
  const [reelClient, setReelClient] = useState('')
  const [reelTier, setReelTier] = useState<ReelTier>('all')
  const today = officeToday()
  const lastWeek = lastCompletedWeek(today)
  const summary = useTargetSummary(lastWeek, agency.installed.targets)

  const open = clients.rows.find((c) => c.id === openId) ?? null
  const report = useRef(onOpenChange)
  useEffect(() => { report.current = onOpenChange }, [onOpenChange])
  useEffect(() => { report.current?.(!!open) }, [open])

  const cmDept = ws.departments.find((d) => d.name === CONTENT_MARKETING_DEPARTMENT)?.id ?? null
  const canAdd = access.can('manage_clients') || (!!cmDept && access.canInDepartment(cmDept, 'manage_clients'))
  const canSeeReels = access.can('view_all_clients') || (!!cmDept && access.canInDepartment(cmDept, 'view_all_clients'))
  const myPageIds = useMemo(
    () => new Set(myEmployee ? pageAssignments.rows.filter((a) => a.employeeId === myEmployee.id).map((a) => a.pageId) : []),
    [pageAssignments.rows, myEmployee],
  )
  const pageHolderRole = agency.accessData.roles.find((r) => r.pageHolder)?.id ?? null

  const rows: ClientRow[] = useMemo(() => {
    return clients.rows
      .filter((c) => access.canSeeClient({ id: c.id, departmentId: c.departmentId },
        pages.rows.some((p) => p.clientId === c.id && myPageIds.has(p.id))))
      .map((c) => {
        const status = lists.client_statuses.find((s) => s.id === c.statusId)
        const clientPages = pages.rows.filter((p) => p.clientId === c.id && p.isActive)
        const liveTeam = team.rows.filter((t) => t.clientId === c.id && !t.endedAt)
        const smm = liveTeam.filter((t) => t.roleId === pageHolderRole).map((t) => t.fullName.split(' ')[0]!)
        const target = targets.targets.find((t) => t.clientId === c.id && t.isActive && today >= t.startsOn && today <= t.endsOn)
          ?? targets.targets.find((t) => t.clientId === c.id && t.isActive)
        const s = target ? summary.byTarget.get(target.id) : undefined
        const per = target ? currentPeriod(targets.periods.filter((p) => p.targetId === target.id), today) : null
        const period = s ? (per && s.periods.get(per.id) ? { label: per.label, p: s.periods.get(per.id)! } : { label: target!.label, p: s.total }) : null
        const liveChannels = channels.rows.filter((ch) => ch.isActive && clientPages.some((p) => p.id === ch.pageId))
        return {
          ...c,
          statusName: status?.name ?? (c.isActive ? '' : 'Retired'),
          statusTone: status?.tone ?? 'mute',
          livePages: clientPages.length,
          fanPages: clientPages.filter((p) => p.pageType === 'fan').length,
          smm,
          others: new Set(liveTeam.filter((t) => t.roleId !== pageHolderRole).map((t) => t.employeeId)).size,
          period,
          channels: liveChannels.length,
          entered: liveChannels.filter((ch) => summary.entered.has(ch.id)).length,
        }
      })
      .sort((a, b) => Number(b.isActive) - Number(a.isActive) || byCode(a, b))
  }, [clients.rows, access, pages.rows, myPageIds, lists.client_statuses, team.rows, pageHolderRole, targets.targets, targets.periods, summary, channels.rows, today])

  const cols: GridCol<ClientRow>[] = [
    { key: 'code', label: 'ID', width: 86, render: (r) => <span className="cell-mono">{r.code || '—'}</span> },
    {
      key: 'name', label: 'Client', width: 210,
      render: (r) => <span className="td-flex"><span className="cell-strong">{r.name}</span>{r.company && <span className="cell-mute">{r.company}</span>}</span>,
    },
    {
      key: 'status', label: 'Status', width: 112,
      render: (r) => (r.statusName ? <Chip cls={'chip--' + r.statusTone}>{r.statusName}</Chip> : <span className="cell-dash">—</span>),
    },
    { key: 'pages', label: 'Pages', width: 92, render: (r) => (r.livePages ? `${r.livePages} · ${r.fanPages} fan` : <span className="cell-dash">—</span>) },
    {
      key: 'team', label: 'SMM', width: 180,
      render: (r) => (r.smm.length || r.others
        ? <span>{r.smm.join(', ') || '—'}{r.others ? <span className="cell-mute"> +{r.others}</span> : null}</span>
        : <span className="cell-dash">Nobody yet</span>),
    },
    {
      key: 'target', label: 'This period', width: 230,
      render: (r) => {
        if (!r.period) return <span className="cell-dash">No target</span>
        const share = r.period.p.goal > 0 ? Math.max(0, Math.min(1, r.period.p.achieved / r.period.p.goal)) : 0
        return (
          <span className="tp-cell" title={`${r.period.label}: ${r.period.p.achieved.toLocaleString('en-IN')} of ${r.period.p.goal.toLocaleString('en-IN')}`}>
            <span className="tp-bar"><i style={{ width: `${Math.round(share * 100)}%` }} /></span>
            <span className="tp-num">{fmtCompact(r.period.p.achieved)} / {fmtCompact(r.period.p.goal)}</span>
          </span>
        )
      },
    },
    {
      key: 'pace', label: 'Pace', width: 130,
      render: (r) => { if (!r.period) return <span className="cell-dash">—</span>; const p = paceOf(r.period.p); return <Chip cls={'chip--' + p.tone}>{p.label}</Chip> },
    },
    {
      key: 'week', label: 'Last week', width: 104,
      render: (r) => (r.channels
        ? <Chip cls={r.entered === r.channels ? 'chip--good' : r.entered ? 'chip--warn' : 'chip--mute'}>{r.entered} / {r.channels}</Chip>
        : <span className="cell-dash">—</span>),
    },
  ]

  if (open) {
    return (
      <ClientPage ws={ws} agency={agency} client={open} clients={clients} pages={pages} pageAssignments={pageAssignments}
                  pageReels={pageReels} toast={toast} onBack={() => { setOpenId(null); void summary.reload() }} />
    )
  }

  const Title = asPage ? 'h1' : 'h3'
  const tools = (
    <>
      {canSeeReels && (
        <div className="seg">
          <button className={view === 'clients' ? 'is-on' : ''} onClick={() => setView('clients')}>Clients</button>
          <button className={view === 'reels' ? 'is-on' : ''} onClick={() => setView('reels')}>Reels</button>
        </div>
      )}
      {view === 'reels' && canSeeReels && (
        <>
          <select className="input" aria-label="Which client" value={reelClient} onChange={(e) => setReelClient(e.target.value)}>
            <option value="">Every client</option>
            {rows.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="seg" role="group" aria-label="Filter by tier">
            <button className={reelTier === 'all' ? 'is-on' : ''} onClick={() => setReelTier('all')}>All</button>
            <button className={reelTier === '1m' ? 'is-on' : ''} onClick={() => setReelTier('1m')}>1M+</button>
            <button className={reelTier === '10m' ? 'is-on' : ''} onClick={() => setReelTier('10m')}>10M+</button>
          </div>
        </>
      )}
      <PhoneViewPick view={phoneView} onPick={setPhoneView} />
      {view === 'clients' && canAdd && <button className="btn btn--sm btn--primary" onClick={() => setAdding(true)}>+ Client</button>}
    </>
  )
  const shownView = canSeeReels ? view : 'clients'

  return (
    <>
      <div className={asPage ? 'page-head' : 'section-head'}>
        {lead}
        <Title>{shownView === 'reels' ? 'Reels' : 'Clients'}</Title>
        <div className={asPage ? 'section-tools' : 'section-tools section-tools--tight'}>{tools}</div>
      </div>

      {shownView === 'reels' ? (
        <ReelsMaster agency={agency} clients={clients.rows} pages={pages.rows} pageAssignments={pageAssignments.rows}
                     pageReels={pageReels.rows} claims={incentiveClaims.rows}
                     clientId={reelClient} tier={reelTier} phoneView={phoneView} />
      ) : (
        <div className="section">
          <DataGrid cols={cols} rows={rows} storageKey="agency-clients" phoneView={phoneView}
                    rowClass={(r) => (r.isActive ? undefined : 'row-retired')}
                    onRowClick={(r) => setOpenId(r.id)}
                    empty={canAdd ? 'No clients yet — add the first one.' : 'You are not on any client\'s team yet.'}
                    foot={<div className="grid-foot">
                      <span>{count(rows.filter((r) => r.isActive).length, 'client')} · {count(rows.reduce((t, r) => t + r.livePages, 0), 'page')}</span>
                      <span className="grid-hint">Last week = {weekLabel(lastWeek)}: channels with a number in</span>
                    </div>} />
        </div>
      )}

      {adding && (
        <ClientModal client={null} statuses={lists.client_statuses} onClose={() => setAdding(false)}
                     onSave={async (d) => {
                       const r = await clients.create(d)
                       if (r.error) return r.error
                       toast('Client added.')
                       setOpenId(r.id)
                       return null
                     }} />
      )}
    </>
  )
}
