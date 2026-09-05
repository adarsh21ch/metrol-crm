import { useState } from 'react'
import { DataGrid, Pager, type GridCol } from '@/components/DataGrid'
import { Menu } from '@/components/Menu'
import { Avatar, Caret, Chip } from '@/components/bits'
import { agoDays, count, daysSince, money } from '@/lib/format'
import type { Lead, Member } from '@/lib/types'
import type { Workspace } from '@/data/useWorkspace'

const PAGE_SIZE = 50

export function Sales({
  ws, conv, members, isOwner, toast,
}: { ws: Workspace; conv: Lead[]; members: Member[]; isOwner: boolean; toast: (m: string) => void }) {
  const [page, setPage] = useState(0)
  const [edit, setEdit] = useState<{ anchor: HTMLElement; lead: Lead } | null>(null)

  const rows = [...conv].sort(
    (a, b) => daysSince(a.convertedAt ?? a.createdAt) - daysSince(b.convertedAt ?? b.createdAt),
  )
  const last = Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1)
  const p = Math.min(page, last)
  const slice = rows.slice(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE)
  const gross = conv.reduce((s, l) => s + l.amount, 0)

  const cols: GridCol<Lead>[] = [
    { key: 'idx', label: '#', width: 52, render: (_l, i) => <span className="cell-idx">{p * PAGE_SIZE + i + 1}</span> },
    { key: 'cust', label: 'Customer', width: 180, render: (l) => <span className="cell-strong">{l.name}</span> },
    { key: 'ph', label: 'Phone', width: 150, render: (l) => <span className="cell-mono">{l.phone || '—'}</span> },
    { key: 'amt', label: 'Amount', width: 130, render: (l) => <span className="cell-money">{money(l.amount)}</span> },
    {
      key: 'ver', label: 'Payment', width: 136,
      // Verification is the owner's control, and only theirs.
      render: (l) => isOwner
        ? (
          <button className={'cell-edit chip ' + (l.verified ? 'chip--good' : 'chip--warn')}
                  onClick={(e) => setEdit({ anchor: e.currentTarget, lead: l })}>
            {l.verified ? 'Verified' : 'Pending'}<Caret />
          </button>
        )
        : <Chip cls={l.verified ? 'chip--good' : 'chip--warn'}>{l.verified ? 'Verified' : 'Pending'}</Chip>,
    },
    {
      key: 'by', label: 'Converted by', width: 180,
      render: (l) => {
        const m = members.find((x) => x.id === l.ownerId)
        return m
          ? <span className="td-flex"><Avatar src={m.avatarUrl}>{m.initials}</Avatar><span>{m.name}</span></span>
          : <span className="cell-mute">—</span>
      },
    },
    { key: 'when', label: 'Closed', width: 118, render: (l) => <span className="cell-mute">{agoDays(daysSince(l.convertedAt ?? l.createdAt))}</span> },
  ]

  return (
    <div className="section is-on">
      <div className="section-head">
        <h3>Sales</h3>
        <div className="sub">{count(conv.length, 'closed deal')} · {money(gross)} gross</div>
      </div>

      <DataGrid
        cols={cols} rows={slice} storageKey="sales"
        empty="No sales yet. A lead becomes a sale the moment its salesperson marks it Converted and records the amount."
        foot={
          <div className="grid-foot">
            <span>{conv.filter((l) => l.verified).length} verified · {conv.filter((l) => !l.verified).length} pending</span>
            <span className="foot-right">
              <Pager page={p} total={rows.length} size={PAGE_SIZE} onPage={setPage} />
            </span>
          </div>
        }
      />

      {edit && (
        <Menu
          anchor={edit.anchor}
          current={edit.lead.verified ? 'yes' : 'no'}
          items={[
            { value: 'yes', label: 'Verified', cls: 'chip--good' },
            { value: 'no', label: 'Pending', cls: 'chip--warn' },
          ]}
          onPick={(v) => {
            void ws.setVerified(edit.lead, v === 'yes')
            toast(`${edit.lead.name} — payment ${v === 'yes' ? 'verified' : 'marked pending'}`)
          }}
          onClose={() => setEdit(null)}
        />
      )}
    </div>
  )
}
