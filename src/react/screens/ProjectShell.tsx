import { useEffect, useMemo, useState } from 'react'
import { AccountControls } from '@/components/AccountControls'
import { useHoverTip } from '@/components/HoverTip'
import { Rail } from '@/components/Rail'
import { BottomNav, NAV_ICONS } from '@/components/BottomNav'
import { DensitySlider } from '@/components/DensitySlider'
import { Chip, IconBtn } from '@/components/bits'
import { usePanes } from '@/lib/usePanes'
import { usePersistedState } from '@/lib/usePersistedState'
import { isConverted, type Lead } from '@/lib/types'
import type { Workspace } from '@/data/useWorkspace'
import { isOwnerLevel } from '@/lib/hr'
import { ImportModal } from '@/modals/ImportModal'
import { SaleModal } from '@/modals/SaleModal'
import { HistoryModal } from '@/modals/HistoryModal'
import { AddLeadModal } from '@/modals/AddLeadModal'
import { CompanyAdminModal } from '@/modals/CompanyAdminModal'
import { Overview } from './sections/Overview'
import { Leads } from './sections/Leads'
import { Sales } from './sections/Sales'
import { Team } from './sections/Team'

/** 'dash' is gone. "Sales dashboard" was a fifth section showing the same
 *  converted leads the Sales table already holds, summarised — so it is a
 *  Deals/Dashboard switch on Sales' own heading line now (THE LAYOUT LAW,
 *  rule 1: it joins a row that already exists), and the slot it was using
 *  goes to Profile, which every screen in this app owes its fifth tab. */
export type SecId = 'overview' | 'leads' | 'sales' | 'team'

const ICONS: Record<SecId, React.ReactNode> = {
  overview: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>,
  leads: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /></svg>,
  sales: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M12 2v20M17 6.5c0-2-2.2-3-5-3s-5 .9-5 2.8c0 3.7 10 2.2 10 5.9 0 2-2.2 3.1-5 3.1s-5-1.1-5-3.1" /></svg>,
  team: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M3 20V10M9 20V4M15 20v-7M21 20v-11" /></svg>,
}
const LABEL: Record<SecId, string> = {
  overview: 'Overview', leads: 'Leads', sales: 'Sales', team: 'Team tracking',
}
const ORDER: SecId[] = ['overview', 'leads', 'sales', 'team']
/** "Team tracking" does not fit a 75px tab. The sidebar
 *  keeps the full names; only the phone's tab bar uses these. */
const SHORT: Record<SecId, string> = {
  overview: 'Overview', leads: 'Leads', sales: 'Sales', team: 'Team',
}

export function ProjectShell({
  ws, projectId, onBack, onOpenProject, onOpenTeam, onOpenHr, onOpenProfile, toast,
}: {
  ws: Workspace
  projectId: string
  onBack: () => void
  onOpenProject: (id: string) => void
  onOpenTeam: () => void
  onOpenHr: () => void
  onOpenProfile: () => void
  toast: (m: string) => void
}) {
  // The dialogs live here because this is the level that knows the project.
  const [importOpen, setImportOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [saleFor, setSaleFor] = useState<Lead | null>(null)
  const [historyFor, setHistoryFor] = useState<Lead | null>(null)
  const [adminOpen, setAdminOpen] = useState(false)
  const [storedSec, setSec] = usePersistedState<SecId | 'dash'>('project-sec:' + projectId, 'overview')
  /* sessionStorage can still be holding 'dash' from before this round — a
     value no branch below renders, which would paint an empty page. It means
     "the money summary", so it lands on Sales with Dashboard already picked. */
  const sec: SecId = storedSec === 'dash' ? 'sales' : storedSec
  const salesOpensOnDashboard = storedSec === 'dash'

  /** One tab, built from the same LABEL/SHORT/ICONS the rail's links use, so
   *  the two can never describe a section differently. */
  const tab = (id: SecId) => ({
    key: id, label: LABEL[id], short: SHORT[id], icon: ICONS[id], onClick: () => setSec(id),
  })

  const panes = usePanes()
  const tip = useHoverTip()

  const project = ws.projects.find((p) => p.id === projectId)
  const leads = useMemo(() => ws.leads.filter((l) => l.projectId === projectId), [ws.leads, projectId])
  const conv = useMemo(() => leads.filter(isConverted), [leads])
  // HR = owner (0040): the assign / verify view, not a salesperson's.
  const isOwner = isOwnerLevel(ws)

  // Only the people actually on this project belong in its team figures.
  const members = useMemo(() => {
    const ids = new Set(leads.map((l) => l.ownerId).filter(Boolean) as string[])
    const on = ws.members.filter((m) => ids.has(m.id))
    return on.length ? on : ws.members.filter((m) => m.role === 'member')
  }, [ws.members, leads])

  // A section switch changes what the grid measures against, so let it re-place.
  useEffect(() => { window.dispatchEvent(new Event('resize')) }, [sec])

  return (
    <div className="screen screen--app is-active">
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
                onChange={(e) => (
                  e.target.value === '__all' ? onBack()
                  : e.target.value === '__team' ? onOpenTeam()
                  : onOpenProject(e.target.value)
                )}>
          <option value="__all">← All projects</option>
          {ws.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          <option value="__team">Team</option>
        </select>
        <div className="topbar-right">
          <AccountControls ws={ws} variant="topbar" hasRail extra={<DensitySlider />} roleLabel={ws.me?.email ?? 'Owner'}
                           onOpenProfile={onOpenProfile} />
        </div>
      </div>

      <div className="shell">
        <Rail ws={ws} roleLabel={ws.me?.email ?? 'Owner'} onOpenProfile={onOpenProfile} active={projectId} panes={panes} tip={tip}
              onOpenProjects={onBack} onOpenProject={onOpenProject}
              onOpenTeam={onOpenTeam} onOpenHr={onOpenHr} onOpenSettings={() => setAdminOpen(true)} />

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
          <div className="wrap">
            {sec === 'overview' && <Overview leads={leads} conv={conv} events={ws.events} onGo={(s) => setSec(s)} />}
            {sec === 'leads' && (
              <Leads ws={ws} leads={leads} members={ws.members} isOwner={isOwner} meId={ws.me?.id ?? null}
                     onImport={() => setImportOpen(true)} onAdd={() => setAddOpen(true)}
                     onHistory={setHistoryFor} onNeedsSale={setSaleFor} toast={toast} />
            )}
            {sec === 'sales' && (
              <Sales ws={ws} conv={conv} leads={leads} members={ws.members} isOwner={isOwner}
                     openOnDashboard={salesOpensOnDashboard} toast={toast} />
            )}
            {sec === 'team' && <Team leads={leads} members={members} />}
          </div>
        </div>
      </div>

      {/* Inside a project the bar is the project's sections — this is where
          the owner actually works, and burying it behind a dropdown to keep
          the bar identical everywhere would have cost them the fastest path
          they have. The pattern is what is uniform: four daily destinations,
          then Profile, fifth, always. */}
      <BottomNav
        active={sec}
        items={[
          tab('overview'), tab('leads'), tab('sales'), tab('team'),
          { key: 'profile', label: 'Profile', icon: NAV_ICONS.profile, onClick: onOpenProfile },
        ]}
      />

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

      {adminOpen && <CompanyAdminModal ws={ws} onClose={() => setAdminOpen(false)} />}
    </div>
  )
}
