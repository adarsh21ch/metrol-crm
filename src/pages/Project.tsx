import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft, BarChart3, Home, LayoutGrid, LogOut, PanelLeftClose, PanelLeftOpen, Users, Wallet,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Lead, Profile, Project as TProject, LeadStatus } from '@/lib/types'
import { STATUS_LABEL } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { StatusChip, QualityChip } from '@/components/ui/badge'
import { ThemeToggle } from '@/components/ThemeToggle'
import { DataTable, type Column } from '@/components/LeadsTable'
import { cn, money, initials } from '@/lib/utils'

const SECTIONS = [
  { id: 'overview', label: 'Overview', icon: Home },
  { id: 'leads', label: 'Leads', icon: LayoutGrid },
  { id: 'sales', label: 'Sales', icon: Wallet },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'dash', label: 'Dashboard', icon: BarChart3 },
] as const
type SectionId = (typeof SECTIONS)[number]['id']

const RAIL_MINI = 64
const RAIL_WIDE = 200
const SIDE_MIN = 168
const SIDE_MAX = 380
const FOLD_AT = 150 // drag narrower than this and the panel folds away entirely

export function Project({ isOwner, profileId }: { isOwner: boolean; profileId: string }) {
  const { id } = useParams<{ id: string }>()
  const [project, setProject] = useState<TProject | null>(null)
  const [leads, setLeads] = useState<Lead[]>([])
  const [team, setTeam] = useState<Profile[]>([])
  const [section, setSection] = useState<SectionId>('overview')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Sidebar one: the icon rail.
  const [railWide, setRailWide] = useState(() => {
    try {
      return localStorage.getItem('metrol-rail') === 'wide'
    } catch {
      return false
    }
  })
  // Sidebar two: the section nav, draggable and foldable.
  const [sideW, setSideW] = useState(() => {
    try {
      const v = Number(localStorage.getItem('metrol-side'))
      return Number.isFinite(v) && v >= SIDE_MIN ? Math.min(v, SIDE_MAX) : 214
    } catch {
      return 214
    }
  })
  const [sideFolded, setSideFolded] = useState(() => {
    try {
      return localStorage.getItem('metrol-side-folded') === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem('metrol-rail', railWide ? 'wide' : 'mini')
      localStorage.setItem('metrol-side', String(sideW))
      localStorage.setItem('metrol-side-folded', sideFolded ? '1' : '0')
    } catch {
      /* layout preferences are a convenience */
    }
  }, [railWide, sideW, sideFolded])

  const dragging = useRef(false)
  const onSideDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    dragging.current = true
    document.body.classList.add('is-resizing')
  }, [])

  useEffect(() => {
    function move(e: PointerEvent) {
      if (!dragging.current) return
      const railW = railWide ? RAIL_WIDE : RAIL_MINI
      const next = e.clientX - railW
      if (next < FOLD_AT) {
        setSideFolded(true)
      } else {
        setSideFolded(false)
        setSideW(Math.min(SIDE_MAX, Math.max(SIDE_MIN, next)))
      }
    }
    function up() {
      dragging.current = false
      document.body.classList.remove('is-resizing')
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [railWide])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      const [p, l, m] = await Promise.all([
        supabase.from('projects').select('*').eq('id', id).single(),
        supabase.from('leads').select('*').eq('project_id', id).order('created_at', { ascending: false }),
        supabase.from('project_members').select('profile_id, profiles(*)').eq('project_id', id),
      ])
      if (cancelled) return
      if (p.error) setError(p.error.message)
      setProject((p.data ?? null) as TProject | null)
      setLeads((l.data ?? []) as Lead[])
      // PostgREST types an embedded to-one join as an array; normalise both shapes.
      const rows = (m.data ?? []) as Array<{ profiles: Profile | Profile[] | null }>
      setTeam(
        rows
          .flatMap((r) => (Array.isArray(r.profiles) ? r.profiles : r.profiles ? [r.profiles] : []))
          .filter(Boolean),
      )
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  /** Optimistic, then reconciled — a failed write must not leave a lie on screen. */
  async function patchLead(leadId: string, patch: Partial<Lead>) {
    const before = leads
    setLeads((rows) => rows.map((r) => (r.id === leadId ? { ...r, ...patch } : r)))
    const { error } = await supabase.from('leads').update(patch).eq('id', leadId)
    if (error) {
      setLeads(before)
      setError(error.message)
    }
  }

  const nameOf = (pid: string | null) =>
    pid ? (team.find((t) => t.id === pid)?.name ?? 'Unknown') : null

  const converted = leads.filter((l) => l.status === 'converted')
  const gross = converted.reduce((s, l) => s + Number(l.amount), 0)
  const verified = converted.filter((l) => l.verified).reduce((s, l) => s + Number(l.amount), 0)

  const leadColumns: Column<Lead>[] = [
    { key: 'name', label: 'Name', width: 190, render: (l) => <span className="font-medium">{l.name}</span> },
    { key: 'phone', label: 'Phone', width: 150, render: (l) => <span className="font-mono text-[13px] text-ink-2">{l.phone || '—'}</span> },
    { key: 'email', label: 'Email', width: 220, render: (l) => <span className="text-ink-2">{l.email || '—'}</span> },
    {
      key: 'status',
      label: 'Status',
      width: 150,
      // The owner reads these; the salesperson who holds the lead sets them.
      render: (l) =>
        !isOwner && l.owner_id === profileId ? (
          <select
            value={l.status}
            onChange={(e) => patchLead(l.id, { status: e.target.value as LeadStatus })}
            className="h-[22px] rounded border border-line bg-surface px-1 text-[12px] text-ink"
          >
            {Object.entries(STATUS_LABEL).map(([v, label]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
        ) : (
          <StatusChip value={l.status} />
        ),
    },
    { key: 'quality', label: 'Quality', width: 120, render: (l) => <QualityChip value={l.quality} /> },
    {
      key: 'owner',
      label: 'Assigned to',
      width: 160,
      render: (l) => (nameOf(l.owner_id) ? <span className="text-ink-2">{nameOf(l.owner_id)}</span> : <span className="text-ink-3">—</span>),
    },
    { key: 'amount', label: 'Amount', width: 120, render: (l) => (l.amount ? money(Number(l.amount)) : <span className="text-ink-3">—</span>) },
    {
      key: 'verified',
      label: 'Payment',
      width: 130,
      // Verification is the owner's control, and only theirs.
      render: (l) =>
        isOwner ? (
          <label className="flex cursor-pointer items-center gap-1.5 text-[13px]">
            <input
              type="checkbox"
              checked={l.verified}
              onChange={(e) => patchLead(l.id, { verified: e.target.checked })}
              className="accent-[var(--accent)]"
            />
            {l.verified ? 'Verified' : 'Pending'}
          </label>
        ) : (
          <span className={l.verified ? 'text-good' : 'text-ink-3'}>{l.verified ? 'Verified' : 'Pending'}</span>
        ),
    },
  ]

  const railW = railWide ? RAIL_WIDE : RAIL_MINI

  return (
    <div className="flex h-full bg-ground">
      {/* ------------------------------------------------ sidebar one: rail */}
      <nav
        className="flex shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-150"
        style={{ width: railW }}
      >
        <div className="flex h-[var(--topbar-h)] items-center gap-2 border-b border-line px-3">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded bg-accent font-display text-[13px] font-bold text-accent-on">
            M
          </span>
          {railWide && <span className="truncate font-display font-semibold">Metrol</span>}
        </div>
        <div className="flex-1 p-2">
          <Link
            to="/"
            title="All projects"
            className="mb-1 flex h-9 items-center gap-2.5 rounded px-2.5 text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            <ArrowLeft size={16} className="shrink-0" />
            {railWide && <span className="truncate text-[13px]">All projects</span>}
          </Link>
        </div>
        <div className="p-2">
          <Button
            variant="ghost"
            className="w-full justify-start px-2.5"
            onClick={() => setRailWide((v) => !v)}
            title={railWide ? 'Collapse to icons' : 'Expand'}
          >
            {railWide ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
            {railWide && <span className="text-[13px]">Collapse</span>}
          </Button>
        </div>
      </nav>

      {/* -------------------------------------- sidebar two: the section nav */}
      {!sideFolded && (
        <div className="relative shrink-0 border-r border-line bg-surface-2" style={{ width: sideW }}>
          <div className="flex h-[var(--topbar-h)] items-center border-b border-line px-3">
            <span className="truncate font-display text-[13px] font-semibold text-ink-2">
              {project?.name ?? 'Project'}
            </span>
          </div>
          <div className="p-2">
            {SECTIONS.map((s) => {
              const Icon = s.icon
              return (
                <button
                  key={s.id}
                  onClick={() => setSection(s.id)}
                  aria-current={section === s.id}
                  className={cn(
                    'mb-0.5 flex h-9 w-full items-center gap-2.5 rounded px-2.5 text-[13px] transition-colors',
                    section === s.id
                      ? 'bg-accent text-accent-on font-medium'
                      : 'text-ink-2 hover:bg-surface-3 hover:text-ink',
                  )}
                >
                  <Icon size={16} className="shrink-0" />
                  <span className="truncate">{s.label}</span>
                </button>
              )
            })}
          </div>
          {/* Drag this edge; pull it past the fold point and the panel goes away. */}
          <span
            onPointerDown={onSideDown}
            title="Drag to resize — drag left to fold"
            className="absolute right-0 top-0 z-10 h-full w-[9px] translate-x-[4px] cursor-col-resize touch-none
                       after:absolute after:right-[4px] after:top-0 after:h-full after:w-px after:bg-line
                       hover:after:w-[2px] hover:after:bg-accent"
          />
        </div>
      )}

      {/* ----------------------------------------------------- the workspace */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[var(--topbar-h)] shrink-0 items-center gap-2 border-b border-line bg-surface px-4">
          {sideFolded && (
            <Button variant="ghost" size="icon" title="Show sections" onClick={() => setSideFolded(false)}>
              <PanelLeftOpen size={16} />
            </Button>
          )}
          <h1 className="truncate font-display font-semibold">
            {project?.name ?? '—'}
            <span className="ml-2 font-sans text-[13px] font-normal text-ink-3">
              {SECTIONS.find((s) => s.id === section)?.label}
            </span>
          </h1>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" size="icon" title="Sign out" onClick={() => supabase.auth.signOut()}>
              <LogOut size={16} />
            </Button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          {loading && <p className="text-ink-3">Loading…</p>}
          {error && (
            <p className="mb-3 rounded border border-bad-line bg-bad-soft px-3 py-2 text-[13px] text-bad">{error}</p>
          )}

          {!loading && section === 'overview' && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi label="Leads" value={String(leads.length)} />
              <Kpi label="Converted" value={String(converted.length)} />
              <Kpi label="Gross sale" value={money(gross)} />
              <Kpi label="Verified" value={money(verified)} />
            </div>
          )}

          {!loading && section === 'leads' && (
            <DataTable columns={leadColumns} rows={leads} storageKey="leads" empty="No leads in this project yet." />
          )}

          {!loading && section === 'sales' && (
            <DataTable
              columns={leadColumns.filter((c) => ['name', 'owner', 'amount', 'verified'].includes(c.key))}
              rows={converted}
              storageKey="sales"
              empty="No converted leads yet."
            />
          )}

          {!loading && section === 'team' && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {team.length === 0 && <p className="text-ink-3">Nobody is assigned to this project yet.</p>}
              {team.map((t) => {
                const mine = leads.filter((l) => l.owner_id === t.id)
                return (
                  <Card key={t.id}>
                    <CardBody className="flex items-center gap-3 pt-4">
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-surface-3 text-[13px] font-semibold">
                        {initials(t.name)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{t.name}</p>
                        <p className="text-[13px] text-ink-3">
                          {mine.length} leads · {mine.filter((l) => l.status === 'converted').length} converted
                        </p>
                      </div>
                    </CardBody>
                  </Card>
                )
              })}
            </div>
          )}

          {!loading && section === 'dash' && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(Object.keys(STATUS_LABEL) as LeadStatus[]).map((s) => (
                <Kpi key={s} label={STATUS_LABEL[s]} value={String(leads.filter((l) => l.status === s).length)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardBody className="pt-4">
        <p className="text-[12px] font-medium uppercase tracking-wide text-ink-3">{label}</p>
        <p className="mt-1 font-display text-2xl font-semibold">{value}</p>
      </CardBody>
    </Card>
  )
}
