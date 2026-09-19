import { useMemo, useState } from 'react'
import { DataGrid, PhoneViewPick, usePhoneView, type GridCol } from '@/components/DataGrid'
import { Rail } from '@/components/Rail'
import { BottomNav, type BottomNavItems } from '@/components/BottomNav'
import { AccountControls } from '@/components/AccountControls'
import { useHoverTip } from '@/components/HoverTip'
import { usePanes } from '@/lib/usePanes'
import { Avatar, Kpi } from '@/components/bits'
import { count, daysSince, money, pct } from '@/lib/format'
import { isConnected, isConverted, type Lead, type Member } from '@/lib/types'
import type { Workspace } from '@/data/useWorkspace'
import { CompanyAdminModal } from '@/modals/CompanyAdminModal'

interface ProjectRow {
  id: string; name: string; assigned: number; connected: number; followups: number; converted: number; sale: number
}

const sum = (rs: Lead[]) => rs.reduce((s, l) => s + l.amount, 0)

/** Every member, grouped by department — departments already exist
 *  (useWorkspace's departments state, Member.departmentId); this is the first
 *  screen that reads them as groups instead of a flat admin table. */
function MemberRoster({ ws, onOpen }: { ws: Workspace; onOpen: (id: string) => void }) {
  const groups = useMemo(() => {
    const byDept = new Map<string, Member[]>()
    for (const m of ws.members) {
      const key = m.departmentId ?? '__none'
      if (!byDept.has(key)) byDept.set(key, [])
      byDept.get(key)!.push(m)
    }
    const out: { id: string; name: string; members: Member[] }[] = []
    for (const d of [...ws.departments].sort((a, b) => a.sortOrder - b.sortOrder)) {
      const list = byDept.get(d.id)
      if (list?.length) out.push({ id: d.id, name: d.name, members: list })
    }
    const none = byDept.get('__none')
    if (none?.length) out.push({ id: '__none', name: 'No department', members: none })
    return out
  }, [ws.members, ws.departments])

  return (
    <>
      <div className="page-head">
        <h1>Team</h1>
        <div className="sub">
          {count(ws.members.length, 'person', 'people')} across {count(groups.length, 'department')}
        </div>
      </div>

      {ws.members.length === 0 && (
        <p style={{ color: 'var(--ink-3)' }}>Nobody has created an account yet.</p>
      )}

      {groups.map((g) => (
        <div className="section" key={g.id}>
          <div className="section-head">
            <h3>{g.name}</h3>
            <div className="sub">{count(g.members.length, 'person', 'people')}</div>
          </div>
          {/* THE LAYOUT LAW, rule 5 — reused directly from .proj-grid (same as
              .dept-card already does), not copied, so the two cannot drift
              apart at a breakpoint. auto-fill's column count was width-
              dependent, so no :last-child:nth-child(odd) rule could ever be
              correct at every width; proj-grid's explicit 3/2/1 ladder fixes
              that outright. At a fixed 3 columns a team card also lands wider
              on a normal desktop than auto-fill's narrowest-share packing
              ever gave it, so this does not reopen the truncation this
              file's own 280px note already fixed once. */}
          <div className="proj-grid">
            {g.members.map((m) => {
              const mine = ws.leads.filter((l) => l.ownerId === m.id)
              const cv = mine.filter(isConverted)
              return (
                <button className="team-card" key={m.id} onClick={() => onOpen(m.id)}>
                  <Avatar lg src={m.avatarUrl}>{m.initials}</Avatar>
                  <div className="team-card-body">
                    <div className="cell-strong">{m.name}</div>
                    <div className="cell-mute">{count(mine.length, 'lead')} · {cv.length} converted</div>
                  </div>
                  <div className="team-card-sale">{money(sum(cv))}</div>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </>
  )
}

/** A member's own dashboard — track record across every project, not just
 *  the one a manager happens to be looking at. sections/Team.tsx already
 *  computes almost this exact shape (assigned/connected/follow-up/converted,
 *  sales today/week/month/all-time) but scoped to a single project's leads;
 *  this is that same shape read off ws.leads globally for one member, plus a
 *  per-project breakdown so "every project" is an actual answer, not a claim. */
function MemberDashboard({ ws, member, onBack }: { ws: Workspace; member: Member; onBack: () => void }) {
  const [phoneView, setPhoneView] = usePhoneView('member-projects')
  const mine = useMemo(() => ws.leads.filter((l) => l.ownerId === member.id), [ws.leads, member])
  const cv = useMemo(() => mine.filter(isConverted), [mine])
  const since = (l: Lead) => daysSince(l.convertedAt ?? l.createdAt)
  const onDay = (d: number) => cv.filter((l) => since(l) === d)
  const within = (n: number) => cv.filter((l) => since(l) <= n)
  const deals = (n: number) => count(n, 'deal')

  const tiles = [
    { k: 'Today', v: sum(onDay(0)), s: deals(onDay(0).length) },
    { k: 'This week', v: sum(within(6)), s: deals(within(6).length) },
    { k: 'This month', v: sum(within(30)), s: deals(within(30).length) },
    { k: 'All-time', v: sum(cv), s: deals(cv.length) },
  ]

  const projectRows: ProjectRow[] = useMemo(() => ws.projects
    .map((p) => {
      const rs = mine.filter((l) => l.projectId === p.id)
      const rcv = rs.filter(isConverted)
      return {
        id: p.id, name: p.name,
        assigned: rs.length, connected: rs.filter(isConnected).length,
        followups: rs.filter((l) => l.status === 'follow_up').length,
        converted: rcv.length, sale: sum(rcv),
      }
    })
    .filter((r) => r.assigned > 0), [ws.projects, mine])

  const cols: GridCol<ProjectRow>[] = [
    { key: 'nm', label: 'Project', width: 210, render: (r) => <span className="cell-strong">{r.name}</span> },
    { key: 'as', label: 'Leads', width: 88, render: (r) => <span className="num">{r.assigned}</span> },
    // Wide enough that the headers don't open truncated — see sections/Team.tsx.
    { key: 'cn', label: 'Connected', width: 122, render: (r) => <span className="num">{r.connected}</span> },
    { key: 'fu', label: 'Follow-ups', width: 126, render: (r) => <span className="num">{r.followups}</span> },
    { key: 'cv', label: 'Converted', width: 118, render: (r) => <span className="num">{r.converted}</span> },
    { key: 'sl', label: 'Sale value', width: 130, render: (r) => <span className="cell-money">{money(r.sale)}</span> },
  ]

  return (
    <>
      {/* THE LAYOUT LAW, rule 1. The wrapper round the title made the name and
          the department two rows inside a flex row that was already going to
          hold all three on one line. "every project, not just one" went with
          it — the grid below is headed "By project" and says so itself. */}
      <div className="page-head">
        <button className="btn btn--ghost btn--sm" onClick={onBack}>← Team</button>
        <h1>{member.name}</h1>
        <div className="sub">{ws.departmentName(member.departmentId) ?? 'No department'}</div>
      </div>

      <div className="kpis">
        <Kpi accent label="Assigned" value={mine.length} sub={`${mine.filter((l) => l.status === 'new').length} not called yet`} />
        <Kpi label="Connected" value={mine.filter(isConnected).length} sub={`${pct(mine.filter(isConnected).length, mine.length)} of assigned`} />
        <Kpi label="Follow-ups" value={mine.filter((l) => l.status === 'follow_up').length} sub="need a next call" />
        <Kpi label="Converted" value={cv.length} sub={`${pct(cv.length, mine.length)} conversion`} />
      </div>

      <div className="money-grid">
        {tiles.map((t) => (
          <div className="money-tile" key={t.k}>
            <div className="kpi-label">{t.k}</div>
            <div className="kpi-value">{money(t.v)}</div>
            <div className="kpi-sub">{t.s}</div>
          </div>
        ))}
      </div>

      <div className="section">
        <div className="section-head">
          <h3>By project</h3>
          <div className="section-tools section-tools--tight">
            <PhoneViewPick view={phoneView} onPick={setPhoneView} />
          </div>
        </div>
        {projectRows.length === 0
          ? <p style={{ color: 'var(--ink-3)' }}>Not assigned to anything yet.</p>
          : (
            <DataGrid cols={cols} rows={projectRows} storageKey="member-projects" phoneView={phoneView}
                      foot={<div className="grid-foot"><span>{projectRows.length} {projectRows.length === 1 ? 'project' : 'projects'}</span></div>} />
          )}
      </div>
    </>
  )
}

export function TeamPage({
  ws, memberId, onOpenMember, onBackToTeam, onOpenProjects, onOpenProject, onOpenHr,
  onOpenProfile, nav,
}: {
  ws: Workspace
  memberId: string | null
  onOpenMember: (id: string) => void
  onBackToTeam: () => void
  onOpenProjects: () => void
  onOpenProject: (id: string) => void
  onOpenHr: () => void
  onOpenProfile: () => void
  /** The owner's five, built once in App. This screen only says which is lit. */
  nav: BottomNavItems
}) {
  const [adminOpen, setAdminOpen] = useState(false)
  const panes = usePanes()
  const tip = useHoverTip()

  const member = memberId ? ws.members.find((m) => m.id === memberId) ?? null : null

  return (
    <div className="screen screen--app is-active">
      <div className="topbar">
        <div className="brand">
          <div className="monogram">M</div>
          <div className="brand-name">Metrol Media</div>
        </div>
        <div className="topbar-right">
          <AccountControls ws={ws} variant="topbar" roleLabel={ws.me?.email ?? 'Owner'}
                           onOpenProfile={onOpenProfile} />
        </div>
      </div>

      <div className="shell">
        <Rail ws={ws} roleLabel={ws.me?.email ?? 'Owner'} onOpenProfile={onOpenProfile} active="team" panes={panes} tip={tip}
              onOpenProjects={onOpenProjects} onOpenProject={onOpenProject}
              onOpenTeam={onBackToTeam} onOpenHr={onOpenHr} onOpenSettings={() => setAdminOpen(true)} />

        <div className="workspace">
          <div className="wrap">
            {member
              ? <MemberDashboard ws={ws} member={member} onBack={onBackToTeam} />
              : <MemberRoster ws={ws} onOpen={onOpenMember} />}
          </div>
        </div>
      </div>

      <BottomNav items={nav} active="team" />

      {tip.node}
      {adminOpen && <CompanyAdminModal ws={ws} onClose={() => setAdminOpen(false)} />}
    </div>
  )
}
