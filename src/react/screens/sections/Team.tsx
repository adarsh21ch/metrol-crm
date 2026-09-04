import { DataGrid, type GridCol } from '@/components/DataGrid'
import { Avatar } from '@/components/bits'
import { daysSince, money } from '@/lib/format'
import { isConnected, isConverted, type Lead, type Member } from '@/lib/types'

interface Row { id: string; name: string; initials: string; avatarUrl: string | null; assigned: number; connected: number; followups: number; converted: number; today: number; week: number; month: number; all: number }

export function Team({ leads, members }: { leads: Lead[]; members: Member[] }) {
  const sum = (rs: Lead[]) => rs.reduce((s, l) => s + l.amount, 0)
  const since = (l: Lead) => daysSince(l.convertedAt ?? l.createdAt)

  const rows: Row[] = members.map((m) => {
    const mine = leads.filter((l) => l.ownerId === m.id)
    const cv = mine.filter(isConverted)
    return {
      id: m.id, name: m.name, initials: m.initials, avatarUrl: m.avatarUrl,
      assigned: mine.length,
      connected: mine.filter(isConnected).length,
      followups: mine.filter((l) => l.status === 'follow_up').length,
      converted: cv.length,
      today: sum(cv.filter((l) => since(l) === 0)),
      week: sum(cv.filter((l) => since(l) <= 6)),
      month: sum(cv.filter((l) => since(l) <= 30)),
      all: sum(cv),
    }
  }).sort((a, b) => b.all - a.all)

  const cols: GridCol<Row>[] = [
    { key: 'nm', label: 'Team member', width: 200, render: (r) => <span className="td-flex"><Avatar src={r.avatarUrl}>{r.initials}</Avatar><span className="cell-strong">{r.name}</span></span> },
    { key: 'as', label: 'Leads', width: 88, render: (r) => <span className="num">{r.assigned}</span> },
    { key: 'cn', label: 'Connected', width: 106, render: (r) => <span className="num">{r.connected}</span> },
    { key: 'fu', label: 'Follow-ups', width: 110, render: (r) => <span className="num">{r.followups}</span> },
    { key: 'cv', label: 'Converted', width: 106, render: (r) => <span className="num">{r.converted}</span> },
    { key: 'td', label: 'Today', width: 112, render: (r) => <span className="cell-money">{money(r.today)}</span> },
    { key: 'wk', label: 'This week', width: 124, render: (r) => <span className="cell-money">{money(r.week)}</span> },
    { key: 'mo', label: 'This month', width: 130, render: (r) => <span className="cell-money">{money(r.month)}</span> },
    { key: 'all', label: 'All time', width: 138, render: (r) => <span className="cell-money" style={{ color: 'var(--ink)' }}>{money(r.all)}</span> },
  ]

  return (
    <div className="section is-on">
      <div className="section-head">
        <h3>Team tracking</h3>
        <div className="sub">Ranked by all-time closed value</div>
      </div>
      <DataGrid
        cols={cols} rows={rows} storageKey="team"
        foot={<div className="grid-foot"><span>{members.length} salespeople on this project</span></div>}
      />
    </div>
  )
}
