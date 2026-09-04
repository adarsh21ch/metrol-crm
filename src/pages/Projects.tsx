import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { LayoutGrid, List as ListIcon, LogOut } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Project } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { Chip } from '@/components/ui/badge'
import { ThemeToggle } from '@/components/ThemeToggle'
import { DataTable, type Column } from '@/components/LeadsTable'
import { cn } from '@/lib/utils'

type View = 'cards' | 'list'
const VIEW_KEY = 'metrol-projects-view'

export function Projects({ name }: { name: string }) {
  const [view, setView] = useState<View>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'cards'
    } catch {
      return 'cards'
    }
  })
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view)
    } catch {
      /* a remembered view is a convenience, not a requirement */
    }
  }, [view])

  useEffect(() => {
    supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setProjects((data ?? []) as Project[])
        setLoading(false)
      })
  }, [])

  const columns: Column<Project>[] = [
    {
      key: 'name',
      label: 'Project',
      width: 260,
      render: (p) => (
        <Link to={`/p/${p.id}`} className="font-medium text-ink hover:text-accent-ink">
          {p.name}
        </Link>
      ),
    },
    {
      key: 'description',
      label: 'Description',
      width: 380,
      render: (p) => <span className="text-ink-2">{p.description || '—'}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      width: 120,
      render: (p) => (
        <Chip variant={p.status === 'active' ? 'good' : p.status === 'paused' ? 'warn' : 'neutral'}>
          {p.status}
        </Chip>
      ),
    },
    {
      key: 'created',
      label: 'Created',
      width: 140,
      render: (p) => (
        <span className="text-ink-2">
          {new Date(p.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
      ),
    },
  ]

  return (
    <div className="min-h-full bg-ground">
      <header className="sticky top-0 z-20 flex h-[var(--topbar-h)] items-center gap-3 border-b border-line bg-surface px-4">
        <span className="grid h-7 w-7 place-items-center rounded bg-accent font-display text-[13px] font-bold text-accent-on">
          M
        </span>
        <span className="font-display font-semibold">Metrol CRM</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-[13px] text-ink-2 sm:inline">{name}</span>
          <ThemeToggle />
          <Button variant="ghost" size="icon" title="Sign out" onClick={() => supabase.auth.signOut()}>
            <LogOut size={16} />
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-4 py-6">
        <div className="mb-4 flex items-center gap-3">
          <h1 className="font-display text-xl font-semibold">Projects</h1>
          <div className="ml-auto flex rounded border border-line bg-surface p-0.5">
            {(['cards', 'list'] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                aria-pressed={view === v}
                title={v === 'cards' ? 'Card view' : 'List view'}
                className={cn(
                  'flex h-7 items-center gap-1.5 rounded px-2.5 text-[13px] font-medium transition-colors',
                  view === v ? 'bg-accent text-accent-on' : 'text-ink-2 hover:bg-surface-2',
                )}
              >
                {v === 'cards' ? <LayoutGrid size={14} /> : <ListIcon size={14} />}
                <span className="capitalize">{v}</span>
              </button>
            ))}
          </div>
        </div>

        {loading && <p className="text-ink-3">Loading…</p>}
        {error && (
          <p className="rounded border border-bad-line bg-bad-soft px-3 py-2 text-[13px] text-bad">{error}</p>
        )}
        {!loading && !error && projects.length === 0 && (
          <Card>
            <CardBody className="py-10 text-center text-ink-3">
              No projects yet. An owner creates the first one.
            </CardBody>
          </Card>
        )}

        {!loading && !error && projects.length > 0 && view === 'cards' && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <Link key={p.id} to={`/p/${p.id}`}>
                <Card className="h-full transition-shadow hover:shadow-md">
                  <CardBody className="pt-4">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <h3 className="font-display text-[15px] font-semibold">{p.name}</h3>
                      <Chip
                        variant={p.status === 'active' ? 'good' : p.status === 'paused' ? 'warn' : 'neutral'}
                      >
                        {p.status}
                      </Chip>
                    </div>
                    <p className="line-clamp-2 text-[13px] text-ink-2">{p.description || 'No description.'}</p>
                  </CardBody>
                </Card>
              </Link>
            ))}
          </div>
        )}

        {!loading && !error && projects.length > 0 && view === 'list' && (
          <DataTable columns={columns} rows={projects} storageKey="projects" />
        )}
      </main>
    </div>
  )
}
