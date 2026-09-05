import { daysSince, money } from '@/lib/format'
import { isConverted, type Lead, type Member } from '@/lib/types'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** The prototype's charts, carried over. The palette is already the brand's —
 *  one accent fill for value, a neutral rule for an empty day — so nothing here
 *  needs recolouring; only the numbers changed source. */
export function Dashboard({ conv, leads, members }: { conv: Lead[]; leads: Lead[]; members: Member[] }) {
  const sum = (rs: Lead[]) => rs.reduce((s, l) => s + l.amount, 0)
  const since = (l: Lead) => daysSince(l.convertedAt ?? l.createdAt)
  const within = (n: number) => conv.filter((l) => since(l) <= n)
  const onDay = (d: number) => conv.filter((l) => since(l) === d)
  const deals = (n: number) => n + (n === 1 ? ' deal' : ' deals')

  const tiles = [
    { k: 'Today', v: sum(onDay(0)), s: deals(onDay(0).length) },
    { k: 'This week', v: sum(within(6)), s: deals(within(6).length) },
    { k: 'This month', v: sum(within(30)), s: deals(within(30).length) },
    { k: 'This year', v: sum(conv), s: deals(conv.length) },
  ]

  const buckets = [6, 5, 4, 3, 2, 1, 0].map((d) => ({ d, v: sum(onDay(d)) }))
  const max = Math.max(...buckets.map((b) => b.v)) || 1

  // A converted lead that nobody holds still has money on it — the owner can
  // record a sale on an unassigned lead, and a lead can be unassigned after it
  // closed. Without this row the bars silently sum to less than the tiles
  // directly above them, and the sidebar's own promise ("every number here is
  // calculated from the rows in the tables") stops being true.
  const orphan = sum(conv.filter((l) => !l.ownerId))
  const team = [
    ...members.map((m) => ({ name: m.name, all: sum(leads.filter((l) => l.ownerId === m.id && isConverted(l))) })),
    ...(orphan ? [{ name: 'Unassigned', all: orphan }] : []),
  ].sort((a, b) => b.all - a.all)
  const topMax = Math.max(...team.map((t) => t.all)) || 1

  return (
    <div className="section is-on">
      <div className="section-head">
        <h3>Sales dashboard</h3>
        <div className="sub">Money in, and who brought it</div>
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

      <div className="dash-grid">
        <div className="chart-card">
          <div className="chart-head">
            <h4>Last 7 days</h4>
            <span className="sub">{money(sum(within(6)))} this week · {deals(within(6).length)}</span>
          </div>
          <div className="bars">
            {buckets.map((b) => {
              const today = b.d === 0
              // Selective labels: the best day and today are always called out,
              // the rest appear on hover, so a small bar's number is never
              // stranded at the top of the chart.
              const callOut = !!b.v && (b.v === max || today)
              const h = b.v ? Math.max(4, Math.round((b.v / max) * 100)) : 2
              return (
                <div key={b.d}
                     className={'bar-col' + (b.v ? '' : ' is-zero') + (today ? ' is-today' : '')}
                     title={`${today ? 'Today' : b.d + ' days ago'} · ${money(b.v)}`}>
                  <div className={'bar-value' + (callOut ? ' is-shown' : '')}>{money(b.v)}</div>
                  <div className="bar" style={{ height: h + '%' }} />
                  <div className="bar-label">{today ? 'Today' : DAYS[(new Date().getDay() + 6 - b.d) % 7]}</div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="chart-card">
          <div className="chart-head"><h4>Who closed it</h4><span className="sub">All time</span></div>
          <div className="hbars">
            {team.length === 0 && <span className="cell-dash">Nobody is assigned to this project yet.</span>}
            {team.map((t) => (
              <div className={'hbar' + (t.all ? '' : ' is-zero')} key={t.name}>
                <span className="hbar-nm">{t.name}</span>
                <span className="hbar-track">
                  <span className="hbar-fill" style={{ width: (t.all ? Math.max(3, Math.round((t.all / topMax) * 100)) : 3) + '%' }} />
                </span>
                <span className="hbar-v">{money(t.all)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
