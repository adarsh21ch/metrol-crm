import { useMemo, useState } from 'react'
import { DataGrid, type GridCol } from '@/components/DataGrid'
import { AccountControls } from '@/components/AccountControls'
import { useHoverTip } from '@/components/HoverTip'
import { Rail, type RailItem } from '@/components/Rail'
import { BottomNav, type BottomNavItems } from '@/components/BottomNav'
import { usePanes } from '@/lib/usePanes'
import { Avatar, Chip } from '@/components/bits'
import { agoWords, count, initials, money, num } from '@/lib/format'
import { isConverted, type Project } from '@/lib/types'
import type { Workspace } from '@/data/useWorkspace'

type View = 'cards' | 'list'
const VIEW_KEY = 'metrol-crm-projview'

/** A project plus the figures the cards and the list both need. */
interface Row extends Project {
  sn: number
  leads: number
  customers: number
  gross: number
  team: string[]
}

function Media({ p, small }: { p: Row; small?: boolean }) {
  if (p.imageUrl) return <img src={p.imageUrl} alt="" />
  return (
    <div className="proj-ph">
      <b>{initials(p.name)}</b>
      {!small && <i>No photo yet</i>}
    </div>
  )
}

export function Projects({ ws, onOpen, onOpenProfile, nav, rail }: {
  ws: Workspace
  onOpen: (id: string) => void
  onOpenProfile: () => void
  /** The owner's five, built once in App. This screen only says which is lit. */
  nav: BottomNavItems
  /** The owner's and HR's grouped menu (lib/ownerNav.tsx), built once in App. */
  rail: RailItem[]
}) {
  const panes = usePanes()
  const tip = useHoverTip()
  const [view, setView] = useState<View>(() => {
    try { return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'cards' } catch { return 'cards' }
  })
  const pick = (v: View) => {
    setView(v)
    try { localStorage.setItem(VIEW_KEY, v) } catch { /* a remembered view is a convenience */ }
  }

  const rows: Row[] = useMemo(() =>
    ws.projects.map((p, i) => {
      const mine = ws.leads.filter((l) => l.projectId === p.id)
      const conv = mine.filter(isConverted)
      const team = [...new Set(mine.map((l) => l.ownerId).filter(Boolean) as string[])]
      return {
        ...p, sn: i + 1,
        leads: mine.length,
        customers: conv.length,
        gross: conv.reduce((s, l) => s + l.amount, 0),
        team,
      }
    }), [ws.projects, ws.leads])

  const cols: GridCol<Row>[] = [
    { key: 'idx', label: '#', width: 52, render: (r) => <span className="cell-idx">{r.sn}</span> },
    { key: 'th', label: 'Photo', width: 78, render: (r) => <span className="thumb-sm"><Media p={r} small /></span> },
    { key: 'nm', label: 'Project', width: 186, render: (r) => <span className="cell-strong">{r.name}</span> },
    { key: 'ds', label: 'Description', width: 300, render: (r) => <span className="cell-mute">{r.description}</span> },
    { key: 'ld', label: 'Leads', width: 92, render: (r) => <span className="num">{num(r.leads)}</span> },
    { key: 'cu', label: 'Customers', width: 112, render: (r) => <span className="num">{num(r.customers)}</span> },
    { key: 'gr', label: 'Gross sale', width: 132, render: (r) => <span className="cell-money">{money(r.gross)}</span> },
    {
      key: 'st', label: 'Status', width: 104,
      render: (r) => <Chip cls={r.status === 'active' ? 'chip--good' : 'chip--mute'}>{r.status === 'active' ? 'Active' : r.status === 'paused' ? 'Paused' : 'Done'}</Chip>,
    },
  ]

  const active = ws.projects.filter((p) => p.status === 'active').length
  const projCount = `${count(rows.length, 'project')} · ${count(active, 'active', 'active')}`

  return (
    <div className="screen screen--app is-active" id="screen-projects">
      <div className="topbar">
        <div className="brand">
          <div className="monogram">M</div>
          <div className="brand-name">Metrol Media</div>
        </div>
        <div className="topbar-right">
          <AccountControls ws={ws} variant="topbar" hasRail roleLabel={ws.me?.email ?? 'Owner'}
                           onOpenProfile={onOpenProfile} />
        </div>
      </div>

      <div className="shell">
        <Rail ws={ws} roleLabel={ws.me?.email ?? 'Owner'} onOpenProfile={onOpenProfile} active="projects" panes={panes} tip={tip}
              items={rail} />

        <div className="workspace">
          <div className="wrap">
            <div className="page-head">
              <h1>Projects</h1>
              {/* THE LAYOUT LAW, rule 6: the count was competing with the view
                  switch for the title's row. It is on the foot of both views
                  now — switching must not make a number vanish. */}
              <div className="section-tools">
                <div className="seg">
                  <button className={view === 'cards' ? 'is-on' : ''} onClick={() => pick('cards')}>Cards</button>
                  <button className={view === 'list' ? 'is-on' : ''} onClick={() => pick('list')}>List</button>
                </div>
              </div>
            </div>

            {ws.projects.length === 0 && (
              <p style={{ color: 'var(--ink-3)' }}>No projects yet. An owner creates the first one.</p>
            )}

            {view === 'cards' && ws.projects.length > 0 && (
              <>
              <div className="proj-grid">
                {rows.map((p) => (
                  <button className="proj-card" key={p.id} onClick={() => onOpen(p.id)}>
                    <div className="proj-media"><Media p={p} /></div>
                    <div className="proj-body">
                      <div className="proj-top">
                        <h3>{p.name}</h3>
                        <Chip cls={p.status === 'active' ? 'chip--good' : 'chip--mute'}>
                          {p.status === 'active' ? 'Active' : p.status === 'paused' ? 'Paused' : 'Done'}
                        </Chip>
                      </div>
                      <p className="proj-desc">{p.description}</p>
                      <div className="proj-stats">
                        <div className="proj-stat"><span className="v">{num(p.leads)}</span><span className="k">Leads</span></div>
                        <div className="proj-stat"><span className="v">{num(p.customers)}</span><span className="k">Customers</span></div>
                        <div className="proj-stat"><span className="v">{money(p.gross)}</span><span className="k">Gross sale</span></div>
                      </div>
                      <div className="proj-foot">
                        {/* Four at most. Five 22px avatars overlapping at -6px
                            was an unreadable smear of half-initials; the rest
                            are counted instead, which is what the sentence
                            beside it was already doing anyway. */}
                        <span className="stack">
                          {p.team.slice(0, 4).map((id) => {
                            const m = ws.members.find((x) => x.id === id)
                            return <Avatar key={id} src={m?.avatarUrl}>{m ? m.initials : initials(ws.memberName(id))}</Avatar>
                          })}
                          {p.team.length > 4 && <span className="stack-more">+{p.team.length - 4}</span>}
                        </span>
                        <span>{count(p.team.length, 'person', 'people')} · updated {agoWords(p.updatedAt)}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              {/* Cards have no grid to hang a foot off, so they get the line. */}
              <div className="grid-foot"><span>{projCount}</span></div>
              </>
            )}

            {view === 'list' && ws.projects.length > 0 && (
              <DataGrid
                cols={cols}
                rows={rows}
                /* The page already has Cards/List, and the grid drew a second
                   Cards/List beneath it meaning something else entirely — the
                   same collision My leads had. The rich project cards ARE the
                   phone's card view, so List here is the table, full stop. */
                storageKey="projects" phoneView="list"
                rowClass={() => 'row-link'}
                onRowClick={(r) => onOpen(r.id)}
                foot={
                  <div className="grid-foot">
                    <span>{projCount}</span>
                    <span className="grid-hint">Click a row to open the project</span>
                  </div>
                }
              />
            )}
          </div>
        </div>
      </div>

      <BottomNav items={nav} active="projects" />

      {tip.node}
    </div>
  )
}
