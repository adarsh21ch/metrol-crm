import { addDays, isoDow, parseViews } from '@/lib/targets'
import { channelHandle, igHandle, type PageChannel, type Platform } from '@/lib/agency'

/**
 * Reading one client's tab of the Client Master Sheet (AGENCY-OS-PLAN.md §6,
 * Phase 1 step 4) — by its layout, the way a person reads it, not by fixed
 * cell addresses, because every client's tab has a different number of pages
 * and weeks:
 *
 *   TEAM            SMM | EDITORS, names underneath
 *   TARGET | TOTAL | April - June (20%) | July - sep (30%) | …
 *   <name> | 750 M | 150 M | 225 M | …
 *   Achieved|      | 88383139 | 244100411 | …
 *   Fanpages| INSTAGRAM (PAGES NAME, LINKS) | YOUTUBE (PAGES NAME, LINKS) | 27 April - 3 May …
 *           |                                                           | Insta Views | SS | Yt Views | SS …
 *   1       | Healing Rahasya | instagram.com/… | Healing Rahasya | youtube.com/… | 70971 | … | 11239 | …
 *
 * Nothing here writes anything; planImport() says what an import WOULD do,
 * and the screen shows that, and the sheet's own Achieved figures beside
 * ours, before anybody presses Import.
 */

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const monthIndex = (s: string) => MONTHS.indexOf(s.trim().slice(0, 3).toLowerCase())
const pad = (n: number) => String(n).padStart(2, '0')
const clean = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim()

/** A sheet date range ("27 April - 3 May", "1 - 26 April", "29 june - 5
 *  july"), placed in the target's years: a month before the target's first
 *  month belongs to the following year (an April–March target). */
export function parseRange(text: string, yearOf: (month0: number) => number): { from: string; to: string } | null {
  const m = text.match(/(\d{1,2})\s*([A-Za-z]{3,})?\.?\s*(?:-|–|—|to)\s*(\d{1,2})\s*([A-Za-z]{3,})/i)
  if (!m) return null
  const endM = monthIndex(m[4]!)
  const startM = m[2] ? monthIndex(m[2]) : endM
  if (endM < 0 || startM < 0) return null
  const endY = yearOf(endM)
  const startY = startM > endM ? endY - 1 : yearOf(startM)
  const from = `${startY}-${pad(startM + 1)}-${pad(Number(m[1]))}`
  const to = `${endY}-${pad(endM + 1)}-${pad(Number(m[3]))}`
  return from <= to ? { from, to } : null
}

/** "April - June (20%)" → the whole months, and the share. */
function parsePeriodHeader(text: string, yearOf: (month0: number) => number) {
  const share = text.match(/\((\d+(?:\.\d+)?)\s*%\)/)
  const m = text.match(/([A-Za-z]{3,})\s*(?:-|–|—|to)\s*([A-Za-z]{3,})/)
  let from: string | null = null
  let to: string | null = null
  if (m) {
    const a = monthIndex(m[1]!)
    const b = monthIndex(m[2]!)
    if (a >= 0 && b >= 0) {
      const ya = yearOf(a)
      const yb = b < a ? ya + 1 : yearOf(b)
      from = `${ya}-${pad(a + 1)}-01`
      to = addDays(`${b === 11 ? yb + 1 : yb}-${pad(b === 11 ? 1 : b + 2)}-01`, -1)
    }
  }
  return { label: clean(text.replace(/\(.*?\)/g, '')), share: share ? Number(share[1]) : null, from, to }
}

export type SheetPlatform = Platform | 'total'

export interface SheetColumn { col: number; platform: SheetPlatform; rangeKey: string }
export interface SheetRange { key: string; label: string; from: string; to: string; /** a real Monday–Sunday week */ week: string | null }

export interface SheetPageRow {
  /** the sheet's own row number, for "row 23" in a message */
  row: number
  num: string
  igName: string
  igLink: string
  ytName: string
  ytLink: string
  values: { platform: SheetPlatform; rangeKey: string; views: number }[]
}

export interface SheetTarget {
  total: number | null
  periods: { label: string; share: number | null; goal: number | null; from: string | null; to: string | null; achieved: number | null }[]
  left: number | null
}

export interface ParsedSheet {
  pages: SheetPageRow[]
  ranges: SheetRange[]
  target: SheetTarget | null
  team: { role: string; names: string[] }[]
  warnings: string[]
}

export function parseClientMaster(rows: string[][], yearOf: (month0: number) => number): ParsedSheet | { error: string } {
  const at = (r: number, c: number) => clean(rows[r]?.[c])
  const warnings: string[] = []

  // --- the page table's header row: the one with "PAGES NAME"
  const h = rows.findIndex((r) => r.some((c) => /^pages?\s*name$/i.test(clean(c))))
  if (h < 1) return { error: 'This tab has no "PAGES NAME" header — is it a Client Master tab?' }
  const width = Math.max(...rows.map((r) => r.length))

  // Row h-1 carries merged labels (INSTAGRAM, YOUTUBE, "27 April - 3 May"):
  // a merged cell's text sits in its first column, so it is carried right.
  const group: string[] = []
  let carry = ''
  for (let c = 0; c < width; c++) { if (at(h - 1, c)) carry = at(h - 1, c); group.push(carry) }

  const nameCols: number[] = []
  const linkCols: number[] = []
  for (let c = 0; c < width; c++) {
    const t = at(h, c)
    if (/^pages?\s*name$/i.test(t)) nameCols.push(c)
    else if (/^links?$/i.test(t)) linkCols.push(c)
  }
  const platformAt = (c: number): Platform | null =>
    /insta/i.test(group[c] ?? '') ? 'instagram' : /you\s*tube|^yt\b/i.test(group[c] ?? '') ? 'youtube' : /face\s*book/i.test(group[c] ?? '') ? 'facebook' : null
  const pick = (p: Platform) => ({
    name: nameCols.find((c) => platformAt(c) === p) ?? -1,
    link: linkCols.find((c) => platformAt(c) === p) ?? -1,
  })
  const ig = pick('instagram')
  const yt = pick('youtube')
  // One unlabelled pair is Instagram, the way the sheet began.
  if (ig.name < 0 && nameCols.length) { ig.name = nameCols[0]!; ig.link = linkCols[0] ?? -1 }

  // --- the weekly columns: a date range above, a platform's views below
  const ranges = new Map<string, SheetRange>()
  const columns: SheetColumn[] = []
  const firstData = Math.max(...nameCols, ...linkCols, 0) + 1
  for (let c = firstData; c < width; c++) {
    const label = group[c] ?? ''
    const range = parseRange(label, yearOf)
    if (!range) continue
    const head = at(h, c)
    if (/^ss$|screen\s*shot/i.test(head)) continue
    let platform: SheetPlatform | null = null
    if (/insta/i.test(head)) platform = 'instagram'
    else if (/\byt\b|you\s*tube/i.test(head)) platform = 'youtube'
    else if (/\bfb\b|face\s*book/i.test(head)) platform = 'facebook'
    else if (/total/i.test(label) && (!head || /views?/i.test(head))) platform = 'total'
    if (!platform) continue
    const key = range.from + '|' + range.to
    if (!ranges.has(key)) {
      const isWeek = isoDow(range.from) === 1 && addDays(range.from, 6) === range.to
      ranges.set(key, { key, label: label.replace(/\s*\(.*?\)\s*/g, ' ').trim(), from: range.from, to: range.to, week: isWeek ? range.from : null })
    }
    columns.push({ col: c, platform, rangeKey: key })
  }
  if (columns.length === 0) warnings.push('No weekly columns were found — only the pages will be imported.')

  // --- the page rows
  const pages: SheetPageRow[] = []
  let blanks = 0
  for (let r = h + 1; r < rows.length; r++) {
    const row: SheetPageRow = {
      row: r + 1,
      num: at(r, 0),
      igName: ig.name >= 0 ? at(r, ig.name) : '',
      igLink: ig.link >= 0 ? at(r, ig.link) : '',
      ytName: yt.name >= 0 ? at(r, yt.name) : '',
      ytLink: yt.link >= 0 ? at(r, yt.link) : '',
      values: [],
    }
    if (!row.igName && !row.igLink && !row.ytName && !row.ytLink) {
      if (pages.length && ++blanks >= 3) break
      continue
    }
    blanks = 0
    for (const col of columns) {
      const raw = at(r, col.col)
      if (!raw) continue
      const n = parseViews(raw)
      if (n == null || n < 0) { warnings.push(`Row ${r + 1}: "${raw}" is not a number of views — left out.`); continue }
      row.values.push({ platform: col.platform, rangeKey: col.rangeKey, views: n })
    }
    pages.push(row)
  }

  // --- the TARGET block
  let target: SheetTarget | null = null
  const t = rows.findIndex((r) => /^target$/i.test(clean(r[0])))
  if (t >= 0 && t < h) {
    const totalCol = rows[t]!.findIndex((c) => /^total$/i.test(clean(c)))
    const periodCols: number[] = []
    for (let c = (totalCol >= 0 ? totalCol : 0) + 1; c < (rows[t]!.length); c++) if (at(t, c)) periodCols.push(c)
    const rowOf = (re: RegExp) => { const i = rows.findIndex((r, k) => k > t && k < h && re.test(clean(r[0]))); return i }
    const ach = rowOf(/^achieved/i)
    const left = rowOf(/^left/i)
    target = {
      total: totalCol >= 0 ? parseViews(at(t + 1, totalCol)) : null,
      periods: periodCols.map((c) => {
        const p = parsePeriodHeader(at(t, c), yearOf)
        return { ...p, goal: parseViews(at(t + 1, c)), achieved: ach >= 0 ? parseViews(at(ach, c)) : null }
      }),
      left: left >= 0 ? rows[left]!.map((c) => parseViews(clean(c))).filter((n): n is number => n != null).pop() ?? null : null,
    }
  }

  // --- the TEAM block: role headings in a row, names underneath
  const team: { role: string; names: string[] }[] = []
  const tm = rows.findIndex((r) => /^team$/i.test(clean(r[0])))
  if (tm >= 0 && tm + 1 < h) {
    for (let c = 0; c < width; c++) {
      const role = at(tm + 1, c)
      if (!role) continue
      const names: string[] = []
      for (let r = tm + 2; r < Math.min(h, tm + 12) && at(r, 0) !== 'TARGET'; r++) {
        if (/^target$/i.test(at(r, 0))) break
        if (at(r, c)) names.push(at(r, c))
      }
      team.push({ role, names })
    }
  }

  return { pages, ranges: [...ranges.values()].sort((a, b) => a.from.localeCompare(b.from)), target, team, warnings }
}

/* --------------------------------------------------------------- the plan */

export interface PlannedPage {
  sheet: SheetPageRow
  /** an existing page, or null for one the import will add */
  pageId: string | null
  label: string
  channels: Partial<Record<Platform, { handle: string; url: string; channelId: string | null }>>
}

export interface PlannedNumber { sheetRow: number; platform: Platform; weekStart: string; views: number }
export interface Unplaced { rangeKey: string; label: string; from: string; to: string; views: number }

export interface ImportPlan {
  pages: PlannedPage[]
  numbers: PlannedNumber[]
  /** sheet columns that are not a Monday–Sunday week, added up */
  unplaced: Unplaced[]
}

/** What an import would do, against the client's pages as they are now. A
 *  sheet row is the same page as an app page when their Instagram (or
 *  YouTube) handles match, else when their names do. */
export function planImport(
  parsed: ParsedSheet,
  appPages: { id: string; label: string }[],
  appChannels: PageChannel[],
): ImportPlan {
  const norm = (s: string) => s.toLowerCase().replace(/^@/, '').replace(/\s+/g, ' ').trim()
  const live = appChannels.filter((c) => c.isActive && appPages.some((p) => p.id === c.pageId))
  const pages: PlannedPage[] = parsed.pages.map((row) => {
    const igH = row.igLink ? igHandle(row.igLink) : row.igName && !/\s/.test(row.igName) ? igHandle(row.igName) : ''
    const ytH = row.ytLink ? channelHandle('youtube', row.ytLink) : ''
    const byHandle = live.find((c) => (c.platform === 'instagram' && igH && norm(c.handle) === norm(igH))
      || (c.platform === 'youtube' && ytH && norm(c.handle) === norm(ytH)))
    const name = row.igName || row.ytName
    const byName = appPages.find((p) => p.label && (norm(p.label) === norm(row.igName) || norm(p.label) === norm(row.ytName)))
    const pageId = byHandle?.pageId ?? byName?.id ?? null
    const chan = (p: Platform) => live.find((c) => c.pageId === pageId && c.platform === p) ?? null
    const channels: PlannedPage['channels'] = {}
    if (igH || row.igLink) {
      const existing = chan('instagram')
      channels.instagram = { handle: existing?.handle ?? igH, url: existing?.url ?? (row.igLink.startsWith('http') ? row.igLink : ''), channelId: existing?.id ?? null }
    }
    if (ytH || row.ytLink || row.ytName) {
      const existing = chan('youtube')
      channels.youtube = { handle: existing?.handle ?? (ytH || row.ytName), url: existing?.url ?? (row.ytLink.startsWith('http') ? row.ytLink : ''), channelId: existing?.id ?? null }
    }
    return { sheet: row, pageId, label: name, channels }
  })

  const byKey = new Map(parsed.ranges.map((r) => [r.key, r]))
  const numbers: PlannedNumber[] = []
  const unplacedMap = new Map<string, Unplaced>()
  for (const p of pages) {
    for (const v of p.sheet.values) {
      const range = byKey.get(v.rangeKey)!
      if (range.week && v.platform !== 'total' && p.channels[v.platform]) {
        numbers.push({ sheetRow: p.sheet.row, platform: v.platform, weekStart: range.week, views: v.views })
      } else {
        const u = unplacedMap.get(v.rangeKey) ?? { rangeKey: v.rangeKey, label: range.label, from: range.from, to: range.to, views: 0 }
        u.views += v.views
        unplacedMap.set(v.rangeKey, u)
      }
    }
  }
  return { pages, numbers, unplaced: [...unplacedMap.values()] }
}
