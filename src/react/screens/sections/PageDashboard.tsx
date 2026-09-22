import { useMemo, useState } from 'react'
import { DataGrid, PhoneViewPick, usePhoneView, type GridCol } from '@/components/DataGrid'
import { Chip, Kpi } from '@/components/bits'
import { count } from '@/lib/format'
import { INCENTIVE_PAGE_TYPE } from '@/lib/hr'
import type { Client, Page, PageReel } from '@/lib/hr'
import type { RefreshResult } from '@/data/usePageReels'

/* The same two thresholds incentive_rules pays on (0031) — a reel clears 1M
 * or 10M and earns its tier. Naming them here keeps the dashboard answering
 * the question the incentive system actually asks: which reels qualified. */
const TIER_1M = 1_000_000
const TIER_10M = 10_000_000

const num = (n: number | null) => (n == null ? '—' : n.toLocaleString('en-IN'))
/** -1 is Instagram's own signal that the creator hid the count, not missing
 *  data — a bare negative number there reads as a bug, so it is named. */
const cnt = (n: number | null) => (n == null ? '—' : n === -1 ? 'hidden' : n.toLocaleString('en-IN'))
const fmtDate = (s: string | null) => {
  if (!s) return '—'
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
/** The KPI carries the TIME as well as the date, so "did my refresh actually
 *  run just now" is answerable by looking rather than by guessing. */
const fmtWhen = (s: string | null) => {
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

/** Engagement as Instagram itself is usually read: the interactions a reel
 *  earned against the people who actually saw it. Needs views to mean
 *  anything, so it is honestly blank without them rather than dividing by a
 *  number nobody has. */
function engagement(r: PageReel): number | null {
  if (!r.views || r.views <= 0) return null
  const acts = (r.likes && r.likes > 0 ? r.likes : 0) + (r.comments ?? 0) + (r.shares ?? 0)
  return (acts / r.views) * 100
}

type Sort = 'views' | 'likes' | 'recent'
type Tier = 'all' | '1m' | '10m'

/**
 * One Instagram page's own dashboard — a real screen, not a popup
 * (Adarsh, 2026-09-22: "do you think a one single pop-up of this size can
 * justify the data and analysis of a one whole Instagram page? No"). Full
 * width, the app's own resizable table, every metric as its own column.
 *
 * Hosted in place by whichever screen opened it — the employee's My pages,
 * the department head's roster, and HR's Clients & Pages all render this
 * same component with a back button rather than each growing their own
 * version of it.
 */
export function PageDashboard({
  page, client, reels, onBack, onRefresh,
}: {
  page: Page
  client: Client | null
  reels: PageReel[]
  onBack: () => void
  onRefresh: () => Promise<RefreshResult>
}) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [debugSample, setDebugSample] = useState<Record<string, unknown> | null>(null)
  const [sort, setSort] = useState<Sort>('views')
  const [tier, setTier] = useState<Tier>('all')
  const [gridView, setGridView] = usePhoneView('page-reels')

  const sorted = useMemo(() => {
    const floor = tier === '10m' ? TIER_10M : tier === '1m' ? TIER_1M : 0
    const list = reels.filter((r) => (floor === 0 ? true : (r.views ?? 0) >= floor))
    if (sort === 'recent') return list.sort((a, b) => (b.postedAt ?? '').localeCompare(a.postedAt ?? ''))
    if (sort === 'likes') return list.sort((a, b) => (b.likes ?? -1) - (a.likes ?? -1))
    return list.sort((a, b) => (b.views ?? -1) - (a.views ?? -1))
  }, [reels, sort, tier])

  const totals = useMemo(() => {
    const views = reels.reduce((t, r) => t + (r.views ?? 0), 0)
    const likes = reels.reduce((t, r) => t + (r.likes && r.likes > 0 ? r.likes : 0), 0)
    const comments = reels.reduce((t, r) => t + (r.comments ?? 0), 0)
    const shares = reels.reduce((t, r) => t + (r.shares ?? 0), 0)
    const rated = reels.map(engagement).filter((e): e is number => e != null)
    return {
      views, likes, comments, shares,
      over1m: reels.filter((r) => (r.views ?? 0) >= TIER_1M).length,
      viral: reels.filter((r) => (r.views ?? 0) >= TIER_10M).length,
      avgEngagement: rated.length ? rated.reduce((t, e) => t + e, 0) / rated.length : null,
      lastFetched: reels.reduce<string | null>((latest, r) => (!latest || r.fetchedAt > latest ? r.fetchedAt : latest), null),
    }
  }, [reels])

  const refresh = async () => {
    setBusy(true); setNote(null); setDebugSample(null)
    const { message, matchedClaims, fetched, viewSource, debugSample: sample } = await onRefresh()
    setBusy(false)
    if (message) { setNote(message); return }
    // Say what the run actually achieved — which source the views came from,
    // or that neither had them. Silence after a 90-second wait is what made
    // this feel broken even when it worked.
    const parts = [`${count(fetched ?? 0, 'reel')} pulled`]
    if (viewSource === 'posts') parts.push('views came from the full Instagram scraper')
    else if (viewSource === 'reels') parts.push('views came with the reels')
    else parts.push('Instagram returned no view counts')
    if (matchedClaims > 0) parts.push(`${count(matchedClaims, 'claim')} updated`)
    setNote(parts.join(' · '))
    if (sample) setDebugSample(sample)
  }

  const cols: GridCol<PageReel>[] = [
    {
      key: 'reel', label: 'Reel', width: 320,
      render: (r) => (
        <div className="td-flex">
          {r.thumbnailUrl && (
            <img src={r.thumbnailUrl} alt="" width={34} height={34}
                 style={{ borderRadius: 5, objectFit: 'cover', flexShrink: 0 }} />
          )}
          <a href={r.reelUrl} target="_blank" rel="noreferrer">
            {r.caption ? r.caption.slice(0, 70) : 'Reel'}{r.caption && r.caption.length > 70 ? '…' : ''}
          </a>
        </div>
      ),
    },
    { key: 'views', label: 'Views', width: 116, render: (r) => <span className="cell-strong">{num(r.views)}</span> },
    { key: 'likes', label: 'Likes', width: 104, render: (r) => cnt(r.likes) },
    { key: 'comments', label: 'Comments', width: 116, render: (r) => cnt(r.comments) },
    { key: 'shares', label: 'Shares', width: 100, render: (r) => cnt(r.shares) },
    {
      key: 'eng', label: 'Engagement', width: 124,
      render: (r) => {
        const e = engagement(r)
        return e == null ? <span className="cell-dash">—</span> : `${e.toFixed(1)}%`
      },
    },
    { key: 'posted', label: 'Posted', width: 128, render: (r) => fmtDate(r.postedAt) },
  ]

  return (
    <>
      <div className="section-head">
        <h3 className="td-flex">
          <button className="btn btn--sm" onClick={onBack} aria-label="Back">←</button>
          {client?.name ?? 'Unknown client'} — {INCENTIVE_PAGE_TYPE[page.pageType]}
          {page.instagramHandle && <Chip cls="chip--mute">{page.instagramHandle}</Chip>}
          {!page.isActive && <Chip cls="chip--mute">Retired</Chip>}
        </h3>
        <div className="section-tools">
          <div className="seg" role="group" aria-label="Sort reels by">
            <button className={sort === 'views' ? 'is-on' : ''} onClick={() => setSort('views')}>Views</button>
            <button className={sort === 'likes' ? 'is-on' : ''} onClick={() => setSort('likes')}>Likes</button>
            <button className={sort === 'recent' ? 'is-on' : ''} onClick={() => setSort('recent')}>Recent</button>
          </div>
          <PhoneViewPick view={gridView} onPick={setGridView} />
          <button className="btn btn--sm btn--primary" disabled={busy} onClick={() => void refresh()}>
            {busy ? 'Refreshing…' : 'Refresh reels'}
          </button>
        </div>
      </div>

      {note && <p className="punch-note">{note}</p>}

      {/* Derived from the stored rows, not from the last button press, so it
          survives a reload and always states the true situation. Instagram
          stopped exposing play counts on some accounts; when that is what
          happened, this says so rather than leaving a column of dashes to be
          read as a broken app. */}
      {reels.length > 0 && reels.every((r) => r.views == null) && (
        <div className="banner">
          <div>
            <div className="t">Instagram is not returning view counts for this page</div>
            <div className="d">
              Likes and comments came through; views and shares did not. Press <strong>Refresh reels</strong> —
              it will automatically try Apify's full Instagram scraper as a second source. If views are still
              blank after that, this account's reels do not expose play counts publicly, and HR can still enter
              a view count by hand on each incentive claim.
            </div>
          </div>
        </div>
      )}

      {debugSample && (
        <div className="banner">
          <div>
            <div className="t">Instagram sent no view count for any of these reels</div>
            <div className="d">
              These are the raw fields it did send for one reel — screenshot this and send it over:
              <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all', marginTop: 8 }}>
                {JSON.stringify(debugSample, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* The last two are the incentive tiers, and they are buttons: clicking
          one filters the table to the reels that actually qualified, which is
          the question HR and the creator both open this screen to answer. */}
      <div className="kpis">
        <Kpi accent label="Reels" value={reels.length} active={tier === 'all'} onClick={() => setTier('all')}
             sub={totals.lastFetched ? `fetched ${fmtWhen(totals.lastFetched)}` : 'never fetched'} />
        <Kpi label="Views" value={num(totals.views)} sub="" />
        <Kpi label="Likes" value={num(totals.likes)} sub="" />
        <Kpi label="Engagement" value={totals.avgEngagement == null ? '—' : `${totals.avgEngagement.toFixed(1)}%`} sub="" />
        <Kpi label="1M+" value={totals.over1m} sub="" active={tier === '1m'} onClick={() => setTier('1m')} />
        <Kpi accent label="10M+" value={totals.viral} sub="" active={tier === '10m'} onClick={() => setTier('10m')} />
      </div>

      <DataGrid
        cols={cols}
        rows={sorted}
        storageKey="page-reels"
        phoneView={gridView}
        empty={tier === 'all'
          ? "No reels pulled yet — press Refresh reels to fetch this page's latest ones."
          : `No reel on this page has crossed ${tier === '10m' ? '10M' : '1M'} views yet.`}
        foot={
          <div className="grid-foot">
            <span>
              {tier === 'all'
                ? `${count(reels.length, 'reel')} · ${num(totals.views)} views · ${num(totals.likes)} likes`
                : `${count(sorted.length, 'reel')} past ${tier === '10m' ? '10M' : '1M'} views, of ${reels.length}`}
            </span>
            <span className="grid-hint">Drag a column edge to resize · <kbd>double-click</kbd> to reset</span>
          </div>
        }
      />
    </>
  )
}
