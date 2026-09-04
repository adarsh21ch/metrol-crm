import { useMemo, useState } from 'react'
import { DataGrid, Pager, pageRange, type GridCol } from '@/components/DataGrid'
import { Menu, type MenuItem } from '@/components/Menu'
import { Avatar, Caret, EditChip, ReadQuality, ReadStatus, Yn } from '@/components/bits'
import { QUALITY, STATUS, isConnected, type Lead, type LeadStatus, type Member, type Quality } from '@/lib/types'
import type { Workspace } from '@/data/useWorkspace'

const PAGE_SIZE = 50

type Editing =
  | { kind: 'status' | 'quality' | 'assign'; anchor: HTMLElement; lead: Lead }
  | null

export function Leads({
  ws, leads, members, isOwner, meId, onImport, onAdd, onHistory, onNeedsSale, toast,
}: {
  ws: Workspace
  leads: Lead[]
  members: Member[]
  isOwner: boolean
  meId: string | null
  onImport: () => void
  onAdd: () => void
  onHistory: (l: Lead) => void
  onNeedsSale: (l: Lead) => void
  toast: (m: string) => void
}) {
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const [edit, setEdit] = useState<Editing>(null)

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return leads
    return leads.filter((l) => `${l.name} ${l.email} ${l.phone}`.toLowerCase().includes(t))
  }, [leads, q])

  const last = Math.max(0, Math.ceil(shown.length / PAGE_SIZE) - 1)
  const p = Math.min(page, last)
  const slice = shown.slice(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE)

  /* The owner does not work leads — the assigned salesperson sets status and
     quality, and the owner reads them. */
  const canEdit = (l: Lead) => !isOwner && l.ownerId === meId

  const cols: GridCol<Lead>[] = [
    { key: 'idx', label: '#', width: 52, render: (_l, i) => <span className="cell-idx">{p * PAGE_SIZE + i + 1}</span> },
    {
      key: 'name', label: 'Name', width: 172,
      render: (l) => (
        <span className="td-flex">
          {l.isNew && <span className="new-dot" title="New lead" />}
          <button className="name-btn" onClick={() => onHistory(l)} title="Open this lead’s history">{l.name}</button>
        </span>
      ),
    },
    { key: 'email', label: 'Email', width: 216, render: (l) => <span className="cell-mute">{l.email || '—'}</span> },
    { key: 'phone', label: 'Phone', width: 150, render: (l) => <span className="cell-mono">{l.phone || '—'}</span> },
    // Yes or no. It is a fact, not a status — it needs no chip around it.
    { key: 'conn', label: 'Connected', width: 108, render: (l) => <Yn yes={isConnected(l)} /> },
    {
      key: 'status', label: 'Status', width: 134,
      render: (l) => canEdit(l)
        ? <EditChip cls={STATUS[l.status].cls} label={STATUS[l.status].label}
            onClick={(e) => setEdit({ kind: 'status', anchor: e.currentTarget, lead: l })} />
        : <ReadStatus v={l.status} />,
    },
    {
      key: 'qual', label: 'Quality', width: 126,
      render: (l) => canEdit(l)
        ? <EditChip cls={l.quality ? QUALITY[l.quality].cls : 'chip--none'} label={l.quality ? QUALITY[l.quality].label : 'Not set'}
            onClick={(e) => setEdit({ kind: 'quality', anchor: e.currentTarget, lead: l })} />
        : <ReadQuality v={l.quality} />,
    },
    {
      key: 'owner', label: 'Assigned to', width: 186,
      // Assigning and reassigning are both the owner's job, so an assigned lead
      // stays clickable — but it is a name in a cell, not a control in a pill.
      render: (l) => {
        const m = members.find((x) => x.id === l.ownerId)
        if (!m) {
          return isOwner
            ? <button className="assign-btn" onClick={(e) => setEdit({ kind: 'assign', anchor: e.currentTarget, lead: l })}>+ Assign</button>
            : <span className="cell-dash">—</span>
        }
        return isOwner ? (
          <button className="assignee" title="Change who this lead belongs to"
                  onClick={(e) => setEdit({ kind: 'assign', anchor: e.currentTarget, lead: l })}>
            <Avatar>{m.initials}</Avatar><span className="assignee-nm">{m.name}</span><Caret />
          </button>
        ) : (
          <span className="td-flex"><Avatar>{m.initials}</Avatar><span>{m.name}</span></span>
        )
      },
    },
  ]

  const items: MenuItem[] =
    edit?.kind === 'status'
      ? (Object.keys(STATUS) as LeadStatus[]).map((k) => ({ value: k, label: STATUS[k].label, cls: STATUS[k].cls }))
      : edit?.kind === 'quality'
        ? (Object.keys(QUALITY) as Quality[]).map((k) => ({ value: k, label: QUALITY[k].label, cls: QUALITY[k].cls }))
        : edit?.kind === 'assign'
          ? [
              ...members.map((m) => ({
                value: m.id,
                node: <span className="menu-person"><span className="avatar">{m.initials}</span><span>{m.name}</span></span>,
              })),
              ...(edit.lead.ownerId
                ? [{ value: '__none', node: <span className="menu-person menu-person--none"><span>Unassign</span></span> }]
                : []),
            ]
          : []

  const current =
    edit?.kind === 'status' ? edit.lead.status
    : edit?.kind === 'quality' ? edit.lead.quality
    : edit?.kind === 'assign' ? edit.lead.ownerId
    : null

  async function pick(v: string) {
    if (!edit) return
    const l = edit.lead
    const by = members.find((m) => m.id === l.ownerId)?.name ?? 'Owner'
    if (edit.kind === 'status') {
      // Converting without a figure asks for one; a sale with no amount is not
      // a sale, and the Sales page would carry a blank row for ever.
      if (v === 'converted' && !l.amount) { onNeedsSale(l); return }
      await ws.setStatus(l, v as LeadStatus, by)
      toast(`${l.name} — status set to ${STATUS[v as LeadStatus].label}`)
    } else if (edit.kind === 'quality') {
      await ws.setQuality(l, v as Quality, by)
      toast(`${l.name} — marked ${QUALITY[v as Quality].label}`)
    } else {
      const to = v === '__none' ? null : v
      await ws.setOwner(l, to)
      toast(to ? `${l.name} moved to ${members.find((m) => m.id === to)?.name}` : `${l.name} is unassigned again`)
    }
  }

  const unassigned = leads.filter((l) => !l.ownerId).length

  return (
    <div className="section is-on">
      <div className="section-head">
        <h3>Leads</h3>
        <div className="sub">{unassigned} unassigned</div>
        <div className="section-tools">
          <div className="search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
            </svg>
            <input className="input" type="search" placeholder="Search name, email or phone"
                   value={q} onChange={(e) => { setQ(e.target.value); setPage(0) }} />
          </div>
          {isOwner && (
            <>
              <button className="btn btn--sm" onClick={onImport}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 16V4M7 9l5-5 5 5M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" />
                </svg>
                Import
              </button>
              <button className="btn btn--sm btn--primary" onClick={onAdd}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Add lead
              </button>
            </>
          )}
        </div>
      </div>

      <DataGrid
        cols={cols} rows={slice} storageKey="leads"
        foot={
          <div className="grid-foot">
            <span>Showing {pageRange(shown.length, p, PAGE_SIZE)}{shown.length === leads.length ? ' leads' : ' matching leads'}</span>
            <span className="foot-right">
              <span className="grid-hint">Drag a column edge to resize · <kbd>double-click</kbd> to reset</span>
              <Pager page={p} total={shown.length} size={PAGE_SIZE} onPage={setPage} />
            </span>
          </div>
        }
      />

      {edit && (
        <Menu anchor={edit.anchor} items={items} current={current}
              onPick={(v) => void pick(v)} onClose={() => setEdit(null)} />
      )}
    </div>
  )
}
