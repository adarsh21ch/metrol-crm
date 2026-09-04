import { useEffect, useMemo, useState } from 'react'
import { ThemeToggle } from '@/components/ThemeToggle'
import { useHoverTip } from '@/components/HoverTip'
import { Avatar, Chip, IconBtn } from '@/components/bits'
import { usePanes } from '@/lib/usePanes'
import { initials } from '@/lib/format'
import { isConverted, type Lead } from '@/lib/types'
import type { Workspace } from '@/data/useWorkspace'
import { ImportModal } from '@/modals/ImportModal'
import { SaleModal } from '@/modals/SaleModal'
import { HistoryModal } from '@/modals/HistoryModal'
import { AddLeadModal } from '@/modals/AddLeadModal'
import { ProfileModal } from '@/modals/ProfileModal'
import { Overview } from './sections/Overview'
import { Leads } from './sections/Leads'
import { Sales } from './sections/Sales'
import { Team } from './sections/Team'
import { Dashboard } from './sections/Dashboard'

export type SecId = 'overview' | 'leads' | 'sales' | 'team' | 'dash'

const ICONS: Record<SecId, React.ReactNode> = {
  overview: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>,
  leads: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /></svg>,
  sales: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M12 2v20M17 6.5c0-2-2.2-3-5-3s-5 .9-5 2.8c0 3.7 10 2.2 10 5.9 0 2-2.2 3.1-5 3.1s-5-1.1-5-3.1" /></svg>,
  team: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M3 20V10M9 20V4M15 20v-7M21 20v-11" /></svg>,
  dash: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M3 3v18h18" /><path d="M7 14l4-4 3 3 5-6" /></svg>,
}
const LABEL: Record<SecId, string> = {
  overview: 'Overview', leads: 'Leads', sales: 'Sales', team: 'Team tracking', dash: 'Sales dashboard',
}
const ORDER: SecId[] = ['overview', 'leads', 'sales', 'team', 'dash']

export function ProjectShell({
  ws, projectId, onBack, onOpenProject, toast,
}: {
  ws: Workspace
  projectId: string
  onBack: () => void
  onOpenProject: (id: string) => void
  toast: (m: string) => void
}) {
  // The dialogs live here because this is the level that knows the project.
  const [importOpen, setImportOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [saleFor, setSaleFor] = useState<Lead | null>(null)
  const [historyFor, setHistoryFor] = useState<Lead | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [sec, setSec] = useState<SecId>('overview')
  const [dense, setDense] = useState<'compact' | 'comfortable'>(() => {
    try { return localStorage.getItem('metrol-crm-dense') === 'comfortable' ? 'comfortable' : 'compact' } catch { return 'compact' }
  })
  useEffect(() => {
    try { localStorage.setItem('metrol-crm-dense', dense) } catch { /* a reading preference */ }
  }, [dense])

  const panes = usePanes()
  const tip = useHoverTip()

  const project = ws.projects.find((p) => p.id === projectId)
  const leads = useMemo(() => ws.leads.filter((l) => l.projectId === projectId), [ws.leads, projectId])
  const conv = useMemo(() => leads.filter(isConverted), [leads])
  const isOwner = ws.me?.role === 'owner'

  // Only the people actually on this project belong in its team figures.
  const members = useMemo(() => {
    const ids = new Set(leads.map((l) => l.ownerId).filter(Boolean) as string[])
    const on = ws.members.filter((m) => ids.has(m.id))
    return on.length ? on : ws.members.filter((m) => m.role === 'member')
  }, [ws.members, leads])

  // A section switch changes what the grid measures against, so let it re-place.
  useEffect(() => { window.dispatchEvent(new Event('resize')) }, [sec])

  return (
    <div className={'screen screen--app is-active' + (dense === 'comfortable' ? ' dense-comfortable' : '')}>
      <div className="topbar">
        <IconBtn title="Back to projects" onClick={onBack}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </IconBtn>
        <div className="topbar-title">
          <h2>{project?.name ?? '—'}</h2>
          {project && (
            <Chip cls={project.status === 'active' ? 'chip--good' : 'chip--mute'}>
              {project.status === 'active' ? 'Active' : project.status === 'paused' ? 'Paused' : 'Done'}
            </Chip>
          )}
        </div>
        <select className="proj-select" aria-label="Switch project" value={projectId}
                onChange={(e) => (e.target.value === '__all' ? onBack() : onOpenProject(e.target.value))}>
          <option value="__all">← All projects</option>
          {ws.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div className="topbar-right">
          <ThemeToggle />
          <div className="seg" id="density">
            <button className={dense === 'compact' ? 'is-on' : ''} onClick={() => setDense('compact')}>Compact</button>
            <button className={dense === 'comfortable' ? 'is-on' : ''} onClick={() => setDense('comfortable')}>Comfortable</button>
          </div>
          <button className="user-chip" title="My profile" onClick={() => setProfileOpen(true)}>
            <Avatar lg src={ws.me?.avatarUrl}>{initials(ws.me?.name ?? '?')}</Avatar>
            <div>
              <div className="name">{isOwner ? 'Owner' : (ws.me?.name ?? '')}</div>
              <div className="role">{ws.me?.email}</div>
            </div>
          </button>
        </div>
      </div>

      <div className="shell">
        <nav className={'rail' + (panes.railWide ? ' is-wide' : '')} aria-label="Projects">
          <div className="rail-list">
            <button className="rail-btn" onClick={onBack} aria-label="All projects" {...tip.bind('All projects')}>
              <span className="rail-mark">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                  <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
                  <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
                </svg>
              </span>
              <span className="rail-name">All projects</span>
            </button>
            <span className="rail-sep" />
            {ws.projects.map((p) => (
              <button key={p.id} className={'rail-btn' + (p.id === projectId ? ' is-on' : '')}
                      onClick={() => onOpenProject(p.id)} {...tip.bind(p.name)}>
                <span className="rail-mark">{initials(p.name)}</span>
                <span className="rail-name">{p.name}</span>
              </button>
            ))}
          </div>
          <button className="rail-toggle" onClick={panes.toggleRail} aria-label="Show project names">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d={panes.railWide ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} />
            </svg>
          </button>
          <span className="pane-rz" title="Drag to widen · double-click to reset"
                onPointerDown={panes.dragHandle('rail')} onDoubleClick={panes.resetPane('rail')} />
        </nav>

        <nav className={'sidebar' + (panes.sideMini ? ' is-mini' : '')}>
          <div className="side-head">
            <div className="side-label">{project?.name ?? 'Project'}</div>
            <button className="side-toggle" onClick={panes.toggleSide} aria-label="Collapse sidebar">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={panes.sideMini ? 'M9 18l6-6-6-6' : 'M15 18l-6-6 6-6'} />
              </svg>
            </button>
          </div>
          {ORDER.map((id) => (
            <button key={id} className={'side-link' + (sec === id ? ' is-on' : '')}
                    onClick={() => setSec(id)} {...(panes.sideMini ? tip.bind(LABEL[id]) : {})}>
              {ICONS[id]}
              <span className="side-nm">{LABEL[id]}</span>
              {id === 'leads' && <span className="count">{leads.length}</span>}
              {id === 'sales' && <span className="count">{conv.length}</span>}
            </button>
          ))}
          <div className="side-foot">Every number here is calculated from the rows in the tables.</div>
          <span className="pane-rz" title="Drag to resize · double-click to reset"
                onPointerDown={panes.dragHandle('side')} onDoubleClick={panes.resetPane('side')} />
        </nav>

        <div className="workspace">
          <div className="mobile-nav">
            {ORDER.map((id) => (
              <button key={id} className={sec === id ? 'is-on' : ''} onClick={() => setSec(id)}>{LABEL[id]}</button>
            ))}
          </div>
          <div className="wrap">
            {sec === 'overview' && <Overview leads={leads} conv={conv} events={ws.events} onGo={(s) => setSec(s)} />}
            {sec === 'leads' && (
              <Leads ws={ws} leads={leads} members={ws.members} isOwner={isOwner} meId={ws.me?.id ?? null}
                     onImport={() => setImportOpen(true)} onAdd={() => setAddOpen(true)}
                     onHistory={setHistoryFor} onNeedsSale={setSaleFor} toast={toast} />
            )}
            {sec === 'sales' && <Sales ws={ws} conv={conv} members={ws.members} isOwner={isOwner} toast={toast} />}
            {sec === 'team' && <Team leads={leads} members={members} />}
            {sec === 'dash' && <Dashboard conv={conv} leads={leads} members={members} />}
          </div>
        </div>
      </div>

      {tip.node}

      {importOpen && (
        <ImportModal
          members={ws.members} projectLeads={leads} projectName={project?.name ?? 'this project'}
          onClose={() => setImportOpen(false)}
          onImport={async (rows, bulkOwner) => {
            const r = await ws.addLeads(projectId, rows.map((x) => ({ ...x, ownerId: x.ownerId ?? bulkOwner })))
            setImportOpen(false)
            const who = bulkOwner ? ws.members.find((m) => m.id === bulkOwner)?.name : null
            toast(r.error
              ? 'Import failed: ' + r.error
              : `${r.added} lead${r.added === 1 ? '' : 's'} imported into ${project?.name ?? 'this project'}` +
                (who ? ` and assigned to ${who}` : ''))
          }}
        />
      )}

      {addOpen && (
        <AddLeadModal
          members={ws.members}
          onClose={() => setAddOpen(false)}
          onSave={async (row, ownerId) => {
            const r = await ws.addLeads(projectId, [{ ...row, ownerId }])
            setAddOpen(false)
            toast(r.error ? 'Could not add: ' + r.error : `${row.name} added`)
          }}
        />
      )}

      {saleFor && (
        <SaleModal
          lead={saleFor}
          onClose={() => setSaleFor(null)}
          onSave={async (amount) => {
            const by = ws.members.find((m) => m.id === saleFor.ownerId)?.name ?? 'Owner'
            await ws.recordSale(saleFor, amount, by)
            toast(`${saleFor.name} — sale recorded`)
            setSaleFor(null)
          }}
        />
      )}

      {historyFor && (
        <HistoryModal
          lead={ws.leads.find((l) => l.id === historyFor.id) ?? historyFor}
          events={ws.events} members={ws.members}
          projectName={project?.name ?? '—'}
          onClose={() => setHistoryFor(null)}
        />
      )}

      {profileOpen && <ProfileModal ws={ws} onClose={() => setProfileOpen(false)} />}
    </div>
  )
}
