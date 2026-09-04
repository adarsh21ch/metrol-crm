import { useMemo, useState } from 'react'
import { DataGrid, type GridCol } from '@/components/DataGrid'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Avatar, Chip, IconBtn } from '@/components/bits'
import { agoWords, initials, money, num } from '@/lib/format'
import { isConverted, type Project } from '@/lib/types'
import type { Workspace } from '@/data/useWorkspace'
import { supabase } from '@/lib/supabase'

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

export function Projects({ ws, onOpen }: { ws: Workspace; onOpen: (id: string) => void }) {
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

  return (
    <div className="screen screen--app is-active" id="screen-projects">
      <div className="topbar">
        <div className="brand">
          <div className="monogram">M</div>
          <div className="brand-name">Metrol Media</div>
        </div>
        <div className="topbar-right">
          <ThemeToggle />
          <div className="user-chip">
            <div className="avatar avatar--lg">{initials(ws.me?.name ?? '?')}</div>
            <div>
              <div className="name">{ws.me?.role === 'owner' ? 'Owner' : (ws.me?.name ?? '')}</div>
              <div className="role">{ws.me?.email}</div>
            </div>
          </div>
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
              <h1>Projects</h1>
              <div className="sub">{active} active {active === 1 ? 'project' : 'projects'}</div>
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
                        <span className="stack">
                          {p.team.map((id) => <Avatar key={id}>{initials(ws.memberName(id))}</Avatar>)}
                        </span>
                        <span>
                          {p.team.length} {p.team.length === 1 ? 'person' : 'people'} · updated {agoWords(p.updatedAt)}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {view === 'list' && ws.projects.length > 0 && (
              <DataGrid
                cols={cols}
                rows={rows}
                storageKey="projects"
                rowClass={() => 'row-link'}
                onRowClick={(r) => onOpen(r.id)}
                foot={
                  <div className="grid-foot">
                    <span>{rows.length} {rows.length === 1 ? 'project' : 'projects'}</span>
                    <span className="grid-hint">Click a row to open the project</span>
                  </div>
                }
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
