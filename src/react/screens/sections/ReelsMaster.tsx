import { useMemo } from 'react'
import { DataGrid, type GridCol, type PhoneView } from '@/components/DataGrid'
import { Chip } from '@/components/bits'
import { count, fmtCompact } from '@/lib/format'
import {
  duplicateClaims, fmtDate, reelShortCode, type Client, type IncentiveClaim, type Page, type PageAssignment, type PageReel,
} from '@/lib/hr'
import { doneStatusIds, fmtDue, isOverdue, safeUrl } from '@/lib/work'
import type { Agency } from '@/data/useAgency'
import type { WorkKit } from '@/screens/sections/ContentSection'

export type ReelTier = 'all' | '1m' | '10m'

/** One reel, whichever way the app first heard of it: fetched off its page
 *  (page_reels), claimed by the person who made it (incentive_claims), made
 *  and posted through Content (content_items, 0047) — or all three, joined
 *  on the reel's own short code. A reel still being made has no code yet:
 *  it is a row of its own, with its stage. */
interface ReelRow {
  id: string
  code: string
  url: string
  caption: string | null
  clientId: string | null
  client: string
  page: string
  smm: string
  team: string
  claimedBy: string
  claimState: 'none' | 'claimed' | 'rejected'
  /** Claims on this reel after the first (Q16) — flagged, not counted. */
  extraClaims: number
  views: number | null
  when: string | null
  item: { code: string; title: string } | null
  stage: { name: string; tone: string; done: boolean } | null
  editor: string
  due: string | null
  late: boolean
}

/**
 * The reel master view (AGENCY-OS-PLAN.md §5): every reel on every page, with
 * its client, who holds the page, the rest of the client's team, who claimed
 * it and how far it got — and, from Phase 2, the reels still being made,
 * with their stage, editor and due time, so one list shows the whole line.
 */
export function ReelsMaster({
  agency, clients, pages, pageAssignments, pageReels, claims, clientId, tier, phoneView, work,
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
  work?: WorkKit
}) {
  const { team, accessData } = agency
  const pageHolder = accessData.roles.find((r) => r.pageHolder)?.id ?? null
  const editorRole = accessData.roles.find((r) => /editor/i.test(r.name))?.id ?? null
  const items = work?.work.items
  const people = work?.work.people
  const tasks = work?.work.tasks
  const stages = work?.flows.stages
  const statuses = work?.flows.statuses

  const rows: ReelRow[] = useMemo(() => {
    const nameOf = (employeeId: string) => team.rows.find((t) => t.employeeId === employeeId)?.fullName
      ?? work?.staff.find((e) => e.id === employeeId)?.fullName ?? 'Someone'
    const first = (n: string) => n.split(' ')[0]!
    const pageById = new Map(pages.map((p) => [p.id, p]))
    const clientById = new Map(clients.map((c) => [c.id, c]))
    const done = doneStatusIds(statuses ?? [])
    const describe = (pageId: string | null, fallbackClient: string | null = null) => {
      const page = pageId ? pageById.get(pageId) : undefined
      const client = page ? clientById.get(page.clientId) : fallbackClient ? clientById.get(fallbackClient) : undefined
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
    const blank = { claimedBy: '', claimState: 'none' as const, extraClaims: 0, item: null, stage: null, editor: '', due: null, late: false }
    const byCode = new Map<string, ReelRow>()
    for (const r of pageReels) {
      byCode.set(r.shortCode, {
        id: 'r-' + r.id, code: r.shortCode, url: r.reelUrl, caption: r.caption, ...describe(r.pageId), ...blank,
        views: r.views, when: r.postedAt,
      })
    }
    const dupes = duplicateClaims(claims)
    // The first claim on a reel is its claim; later ones only raise the flag.
    for (const c of [...claims].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      const code = reelShortCode(c.reelUrl) ?? c.id
      const existing = byCode.get(code)
      if (dupes.has(c.id)) { if (existing) existing.extraClaims += 1; continue }
      const who = nameOf(c.employeeId)
      if (existing && existing.claimState === 'none') {
        existing.claimedBy = who
        existing.claimState = c.rejected ? 'rejected' : 'claimed'
        existing.views = Math.max(existing.views ?? 0, c.views) || existing.views
      } else if (!existing) {
        byCode.set(code, {
          id: 'c-' + c.id, code, url: c.reelUrl, caption: null, ...describe(c.pageId), ...blank, claimedBy: who,
          claimState: c.rejected ? 'rejected' : 'claimed', views: c.views || null, when: c.createdAt,
        })
      }
    }
    // Content (Phase 2): a posted reel joins on its code; one being made
    // is its own row.
    for (const it of items ?? []) {
      const st = stages?.find((s) => s.id === it.stageId)
      const open = (tasks ?? []).find((t) => t.contentItemId === it.id && t.stageId === it.stageId && !done.has(t.statusId))
      const named = editorRole ? people?.find((p) => p.itemId === it.id && p.roleId === editorRole)?.employeeId : null
      const cut = named ?? (tasks ?? []).filter((t) => t.contentItemId === it.id && t.roleId === editorRole && t.assigneeId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.assigneeId ?? null
      const made = {
        item: { code: it.code, title: it.title },
        stage: st ? { name: st.name, tone: st.tone, done: st.isDone } : null,
        editor: cut ? first(nameOf(cut)) : '',
        due: open?.dueAt ?? null,
        late: !!open && isOverdue(open, done),
      }
      const existing = it.postShortCode ? byCode.get(it.postShortCode) : undefined
      if (existing) { Object.assign(existing, made); continue }
      byCode.set(it.postShortCode ?? 'i-' + it.id, {
        id: 'i-' + it.id, code: it.postShortCode ?? '', url: safeUrl(it.postedUrl) ?? '', caption: null,
        ...describe(it.pageId, it.clientId), ...blank, ...made, views: null, when: it.postedAt,
      })
    }
    const floor = tier === '10m' ? 10_000_000 : tier === '1m' ? 1_000_000 : 0
    const making = (r: ReelRow) => !!r.stage && !r.stage.done && !r.url
    return [...byCode.values()]
      .filter((r) => (!clientId || r.clientId === clientId) && (floor === 0 || (r.views ?? 0) >= floor))
      // Being made first (soonest due first), then the posted, newest first.
      .sort((a, b) => Number(making(b)) - Number(making(a))
        || (making(a) ? (a.due ?? '9').localeCompare(b.due ?? '9') : (b.when ?? '').localeCompare(a.when ?? '')))
  }, [pages, clients, pageAssignments, pageReels, claims, team.rows, pageHolder, editorRole, clientId, tier, items, people, tasks, stages, statuses, work?.staff])

  const cols: GridCol<ReelRow>[] = [
    { key: 'when', label: 'Posted', width: 110, render: (r) => (r.when && r.url ? fmtDate(r.when) : <span className="cell-dash">—</span>) },
    { key: 'client', label: 'Client', width: 150, render: (r) => r.client },
    { key: 'page', label: 'Page', width: 160, render: (r) => r.page },
    ...(work ? [
      {
        key: 'item', label: 'Content', width: 200,
        render: (r: ReelRow) => (r.item
          ? <span className="work-task"><span className="cell-mono">{r.item.code}</span> <span className="cell-strong">{r.item.title}</span></span>
          : <span className="cell-dash">—</span>),
      },
      {
        key: 'stage', label: 'Stage', width: 130,
        render: (r: ReelRow) => (r.stage ? <Chip cls={'chip--' + r.stage.tone}>{r.stage.name}</Chip> : <span className="cell-dash">—</span>),
      },
    ] : []),
    { key: 'smm', label: 'SMM', width: 120, render: (r) => r.smm || <span className="cell-dash">—</span> },
    ...(work ? [
      { key: 'editor', label: 'Editor', width: 110, render: (r: ReelRow) => r.editor || <span className="cell-dash">—</span> },
      {
        key: 'due', label: 'Due', width: 140,
        render: (r: ReelRow) => (r.due ? <span className={r.late ? 'cell-late' : undefined}>{fmtDue(r.due)}</span> : <span className="cell-dash">—</span>),
      },
    ] : []),
    { key: 'team', label: 'Team', width: 150, render: (r) => r.team || <span className="cell-dash">—</span> },
    {
      key: 'claim', label: 'Claimed by', width: 160,
      render: (r) => (
        <span>
          {r.claimState === 'none' ? <span className="cell-dash">Not claimed</span>
            : r.claimState === 'rejected' ? <span className="cell-mute">{r.claimedBy} · rejected</span> : r.claimedBy}
          {r.extraClaims > 0 && <> <Chip cls="chip--bad">+{r.extraClaims} duplicate</Chip></>}
        </span>
      ),
    },
    { key: 'views', label: 'Views', width: 96, render: (r) => (r.views != null ? <span className="cell-strong">{fmtCompact(r.views)}</span> : <span className="cell-dash">—</span>) },
    {
      key: 'tier', label: 'Tier', width: 84,
      render: (r) => ((r.views ?? 0) >= 10_000_000 ? <Chip cls="chip--good">10M+</Chip>
        : (r.views ?? 0) >= 1_000_000 ? <Chip cls="chip--accent">1M+</Chip> : <span className="cell-dash">—</span>),
    },
    {
      key: 'link', label: 'Reel', width: 80,
      render: (r) => (r.url ? <a href={r.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>Open</a> : <span className="cell-dash">—</span>),
    },
  ]

  const making = rows.filter((r) => !!r.stage && !r.stage.done && !r.url).length
  const dupes = rows.reduce((t, r) => t + r.extraClaims, 0)
  return (
    <div className="section">
      <DataGrid cols={cols} rows={rows} storageKey={work ? 'agency-reels-2' : 'agency-reels'} phoneView={phoneView}
                empty={tier === 'all' ? 'No reels yet — refresh a page\'s reels, or claim one.' : `No reel has crossed ${tier === '10m' ? '10M' : '1M'} views yet.`}
                foot={<div className="grid-foot">
                  <span>
                    {count(rows.length - making, 'reel')}{making ? ` · ${making} being made` : ''} · {rows.filter((r) => r.claimState === 'claimed').length} claimed
                    {dupes ? <> · <span className="cell-late">{dupes} claimed twice</span></> : null}
                  </span>
                  <span className="grid-hint">Fetched, claimed and posted reels, joined on the reel's own link</span>
                </div>} />
    </div>
  )
}
