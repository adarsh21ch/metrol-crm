import { useMemo, useState } from 'react'
import { DataGrid, type GridCol } from '@/components/DataGrid'
import { LeadsBoard } from '@/components/LeadsBoard'
import { Menu, type MenuItem } from '@/components/Menu'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Avatar, Chip, EditChip, IconBtn, Kpi } from '@/components/bits'
import { SaleModal } from '@/modals/SaleModal'
import { HistoryModal } from '@/modals/HistoryModal'
import { ProfileModal } from '@/modals/ProfileModal'
import { agoDays, daysSince, money, pct } from '@/lib/format'
import { QUALITY, STATUS, isConnected, isConverted, type Lead, type LeadStatus, type Quality } from '@/lib/types'
import { supabase } from '@/lib/supabase'
import type { Workspace } from '@/data/useWorkspace'

type LeadsView = 'list' | 'board'
const LEADS_VIEW_KEY = 'metrol-crm-leadsview'

/** The salesperson's whole app: the leads the owner handed them, and what they
 *  closed. They set status and quality; they never see anybody else's rows —
 *  and the row level security means that is true of the data, not just the UI. */
export function Member({ ws, toast }: { ws: Workspace; toast: (m: string) => void }) {
  const [dense, setDense] = useState<'compact' | 'comfortable'>('compact')
  const [edit, setEdit] = useState<{ kind: 'status' | 'quality'; anchor: HTMLElement; lead: Lead } | null>(null)
  const [saleFor, setSaleFor] = useState<Lead | null>(null)
  const [historyFor, setHistoryFor] = useState<Lead | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [leadsView, setLeadsView] = useState<LeadsView>(() => {
    try { return localStorage.getItem(LEADS_VIEW_KEY) === 'board' ? 'board' : 'list' } catch { return 'list' }
  })
  const pickView = (v: LeadsView) => {
    setLeadsView(v)
    try { localStorage.setItem(LEADS_VIEW_KEY, v) } catch { /* a remembered view is a convenience */ }
  }

  const me = ws.me
  const mine = useMemo(() => ws.leads.filter((l) => l.ownerId === me?.id), [ws.leads, me])
  const cv = useMemo(() => mine.filter(isConverted), [mine])
  const projectName = (id: string) => ws.projects.find((p) => p.id === id)?.name ?? '—'
  const sum = (rs: Lead[]) => rs.reduce((s, l) => s + l.amount, 0)

  /** The board's drag-and-drop is a shortcut for the exact same write the list's
   *  status dropdown makes below — a lead converting still needs a sale amount,
   *  so dropping on Converted with none set opens the same modal the dropdown does. */
  async function dropStatus(l: Lead, status: LeadStatus) {
    if (status === 'converted' && !l.amount) { setSaleFor(l); return }
    await ws.setStatus(l, status, me?.name ?? 'Salesperson')
    toast(`${l.name} — status set to ${STATUS[status].label}`)
  }

  const leadCols: GridCol<Lead>[] = [
    { key: 'idx', label: '#', width: 52, render: (_l, i) => <span className="cell-idx">{i + 1}</span> },
    {
      key: 'name', label: 'Name', width: 180,
      render: (l) => (
        <span className="td-flex">
          {l.isNew && <span className="new-dot" title="New lead" />}
          <button className="name-btn" onClick={() => setHistoryFor(l)}>{l.name}</button>
        </span>
      ),
    },
    { key: 'ph', label: 'Phone', width: 152, render: (l) => <span className="cell-mono">{l.phone || '—'}</span> },
    { key: 'pr', label: 'Project', width: 158, render: (l) => <span className="cell-mute">{projectName(l.projectId)}</span> },
    {
      key: 'st', label: 'Status', width: 134,
      render: (l) => <EditChip cls={STATUS[l.status].cls} label={STATUS[l.status].label}
                       onClick={(e) => setEdit({ kind: 'status', anchor: e.currentTarget, lead: l })} />,
    },
    {
      key: 'ql', label: 'Quality', width: 126,
      render: (l) => <EditChip cls={l.quality ? QUALITY[l.quality].cls : 'chip--none'}
                       label={l.quality ? QUALITY[l.quality].label : 'Not set'}
                       onClick={(e) => setEdit({ kind: 'quality', anchor: e.currentTarget, lead: l })} />,
    },
    {
      key: 'am', label: 'Sale', width: 120,
      render: (l) => l.amount ? <span className="cell-money">{money(l.amount)}</span> : <span className="cell-mute">—</span>,
    },
  ]

  const salesCols: GridCol<Lead>[] = [
    { key: 'idx', label: '#', width: 52, render: (_l, i) => <span className="cell-idx">{i + 1}</span> },
    { key: 'cust', label: 'Customer', width: 190, render: (l) => <span className="cell-strong">{l.name}</span> },
    { key: 'pr', label: 'Project', width: 170, render: (l) => <span className="cell-mute">{projectName(l.projectId)}</span> },
    { key: 'amt', label: 'Amount', width: 130, render: (l) => <span className="cell-money">{money(l.amount)}</span> },
    // The salesperson reads the payment state; only the owner sets it.
    { key: 'ver', label: 'Payment', width: 130, render: (l) => <Chip cls={l.verified ? 'chip--good' : 'chip--warn'}>{l.verified ? 'Verified' : 'Pending'}</Chip> },
    { key: 'when', label: 'Closed', width: 130, render: (l) => <span className="cell-mute">{agoDays(daysSince(l.convertedAt ?? l.createdAt))}</span> },
  ]

  const items: MenuItem[] = edit?.kind === 'status'
    ? (Object.keys(STATUS) as LeadStatus[]).map((k) => ({ value: k, label: STATUS[k].label, cls: STATUS[k].cls }))
    : edit?.kind === 'quality'
      ? (Object.keys(QUALITY) as Quality[]).map((k) => ({ value: k, label: QUALITY[k].label, cls: QUALITY[k].cls }))
      : []

  async function pick(v: string) {
    if (!edit) return
    const l = edit.lead
    if (edit.kind === 'status') {
      await dropStatus(l, v as LeadStatus)
    } else {
      await ws.setQuality(l, v as Quality, me?.name ?? 'Salesperson')
      toast(`${l.name} — marked ${QUALITY[v as Quality].label}`)
    }
  }

  const fresh = mine.filter((l) => l.isNew)
  const projects = new Set(mine.map((l) => l.projectId)).size

  return (
    <div className={'screen screen--app is-active' + (dense === 'comfortable' ? ' dense-comfortable' : '')}>
      <div className="topbar">
        <div className="brand">
          <div className="monogram">M</div>
          <div className="brand-name">Metrol Media</div>
        </div>
        <div className="topbar-right">
          <ThemeToggle />
          <div className="seg" id="density">
            <button className={dense === 'compact' ? 'is-on' : ''} onClick={() => setDense('compact')}>Compact</button>
            <button className={dense === 'comfortable' ? 'is-on' : ''} onClick={() => setDense('comfortable')}>Comfortable</button>
          </div>
          <button className="user-chip" title="My profile" onClick={() => setProfileOpen(true)}>
            <Avatar lg src={me?.avatarUrl}>{me?.initials}</Avatar>
            <div>
              <div className="name">{me?.name}</div>
              {/* Their actual department, not a word hardcoded when Sales was
                  the only one that existed. */}
              <div className="role">{ws.departmentName(me?.departmentId ?? null) ?? 'Sales'}</div>
            </div>
          </button>
          <IconBtn title="Sign out" onClick={() => void supabase.auth.signOut()}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </IconBtn>
        </div>
      </div>

      <div className="shell">
        <div className="workspace">
          <div className="wrap">
            <div className="page-head">
              <h1>My leads</h1>
              <div className="sub">Assigned to you by the owner</div>
            </div>

            {fresh.length > 0 && !dismissed && (
              <div className="banner">
                <div>
                  <div className="t">{fresh.length} new lead{fresh.length === 1 ? '' : 's'} assigned to you</div>
                  <div className="d">Call them and set a status so the owner can see where they stand.</div>
                </div>
                <button className="btn btn--sm" onClick={() => setDismissed(true)}>Got it</button>
              </div>
            )}

            <div className="kpis">
              <Kpi accent label="My leads" value={mine.length} sub={`${mine.filter((l) => l.status === 'new').length} not called yet`} />
              <Kpi label="Connected" value={mine.filter(isConnected).length} sub={`${pct(mine.filter(isConnected).length, mine.length)} of my leads`} />
              <Kpi label="Follow-ups" value={mine.filter((l) => l.status === 'follow_up').length} sub="need a next call" />
              <Kpi label="Converted" value={cv.length} sub={`${pct(cv.length, mine.length)} conversion`} />
              <Kpi label="My sales" value={money(sum(cv))} sub={`${cv.filter((l) => !l.verified).length} awaiting verification`} />
            </div>

            <div className="section">
              <div className="section-head">
                <h3>Leads</h3>
                <div className="sub">{mine.length} leads across {projects} {projects === 1 ? 'project' : 'projects'}</div>
                <div className="section-tools">
                  <div className="seg">
                    <button className={leadsView === 'list' ? 'is-on' : ''} onClick={() => pickView('list')}>List</button>
                    <button className={leadsView === 'board' ? 'is-on' : ''} onClick={() => pickView('board')}>Board</button>
                  </div>
                </div>
              </div>
              {leadsView === 'list' ? (
                <DataGrid cols={leadCols} rows={mine} storageKey="member-leads"
                          foot={<div className="grid-foot"><span>{mine.length} leads</span>
                            <span className="grid-hint">Drag a column edge to resize · <kbd>double-click</kbd> to reset</span></div>} />
              ) : (
                <LeadsBoard leads={mine} projectName={projectName} onOpenHistory={setHistoryFor} onDropStatus={(l, s) => void dropStatus(l, s)}
                            onEditQuality={(e, l) => setEdit({ kind: 'quality', anchor: e.currentTarget, lead: l })} />
              )}
            </div>

            <div className="section">
              <div className="section-head">
                <h3>My sales</h3>
                <div className="sub">{cv.length} closed · {money(sum(cv))} total</div>
              </div>
              <DataGrid cols={salesCols} rows={[...cv].sort((a, b) => daysSince(a.convertedAt ?? a.createdAt) - daysSince(b.convertedAt ?? b.createdAt))}
                        storageKey="member-sales"
                        foot={<div className="grid-foot"><span>{cv.filter((l) => l.verified).length} verified · {cv.filter((l) => !l.verified).length} pending</span></div>} />
            </div>
          </div>
        </div>
      </div>

      {edit && <Menu anchor={edit.anchor} items={items}
                     current={edit.kind === 'status' ? edit.lead.status : edit.lead.quality}
                     onPick={(v) => void pick(v)} onClose={() => setEdit(null)} />}

      {saleFor && (
        <SaleModal lead={saleFor} onClose={() => setSaleFor(null)}
          onSave={async (amount) => {
            await ws.recordSale(saleFor, amount, me?.name ?? 'Salesperson')
            toast(`${saleFor.name} — sale recorded`)
            setSaleFor(null)
          }} />
      )}

      {historyFor && (
        <HistoryModal lead={ws.leads.find((l) => l.id === historyFor.id) ?? historyFor}
          events={ws.events} members={ws.members}
          projectName={projectName(historyFor.projectId)}
          onClose={() => setHistoryFor(null)} />
      )}

      {profileOpen && <ProfileModal ws={ws} onClose={() => setProfileOpen(false)} />}
    </div>
  )
}
