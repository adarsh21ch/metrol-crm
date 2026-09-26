import { ContentSection, type WorkKit } from '@/screens/sections/ContentSection'
import { useEffect, useMemo, useState } from 'react'
import { DataGrid, type GridCol } from '@/components/DataGrid'
import { Chip } from '@/components/bits'
import { Menu } from '@/components/Menu'
import { ClientModal } from '@/modals/ClientModal'
import { PageModal, type PageDraft } from '@/modals/PageModal'
import { AssignModal } from '@/modals/AssignModal'
import { PageDashboard } from '@/screens/sections/PageDashboard'
import { ClientTargets } from '@/screens/sections/ClientTargets'
import { usePersistedState } from '@/lib/usePersistedState'
import { isDemo } from '@/data/demo'
import { count, money } from '@/lib/format'
import { fmtDate, INCENTIVE_PAGE_TYPE, type Client, type Page } from '@/lib/hr'
import { PLATFORM, PLATFORMS, channelHandle, channelUrl, type PageChannel, type Platform } from '@/lib/agency'
import type { Agency } from '@/data/useAgency'
import type { Clients } from '@/data/useClients'
import type { Pages } from '@/data/usePages'
import type { PageAssignments } from '@/data/usePageAssignments'
import type { PageReels } from '@/data/usePageReels'
import type { StaffPick, TeamRow } from '@/data/useClientTeam'
import type { Workspace } from '@/data/useWorkspace'

type Tab = 'dashboard' | 'content' | 'pages' | 'team' | 'details'

/** One page row on the Pages tab: the sheet's numbering (fan pages 1, 2, 3…)
 *  and its live channels, looked up once. */
interface PageRow extends Page {
  num: string
  chans: Partial<Record<Platform, PageChannel>>
}

/**
 * One client — the Client Master Sheet's tab for them, as a screen. It opens
 * on the Dashboard: the view target and the weekly numbers, i.e. the sheet
 * itself. Then its pages with their Instagram and YouTube channels, its team
 * (with history), and the details and links. What each person sees and may
 * change follows their capabilities on THIS client (lib/access.ts, enforced
 * again by the database).
 */
export function ClientPage({
  ws, agency, client, clients, pages, pageAssignments, pageReels, toast, onBack, work,
}: {
  ws: Workspace
  agency: Agency
  client: Client
  clients: Clients
  pages: Pages
  pageAssignments: PageAssignments
  pageReels: PageReels
  toast: (m: string) => void
  onBack: () => void
  /** Content items and tasks (0044) — the Content tab shows when given. */
  work?: WorkKit
}) {
  const { access, team, lists, channels } = agency
  const ref = { id: client.id, departmentId: client.departmentId }
  const canManage = access.canForClient(ref, 'manage_clients')
  const canAssignPages = access.canForClient(ref, 'assign_team')
  const canMoney = access.canForClient(ref, 'see_client_money')
  const canTargets = access.canForClient(ref, 'view_targets')
  const canDashboard = canTargets || access.canReadViews(ref)

  // Per client: opening another client starts on its Dashboard again, while a
  // refresh keeps the tab you were reading. Always 'dashboard' to begin with —
  // who may see it is only known once access has loaded, a moment after this
  // mounts, and shownTab covers the people who never may.
  const [tab, setTab] = usePersistedState<Tab>('agency-client-tab:' + client.id, 'dashboard')
  const shownTab: Tab = tab === 'dashboard' && !canDashboard ? 'details' : tab === 'content' && !work ? 'pages' : tab
  const [editing, setEditing] = useState(false)
  const [openPageId, setOpenPageId] = useState<string | null>(null)

  const status = lists.client_statuses.find((s) => s.id === client.statusId) ?? null
  const clientPages = pages.rows.filter((p) => p.clientId === client.id)
  const liveTeam = team.rows.filter((t) => t.clientId === client.id && !t.endedAt)

  if (openPageId) {
    const page = pages.rows.find((p) => p.id === openPageId)
    if (page) {
      return (
        <div className="section">
          <PageDashboard page={page} client={client} reels={pageReels.rows.filter((r) => r.pageId === page.id)}
                         onBack={() => setOpenPageId(null)} onRefresh={() => pageReels.refresh(page.id)} />
        </div>
      )
    }
  }

  return (
    <>
      <div className="page-head">
        <button className="btn btn--sm" onClick={onBack} aria-label="Back to clients">←</button>
        <h1>{client.name}</h1>
        {client.code && <span className="emp-code">{client.code}</span>}
        {status && <Chip cls={'chip--' + status.tone}>{status.name}</Chip>}
        {!client.isActive && <Chip cls="chip--mute">Retired</Chip>}
      </div>

      <div className="tabs prof-tabs">
        {canDashboard && (
          <button className={shownTab === 'dashboard' ? 'is-on' : ''} onClick={() => setTab('dashboard')}>Dashboard</button>
        )}
        {work && (
          <button className={shownTab === 'content' ? 'is-on' : ''} onClick={() => setTab('content')}>
            Content <span className="count">{work.work.items.filter((i) => i.clientId === client.id && !i.completedAt).length}</span>
          </button>
        )}
        <button className={shownTab === 'pages' ? 'is-on' : ''} onClick={() => setTab('pages')}>
          Pages <span className="count">{clientPages.filter((p) => p.isActive).length}</span>
        </button>
        <button className={shownTab === 'team' ? 'is-on' : ''} onClick={() => setTab('team')}>
          Team <span className="count">{new Set(liveTeam.map((t) => t.employeeId)).size}</span>
        </button>
        <button className={shownTab === 'details' ? 'is-on' : ''} onClick={() => setTab('details')}>Details</button>
      </div>

      {shownTab === 'dashboard' && (
        <ClientTargets ws={ws} agency={agency} client={client} pages={clientPages} pagesHook={pages} pageAssignments={pageAssignments}
                       canViewTargets={canTargets} toast={toast} />
      )}
      {shownTab === 'content' && work && (
        <ContentSection ws={ws} agency={agency} flows={work.flows} work={work.work} clients={clients.rows} pages={pages.rows}
                        pageAssignments={pageAssignments.rows} staff={work.staff} toast={toast} clientId={client.id} />
      )}
      {shownTab === 'pages' && (
        <PagesTab agency={agency} client={client} pages={pages} pageAssignments={pageAssignments}
                  canManage={canManage} canAssign={canAssignPages} toast={toast} onOpenPage={setOpenPageId} />
      )}
      {shownTab === 'team' && <TeamTab agency={agency} client={client} toast={toast} departmentName={ws.departmentName} />}
      {shownTab === 'details' && (
        <DetailsTab agency={agency} client={client} canManage={canManage} canMoney={canMoney} toast={toast}
                    onEdit={() => setEditing(true)} departmentName={ws.departmentName} />
      )}

      {editing && (
        <ClientModal client={client} statuses={lists.client_statuses} onClose={() => setEditing(false)}
                     onSave={async (d) => {
                       const m = await clients.updateDetails(client.id, d)
                       if (!m) toast('Client saved.')
                       return m
                     }} />
      )}
      {channels.error && <div className="auth-err">{channels.error}</div>}
    </>
  )
}

/* ================================================================= Details */

function DetailsTab({
  agency, client, canManage, canMoney, toast, onEdit, departmentName,
}: {
  agency: Agency
  client: Client
  canManage: boolean
  onEdit: () => void
  canMoney: boolean
  toast: (m: string) => void
  departmentName: (id: string | null) => string | null
}) {
  const { extras, lists } = agency
  const links = extras.links.filter((l) => l.clientId === client.id).sort((a, b) => a.sortOrder - b.sortOrder)
  const moneyRow = extras.money.find((m) => m.clientId === client.id) ?? null
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [editMoney, setEditMoney] = useState(false)
  const [mv, setMv] = useState('')
  const [ps, setPs] = useState('')
  const [mn, setMn] = useState('')
  const status = lists.client_statuses.find((s) => s.id === client.statusId) ?? null

  const openMoney = () => {
    setMv(moneyRow?.monthlyValue != null ? String(moneyRow.monthlyValue) : '')
    setPs(moneyRow?.paymentStatus ?? '')
    setMn(moneyRow?.notes ?? '')
    setEditMoney(true)
  }

  return (
    <div className="section">
      <div className="ov-card">
        <div className="ov-head">
          <h4>Details</h4>
          {canManage && <button className="btn btn--sm" style={{ marginLeft: 'auto' }} onClick={onEdit}>Edit</button>}
        </div>
        <div className="hr-fields">
          <Fld l="Client ID" v={client.code} />
          <Fld l="Company" v={client.company} />
          <Fld l="Industry" v={client.industry} />
          <Fld l="Status" v={status ? <Chip cls={'chip--' + status.tone}>{status.name}</Chip> : ''} />
          <Fld l="Contact" v={client.contactName} />
          <Fld l="Phone" v={client.contactPhone ? <a href={`tel:${client.contactPhone.replace(/\s+/g, '')}`}>{client.contactPhone}</a> : ''} />
          <Fld l="Email" v={client.contactEmail ? <a href={`mailto:${client.contactEmail}`}>{client.contactEmail}</a> : ''} />
          <Fld l="Started" v={client.startedOn ? fmtDate(client.startedOn) : ''} />
          <Fld l="Contract ends" v={client.endsOn ? fmtDate(client.endsOn) : ''} />
          <Fld l="Department" v={departmentName(client.departmentId) ?? ''} />
        </div>
        {client.notes && <p className="punch-note" style={{ margin: 0 }}>{client.notes}</p>}
      </div>

      <div className="ov-card">
        <div className="ov-head"><h4>Links</h4></div>
        {links.length === 0 && !canManage && <p className="cell-mute" style={{ margin: 0 }}>No links yet.</p>}
        {links.length > 0 && (
          <div className="ov-actions">
            {links.map((l) => (
              <div className="ov-row" key={l.id} style={{ cursor: 'default' }}>
                <a className="ov-l" href={l.url} target="_blank" rel="noreferrer"><strong>{l.label}</strong></a>
                <span className="ov-cta cl-link-url">{l.url.replace(/^https?:\/\//, '')}</span>
                {canManage && (
                  <button className="icon-btn" aria-label={`Remove ${l.label}`}
                          onClick={() => void extras.removeLink(l.id).then((m) => toast(m ?? 'Link removed.'))}>×</button>
                )}
              </div>
            ))}
          </div>
        )}
        {canManage && (
          <div className="hol-add" style={{ margin: 0 }}>
            <input className="input" type="text" aria-label="Link label" placeholder="Label — e.g. Podcast sheet"
                   value={label} onChange={(e) => setLabel(e.target.value)} style={{ flex: '1 1 160px' }} />
            <input className="input" type="url" aria-label="Link address" placeholder="Paste the link"
                   value={url} onChange={(e) => setUrl(e.target.value)} style={{ flex: '2 1 220px' }} />
            <button className="btn btn--sm" disabled={!label.trim() || !url.trim()}
                    onClick={() => void extras.addLink(client.id, label, url).then((m) => { toast(m ?? 'Link added.'); if (!m) { setLabel(''); setUrl('') } })}>
              Add link
            </button>
          </div>
        )}
      </div>

      {canMoney && (
        <div className="ov-card">
          <div className="ov-head">
            <h4>Money</h4>
            {!editMoney && <button className="btn btn--sm" style={{ marginLeft: 'auto' }} onClick={openMoney}>{moneyRow ? 'Edit' : 'Add'}</button>}
          </div>
          {editMoney ? (
            <>
              <div className="field-grid">
                <div className="field">
                  <label htmlFor="cmValue">Monthly value (₹)</label>
                  <input className="input" id="cmValue" inputMode="numeric" value={mv} onChange={(e) => setMv(e.target.value.replace(/[^\d.]/g, ''))} />
                </div>
                <div className="field">
                  <label htmlFor="cmStatus">Payment status</label>
                  <input className="input" id="cmStatus" list="cmStatuses" value={ps} onChange={(e) => setPs(e.target.value)} />
                  <datalist id="cmStatuses"><option value="Paid" /><option value="Pending" /><option value="Overdue" /></datalist>
                </div>
              </div>
              <div className="field">
                <label htmlFor="cmNotes">Notes</label>
                <input className="input" id="cmNotes" value={mn} onChange={(e) => setMn(e.target.value)} />
              </div>
              <div className="td-flex" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn--sm" onClick={() => setEditMoney(false)}>Cancel</button>
                <button className="btn btn--sm btn--primary"
                        onClick={() => void extras.saveMoney(client.id, { monthlyValue: mv ? Number(mv) : null, paymentStatus: ps, notes: mn })
                          .then((m) => { toast(m ?? 'Saved.'); if (!m) setEditMoney(false) })}>
                  Save
                </button>
              </div>
            </>
          ) : moneyRow ? (
            <div className="hr-fields">
              <Fld l="Monthly value" v={moneyRow.monthlyValue != null ? money(moneyRow.monthlyValue) : ''} />
              <Fld l="Payment" v={moneyRow.paymentStatus} />
              <Fld l="Notes" v={moneyRow.notes} />
              <Fld l="Updated" v={moneyRow.updatedAt ? fmtDate(moneyRow.updatedAt) : ''} />
            </div>
          ) : <p className="cell-mute" style={{ margin: 0 }}>Nothing recorded yet. Only people who may see client money see this card.</p>}
        </div>
      )}

    </div>
  )
}

/** One label / value pair — the same small component HrPage uses. */
const Fld = ({ l, v }: { l: string; v: React.ReactNode }) => (
  <div className="hr-fld"><div className="l">{l}</div><div className="v">{v || '—'}</div></div>
)

/* =================================================================== Pages */

function PagesTab({
  agency, client, pages, pageAssignments, canManage, canAssign, toast, onOpenPage,
}: {
  agency: Agency
  client: Client
  pages: Pages
  pageAssignments: PageAssignments
  canManage: boolean
  canAssign: boolean
  toast: (m: string) => void
  onOpenPage: (id: string) => void
}) {
  const { channels, lists, team, accessData } = agency
  const { assignableStaff } = team
  const [editing, setEditing] = useState<Page | 'new' | null>(null)
  const [statusMenu, setStatusMenu] = useState<{ anchor: HTMLElement; page: Page } | null>(null)
  const [assignMenu, setAssignMenu] = useState<{ anchor: HTMLElement; page: Page } | null>(null)
  const [people, setPeople] = useState<StaffPick[] | null>(null)
  const [showRetired, setShowRetired] = useState(false)

  // The people a page can go to — fetched once, the first time it is needed.
  useEffect(() => {
    if (!assignMenu || people) return
    let alive = true
    void assignableStaff(client.id).then((p) => { if (alive) setPeople(p) })
    return () => { alive = false }
  }, [assignMenu, people, assignableStaff, client.id])

  const rows: PageRow[] = useMemo(() => {
    const mine = pages.rows.filter((p) => p.clientId === client.id)
    const ordered = [
      ...mine.filter((p) => p.pageType === 'main').sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      ...mine.filter((p) => p.pageType === 'fan').sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    ]
    let fan = 0
    return ordered.map((p) => {
      const chans: Partial<Record<Platform, PageChannel>> = {}
      for (const c of channels.rows) if (c.pageId === p.id && c.isActive) chans[c.platform] = c
      return { ...p, num: p.pageType === 'main' ? 'Main' : String(++fan), chans }
    })
  }, [pages.rows, channels.rows, client.id])

  const shown = rows.filter((r) => r.isActive || showRetired)
  const retired = rows.length - rows.filter((r) => r.isActive).length
  const hasFb = rows.some((r) => r.chans.facebook)
  const pageHolderRole = accessData.roles.find((r) => r.pageHolder && r.isActive) ?? null
  const nameOf = (employeeId: string) =>
    team.rows.find((t) => t.employeeId === employeeId)?.fullName
    ?? people?.find((p) => p.id === employeeId)?.fullName
    ?? 'Someone'

  const savePage = async (page: Page | null, d: PageDraft): Promise<string | null> => {
    let pageId = page?.id ?? null
    if (!page) {
      const r = await pages.create({ clientId: client.id, pageType: d.pageType, label: d.label })
      if (r.error || !r.id) return r.error ?? 'Could not add the page.'
      pageId = r.id
    } else if (d.label.trim() !== page.label || d.pageType !== page.pageType) {
      const m = await pages.updateMeta(page.id, { label: d.label, pageType: d.pageType })
      if (m) return m
    }
    for (const p of PLATFORMS) {
      const input = d.channels[p].trim()
      const existing = channels.rows.find((c) => c.pageId === pageId && c.platform === p && c.isActive)
      if (!input && existing) {
        const m = await channels.retire(existing.id)
        if (m) return m
      } else if (input) {
        const handle = channelHandle(p, input)
        const url = /^https?:\/\//i.test(input) ? input : channelUrl(p, handle)
        if (!existing || existing.handle !== handle || existing.url !== url) {
          const m = await channels.save(pageId!, p, handle, url)
          if (m) return m
        }
      }
    }
    toast(page ? 'Page saved.' : 'Page added.')
    return null
  }

  const assign = async (page: Page, person: StaffPick) => {
    const wasOnTeam = team.rows.some((t) => t.clientId === client.id && t.employeeId === person.id && !t.endedAt)
    const m = await pageAssignments.assign(page.id, person.id)
    if (m) { toast(m); return }
    if (!wasOnTeam && pageHolderRole) {
      // The database adds them to the team itself (0036); demo mode has no
      // database, so it does the same thing by hand.
      if (isDemo()) await team.add(client.id, person, pageHolderRole.id)
      else await team.reload()
      toast(`Assigned — ${person.fullName} is on the team as ${pageHolderRole.name} now too.`)
    } else toast('Assigned.')
  }

  const cols: GridCol<PageRow>[] = [
    { key: 'num', label: '#', width: 56, render: (r) => <span className="cell-idx">{r.num}</span> },
    {
      key: 'page', label: 'Page', width: 190,
      render: (r) => (
        <span className="td-flex">
          <span className="cell-strong">{r.label || r.chans.instagram?.handle || INCENTIVE_PAGE_TYPE[r.pageType]}</span>
          {!r.isActive && <Chip cls="chip--mute">Retired</Chip>}
        </span>
      ),
    },
    ...(['instagram', 'youtube', ...(hasFb ? ['facebook'] as const : [])] as Platform[]).map((p): GridCol<PageRow> => ({
      key: p, label: PLATFORM[p].label, width: 170,
      render: (r) => {
        const c = r.chans[p]
        if (!c) return <span className="cell-dash">—</span>
        return <a href={c.url || channelUrl(p, c.handle)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{c.handle}</a>
      },
    })),
    {
      key: 'status', label: 'Colour', width: 120,
      render: (r) => {
        const s = lists.page_statuses.find((x) => x.id === r.statusId)
        const chip = s ? <Chip cls={'chip--' + s.tone}>{s.name}</Chip> : <span className="cell-dash">—</span>
        return canManage
          ? <button className="cell-edit-plain" onClick={(e) => { e.stopPropagation(); setStatusMenu({ anchor: e.currentTarget, page: r }) }}>{chip}</button>
          : chip
      },
    },
    {
      key: 'holders', label: 'Held by', width: 230,
      render: (r) => {
        const held = pageAssignments.rows.filter((a) => a.pageId === r.id)
        return (
          <span className="td-flex" onClick={(e) => e.stopPropagation()}>
            {held.length === 0 && !canAssign && <span className="cell-dash">Nobody</span>}
            {held.map((a) => (
              <Chip key={a.id} cls="chip--mute">
                {nameOf(a.employeeId).split(' ')[0]}
                {canAssign && (
                  <button className="chip-x" aria-label={`Take the page off ${nameOf(a.employeeId)}`}
                          onClick={() => void pageAssignments.unassign(a.id).then((m) => toast(m ?? 'Unassigned.'))}>×</button>
                )}
              </Chip>
            ))}
            {canAssign && r.isActive && (
              <button className="link-btn" onClick={(e) => setAssignMenu({ anchor: e.currentTarget, page: r })}>+ Assign</button>
            )}
          </span>
        )
      },
    },
    ...(canManage ? [{
      key: 'acts', label: '', width: 150,
      render: (r: PageRow) => (
        <span className="td-flex" onClick={(e) => e.stopPropagation()}>
          <button className="btn btn--sm" onClick={() => setEditing(r)}>Edit</button>
          <button className="btn btn--sm"
                  onClick={() => void pages.setActive(r.id, !r.isActive).then((m) => toast(m ?? (r.isActive ? 'Page retired.' : 'Page restored.')))}>
            {r.isActive ? 'Retire' : 'Restore'}
          </button>
        </span>
      ),
    }] : []),
  ]

  return (
    <div className="section">
      <div className="section-head">
        <h3>Pages</h3>
        <div className="section-tools section-tools--tight">
          {retired > 0 && (
            <button className="link-btn" onClick={() => setShowRetired((v) => !v)}>
              {showRetired ? 'Hide retired' : `Show ${retired} retired`}
            </button>
          )}
          {canManage && <button className="btn btn--sm btn--primary" onClick={() => setEditing('new')}>+ Page</button>}
        </div>
      </div>
      <DataGrid cols={cols} rows={shown} storageKey={'client-pages-' + (hasFb ? 'fb' : 'std') + (canManage ? '-m' : '')}
                onRowClick={(r) => onOpenPage(r.id)}
                empty={canManage ? 'No pages yet — add the main page and the fan pages.' : 'No pages on this client yet.'}
                foot={<div className="grid-foot">
                  <span>{count(rows.filter((r) => r.isActive && r.pageType === 'main').length, 'main page')} · {count(rows.filter((r) => r.isActive && r.pageType === 'fan').length, 'fan page')}</span>
                  <span className="grid-hint">Click a page for its reels</span>
                </div>} />

      {editing && (
        <PageModal page={editing === 'new' ? null : editing}
                   channels={editing === 'new' ? [] : channels.rows.filter((c) => c.pageId === editing.id)}
                   onClose={() => setEditing(null)}
                   onSave={(d) => savePage(editing === 'new' ? null : editing, d)} />
      )}
      {statusMenu && (
        <Menu anchor={statusMenu.anchor}
              current={statusMenu.page.statusId ?? ''}
              items={[{ value: '', label: 'No colour' }, ...lists.page_statuses.filter((s) => s.isActive).map((s) => ({
                value: s.id, node: <Chip cls={'chip--' + s.tone}>{s.name}</Chip>,
              }))]}
              onPick={(v) => void pages.updateMeta(statusMenu.page.id, { statusId: v || null }).then((m) => toast(m ?? 'Colour saved.'))}
              onClose={() => setStatusMenu(null)} />
      )}
      {assignMenu && (
        <Menu anchor={assignMenu.anchor}
              items={people === null
                ? [{ value: '', label: 'Loading…' }]
                : people.filter((p) => !pageAssignments.rows.some((a) => a.pageId === assignMenu.page.id && a.employeeId === p.id))
                  .sort((a, b) => Number(b.departmentId === client.departmentId) - Number(a.departmentId === client.departmentId) || a.fullName.localeCompare(b.fullName))
                  .map((p) => ({ value: p.id, label: p.fullName + (p.designation ? ` — ${p.designation}` : '') }))}
              onPick={(v) => { const person = people?.find((p) => p.id === v); if (person) void assign(assignMenu.page, person) }}
              onClose={() => setAssignMenu(null)} />
      )}
    </div>
  )
}

/* ==================================================================== Team */

function TeamTab({
  agency, client, toast, departmentName,
}: {
  agency: Agency
  client: Client
  toast: (m: string) => void
  departmentName: (id: string | null) => string | null
}) {
  const { access, accessData, team } = agency
  const ref = { id: client.id, departmentId: client.departmentId }
  const [adding, setAdding] = useState<string | null | undefined>(undefined)
  const [history, setHistory] = useState(false)
  const assignable = access.assignableRoles(ref)
  const rows = team.rows.filter((t) => t.clientId === client.id)
  const live = rows.filter((t) => !t.endedAt)
  const past = rows.filter((t) => t.endedAt).sort((a, b) => (b.endedAt ?? '').localeCompare(a.endedAt ?? ''))
  const clientRoles = accessData.roles.filter((r) => r.clientScoped).sort((a, b) => a.sortOrder - b.sortOrder)
  // Every per-client role somebody holds here, plus any this person could fill.
  const shownRoles = clientRoles.filter((r) => live.some((t) => t.roleId === r.id) || (r.isActive && assignable.some((a) => a.id === r.id)))

  const end = async (t: TeamRow) => {
    const last = live.filter((x) => x.employeeId === t.employeeId).length === 1
    const role = accessData.roles.find((r) => r.id === t.roleId)?.name ?? 'this role'
    if (!window.confirm(`Take ${t.fullName} off ${client.name} as ${role}?`
      + (last ? ' It is their last role here, so any of this client\'s pages they hold go back too.' : ''))) return
    const m = await team.end(t.id)
    toast(m ?? `${t.fullName} is off the team.`)
  }

  return (
    <div className="section">
      <div className="section-head">
        <h3>Team</h3>
        <div className="section-tools section-tools--tight">
          {past.length > 0 && (
            <button className="link-btn" onClick={() => setHistory((v) => !v)}>{history ? 'Hide past' : `Past team (${past.length})`}</button>
          )}
          {assignable.length > 0 && <button className="btn btn--sm btn--primary" onClick={() => setAdding(null)}>+ Add</button>}
        </div>
      </div>

      {shownRoles.length === 0 ? (
        <div className="banner"><div><div className="d">Nobody is on this client yet.</div></div></div>
      ) : (
        <div className="ov-actions">
          {shownRoles.map((r) => {
            const inRole = live.filter((t) => t.roleId === r.id)
            const canAdd = assignable.some((a) => a.id === r.id)
            return (
              <div className="ov-row tm-row" key={r.id} style={{ cursor: 'default' }}>
                <span className="tm-role">{r.name}</span>
                <span className="tm-people">
                  {inRole.length === 0 && <span className="cell-dash">Nobody yet</span>}
                  {inRole.map((t) => (
                    <Chip key={t.id} cls="chip--accent">
                      <span title={`${t.designation || 'On the team'} · since ${fmtDate(t.assignedAt)}`}>{t.fullName}</span>
                      {access.canAssign(ref, t.roleId) && (
                        <button className="chip-x" aria-label={`Take ${t.fullName} off as ${r.name}`} onClick={() => void end(t)}>×</button>
                      )}
                    </Chip>
                  ))}
                </span>
                {canAdd && <button className="link-btn" onClick={() => setAdding(r.id)}>+ {r.name}</button>}
              </div>
            )
          })}
        </div>
      )}

      {history && (
        <div className="ov-card">
          <div className="ov-head"><h4>Past team</h4></div>
          <div className="ov-feed">
            {past.map((t) => (
              <div className="ov-ev" key={t.id}>
                <span className="ov-ev-nm">{t.fullName}</span>
                <span className="ov-ev-what">{accessData.roles.find((r) => r.id === t.roleId)?.name ?? 'Role'}</span>
                <span className="ov-ev-at">{fmtDate(t.assignedAt)} → {fmtDate(t.endedAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {adding !== undefined && (
        <AssignModal clientName={client.name} roles={assignable} initialRoleId={adding}
                     team={rows} departmentName={departmentName}
                     loadPeople={() => team.assignableStaff(client.id)}
                     onClose={() => setAdding(undefined)}
                     onSave={async (person, roleId) => {
                       const m = await team.add(client.id, person, roleId)
                       if (!m) toast(`${person.fullName} added.`)
                       return m
                     }} />
      )}
    </div>
  )
}
