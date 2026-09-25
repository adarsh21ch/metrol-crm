import { useMemo } from 'react'
import { DataGrid, type GridCol, type PhoneView } from '@/components/DataGrid'
import { Chip } from '@/components/bits'
import { count, fmtCompact } from '@/lib/format'
import { fmtDate, reelShortCode, type Client, type IncentiveClaim, type Page, type PageAssignment, type PageReel } from '@/lib/hr'
import type { Agency } from '@/data/useAgency'

export type ReelTier = 'all' | '1m' | '10m'

/** One reel, whichever way the app first heard of it: fetched off its page
 *  (page_reels), claimed by the person who made it (incentive_claims), or
 *  both — joined on the reel's own short code. */
interface ReelRow {
  id: string
  code: string
  url: string
  caption: string | null
  client: string
  page: string
  smm: string
  team: string
  claimedBy: string
  claimState: 'none' | 'claimed' | 'rejected'
  views: number | null
  when: string | null
}

/**
 * The reel master view, v1 (AGENCY-OS-PLAN.md §5, "ships at the end of
 * Phase 1 from what already exists"): every reel on every page, with its
 * client, who holds the page, the rest of the client's team, who claimed it
 * and how far it got. Phase 2 adds the workflow stage column.
 */
export function ReelsMaster({
  agency, clients, pages, pageAssignments, pageReels, claims, clientId, tier, phoneView,
}: {
  agency: Agency
  clients: Client[]
  pages: Page[]
  pageAssignments: PageAssignment[]
  pageReels: PageReel[]
  claims: IncentiveClaim[]
  clientId: string
  tier: ReelTier
  phoneView: PhoneView
}) {
  const { team, accessData } = agency
  const pageHolder = accessData.roles.find((r) => r.pageHolder)?.id ?? null

  const rows: ReelRow[] = useMemo(() => {
    const nameOf = (employeeId: string) => team.rows.find((t) => t.employeeId === employeeId)?.fullName ?? 'Someone'
    const first = (n: string) => n.split(' ')[0]!
    const pageById = new Map(pages.map((p) => [p.id, p]))
    const clientById = new Map(clients.map((c) => [c.id, c]))
    const describe = (pageId: string | null) => {
      const page = pageId ? pageById.get(pageId) : undefined
      const client = page ? clientById.get(page.clientId) : undefined
      const holders = page ? pageAssignments.filter((a) => a.pageId === page.id).map((a) => first(nameOf(a.employeeId))) : []
      const others = client
        ? [...new Set(team.rows.filter((t) => t.clientId === client.id && !t.endedAt && t.roleId !== pageHolder).map((t) => first(t.fullName)))]
        : []
      return {
        clientId: client?.id ?? null,
        client: client?.name ?? '—',
        page: page ? (page.label || page.instagramHandle || 'Page') : 'No page on file',
        smm: holders.join(', '),
        team: others.join(', '),
      }
    }
    const byCode = new Map<string, ReelRow & { clientId: string | null }>()
    for (const r of pageReels) {
      const d = describe(r.pageId)
      byCode.set(r.shortCode, {
        id: 'r-' + r.id, code: r.shortCode, url: r.reelUrl, caption: r.caption, ...d,
        claimedBy: '', claimState: 'none', views: r.views, when: r.postedAt,
      })
    }
    for (const c of claims) {
      const code = reelShortCode(c.reelUrl) ?? c.id
      const existing = byCode.get(code)
      const who = nameOf(c.employeeId)
      if (existing) {
        existing.claimedBy = who
        existing.claimState = c.rejected ? 'rejected' : 'claimed'
        existing.views = Math.max(existing.views ?? 0, c.views) || existing.views
      } else {
        const d = describe(c.pageId)
        byCode.set(code, {
          id: 'c-' + c.id, code, url: c.reelUrl, caption: null, ...d, claimedBy: who,
          claimState: c.rejected ? 'rejected' : 'claimed', views: c.views || null, when: c.createdAt,
        })
      }
    }
    const floor = tier === '10m' ? 10_000_000 : tier === '1m' ? 1_000_000 : 0
    return [...byCode.values()]
      .filter((r) => (!clientId || r.clientId === clientId) && (floor === 0 || (r.views ?? 0) >= floor))
      .sort((a, b) => (b.when ?? '').localeCompare(a.when ?? ''))
  }, [pages, clients, pageAssignments, pageReels, claims, team.rows, pageHolder, clientId, tier])

  const cols: GridCol<ReelRow>[] = [
    { key: 'when', label: 'Posted', width: 110, render: (r) => (r.when ? fmtDate(r.when) : <span className="cell-dash">—</span>) },
    { key: 'client', label: 'Client', width: 150, render: (r) => r.client },
    { key: 'page', label: 'Page', width: 160, render: (r) => r.page },
    { key: 'smm', label: 'SMM', width: 130, render: (r) => r.smm || <span className="cell-dash">—</span> },
    { key: 'team', label: 'Team', width: 150, render: (r) => r.team || <span className="cell-dash">—</span> },
    {
      key: 'claim', label: 'Claimed by', width: 140,
      render: (r) => (r.claimState === 'none' ? <span className="cell-dash">Not claimed</span>
        : r.claimState === 'rejected' ? <span className="cell-mute">{r.claimedBy} · rejected</span> : r.claimedBy),
    },
    { key: 'views', label: 'Views', width: 96, render: (r) => (r.views != null ? <span className="cell-strong">{fmtCompact(r.views)}</span> : <span className="cell-dash">—</span>) },
    {
      key: 'tier', label: 'Tier', width: 84,
      render: (r) => ((r.views ?? 0) >= 10_000_000 ? <Chip cls="chip--good">10M+</Chip>
        : (r.views ?? 0) >= 1_000_000 ? <Chip cls="chip--accent">1M+</Chip> : <span className="cell-dash">—</span>),
    },
    { key: 'link', label: 'Reel', width: 80, render: (r) => <a href={r.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>Open</a> },
  ]

  return (
    <div className="section">
      <DataGrid cols={cols} rows={rows} storageKey="agency-reels" phoneView={phoneView}
                empty={tier === 'all' ? 'No reels yet — refresh a page\'s reels, or claim one.' : `No reel has crossed ${tier === '10m' ? '10M' : '1M'} views yet.`}
                foot={<div className="grid-foot">
                  <span>{count(rows.length, 'reel')} · {rows.filter((r) => r.claimState === 'claimed').length} claimed</span>
                  <span className="grid-hint">Fetched reels and claimed reels, joined on the reel's own link</span>
                </div>} />
    </div>
  )
}
