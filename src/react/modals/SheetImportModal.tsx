import { useMemo, useRef, useState } from 'react'
import { Modal } from '@/components/Modal'
import { Chip } from '@/components/bits'
import { readWorkbook } from '@/lib/importLeads'
import { parseClientMaster, planImport, type ImportPlan, type ParsedSheet } from '@/lib/sheetImport'
import { computeProgress, fmtDay } from '@/lib/targets'
import { officeToday } from '@/lib/attendance'
import { count, fmtCompact } from '@/lib/format'
import { PLATFORM, type Platform, type ViewAdjustment, type ViewTarget, type WeeklyView } from '@/lib/agency'
import type { Client, Page } from '@/lib/hr'
import type { Agency } from '@/data/useAgency'
import type { Pages } from '@/data/usePages'
import type { WeeklyViews } from '@/data/useWeeklyViews'

const exact = (n: number) => n.toLocaleString('en-IN')

/**
 * The one-time move off the Google Sheet (Phase 1, step 4): one client's tab
 * of the Client Master Sheet — pages, their Instagram and YouTube links, and
 * every weekly number — read, shown, and CHECKED against the sheet's own
 * Achieved row before anything is written. Download the whole Client Master
 * as Excel once; this asks which tab.
 */
export function SheetImportModal({
  agency, client, target, pages, pagesHook, weekly, onClose, onDone, toast,
}: {
  agency: Agency
  client: Client
  target: ViewTarget
  pages: Page[]
  pagesHook: Pages
  weekly: WeeklyViews
  onClose: () => void
  onDone: () => void
  toast: (m: string) => void
}) {
  const { channels, targets, lists, team } = agency
  const fileRef = useRef<HTMLInputElement>(null)
  const [book, setBook] = useState<{ name: string; rows: string[][] }[] | null>(null)
  const [tab, setTab] = useState<string>('')
  const [err, setErr] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [keepApp, setKeepApp] = useState(true)
  const [lumpType, setLumpType] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const today = officeToday()

  const startYear = Number(target.startsOn.slice(0, 4))
  const startMonth0 = Number(target.startsOn.slice(5, 7)) - 1
  const yearOf = (m0: number) => (m0 >= startMonth0 ? startYear : startYear + 1)

  const open = async (file: File | undefined) => {
    if (!file) return
    setReading(true); setErr(null)
    try {
      const b = await readWorkbook(file)
      setBook(b)
      // The tab named like the client, if there is one.
      const words = client.name.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
      const guess = b.find((s) => words.some((w) => s.name.toLowerCase().includes(w))) ?? b[0]
      setTab(guess?.name ?? '')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'That file could not be read.')
    }
    setReading(false)
  }

  const parsed: ParsedSheet | { error: string } | null = useMemo(() => {
    const sheet = book?.find((s) => s.name === tab)
    return sheet ? parseClientMaster(sheet.rows, yearOf) : null
    // yearOf only depends on the target's start, which the deps carry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, tab, target.startsOn])
  const sheet = parsed && !('error' in parsed) ? parsed : null

  const clientChannels = useMemo(() => channels.rows.filter((c) => pages.some((p) => p.id === c.pageId)), [channels.rows, pages])
  const plan: ImportPlan | null = useMemo(() => (sheet ? planImport(sheet, pages, clientChannels) : null), [sheet, pages, clientChannels])

  // Weeks that have not started yet cannot be saved (0037 refuses them).
  const numbers = useMemo(() => (plan ? plan.numbers.filter((n) => n.weekStart <= today) : []), [plan, today])
  const current = (pageId: string | null, platform: Platform, week: string) => {
    const ch = clientChannels.find((c) => c.pageId === pageId && c.platform === platform && c.isActive)
    return ch ? weekly.rows.find((w) => w.channelId === ch.id && w.weekStart === week) ?? null : null
  }
  const conflicts = useMemo(() => (plan ? numbers.filter((n) => {
    const p = plan.pages.find((x) => x.sheet.row === n.sheetRow)
    const w = p ? current(p.pageId, n.platform, n.weekStart) : null
    return !!w && w.views !== n.views
  }).length : 0
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [plan, numbers, weekly.rows, clientChannels])
  const weeks = new Set(numbers.map((n) => n.weekStart)).size
  const newPages = plan ? plan.pages.filter((p) => !p.pageId).length : 0
  const periodOf = (from: string) => targets.periods.find((p) => p.targetId === target.id && from >= p.startsOn && from <= p.endsOn) ?? null
  const types = lists.view_adjustment_types.filter((t) => t.isActive)
  const guessType = types.find((t) => /sheet|import|before|opening/i.test(t.name))?.id ?? ''

  /* The check — what each period's Achieved will read after this import,
     beside what the sheet's own Achieved row says. Pages the import would
     add are stood in by placeholders so their numbers count here too. */
  const check = useMemo(() => {
    if (!plan || !sheet?.target) return []
    const simPages = [...pages]
    const simChannels = [...clientChannels]
    const chanOf = new Map<string, string>()
    plan.pages.forEach((p, i) => {
      const pageId = p.pageId ?? `new-page-${i}`
      if (!p.pageId) {
        simPages.push({ id: pageId, clientId: client.id, pageType: 'fan', instagramHandle: '', label: p.label, isActive: true, createdAt: '', statusId: null })
      }
      for (const pl of Object.keys(p.channels) as Platform[]) {
        const c = p.channels[pl]!
        const id = c.channelId ?? `new-ch-${i}-${pl}`
        if (!c.channelId) simChannels.push({ id, pageId, platform: pl, handle: c.handle, url: c.url, isActive: true, createdAt: '' })
        chanOf.set(`${p.sheet.row}|${pl}`, id)
      }
    })
    const simWeekly: WeeklyView[] = [...weekly.rows]
    for (const n of numbers) {
      const channelId = chanOf.get(`${n.sheetRow}|${n.platform}`)
      if (!channelId) continue
      const i = simWeekly.findIndex((w) => w.channelId === channelId && w.weekStart === n.weekStart)
      if (i >= 0) { if (!keepApp) simWeekly[i] = { ...simWeekly[i]!, views: n.views } } else {
        simWeekly.push({ id: 'sim', channelId, weekStart: n.weekStart, views: n.views, followers: null, proofPath: null,
          enteredBy: null, enteredAt: '', updatedBy: null, updatedAt: null })
      }
    }
    const simAdj: ViewAdjustment[] = [...targets.adjustments]
    for (const u of plan.unplaced) {
      if (!lumpType[u.rangeKey] && !guessType) continue
      if (lumpType[u.rangeKey] === 'skip') continue
      simAdj.push({ id: 'sim-' + u.rangeKey, targetId: target.id, periodId: periodOf(u.from)?.id ?? null, weekStart: null, typeId: 'sim', views: u.views, note: '', createdAt: '' })
    }
    const prog = computeProgress({ target, periods: targets.periods, pages: simPages, channels: simChannels, weekly: simWeekly, adjustments: simAdj, today })
    return sheet.target.periods.map((sp) => {
      const mine = prog.periods.find((x) => (sp.from && x.period.startsOn === sp.from && x.period.endsOn === sp.to)
        || x.period.label.toLowerCase().replace(/\s+/g, '') === sp.label.toLowerCase().replace(/\s+/g, ''))
      return { label: sp.label, sheet: sp.achieved, app: mine ? mine.achieved : null, matched: !!mine }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, sheet, numbers, keepApp, lumpType, guessType, weekly.rows, targets.adjustments, targets.periods, clientChannels, pages])

  const teamNames = useMemo(() => new Set(team.rows.filter((t) => t.clientId === client.id && !t.endedAt).map((t) => t.fullName.split(' ')[0]!.toLowerCase())), [team.rows, client.id])

  const run = async () => {
    if (!plan) return
    setErr(null)
    // 1. pages and channels the sheet has and the app does not
    const chanOf = new Map<string, string>()
    let added = 0
    for (const p of plan.pages) {
      let pageId = p.pageId
      if (!pageId) {
        setBusy(`Adding ${p.label}…`)
        const r = await pagesHook.create({ clientId: client.id, pageType: 'fan', label: p.label })
        if (r.error || !r.id) { setErr(`${p.label}: ${r.error ?? 'could not be added'}`); setBusy(null); return }
        pageId = r.id
        added++
      }
      for (const pl of Object.keys(p.channels) as Platform[]) {
        const c = p.channels[pl]!
        let id = c.channelId
        if (!id) {
          const r = await channels.ensure(pageId, pl, c.handle, c.url)
          if (r.error || !r.id) { setErr(`${p.label} ${PLATFORM[pl].label}: ${r.error}`); setBusy(null); return }
          id = r.id
        }
        chanOf.set(`${p.sheet.row}|${pl}`, id)
      }
    }
    // 2. the weekly numbers, in one go
    setBusy(`Saving ${count(numbers.length, 'number')}…`)
    const items = numbers.flatMap((n) => {
      const channelId = chanOf.get(`${n.sheetRow}|${n.platform}`)
      if (!channelId) return []
      const existing = weekly.rows.find((w) => w.channelId === channelId && w.weekStart === n.weekStart)
      if (existing && (keepApp || existing.views === n.views)) return []
      return [{ channelId, weekStart: n.weekStart, views: n.views }]
    })
    const res = await weekly.bulkSave(items)
    // 3. the lumps that are not a week, as adjustments — only where a type was picked
    let lumps = 0
    for (const u of plan.unplaced) {
      const typeId = lumpType[u.rangeKey] ?? guessType
      if (!typeId || typeId === 'skip') continue
      const m = await targets.saveAdjustment(null, {
        targetId: target.id, periodId: periodOf(u.from)?.id ?? null, weekStart: null, typeId, views: u.views,
        note: `${u.label} — from the sheet`,
      })
      if (!m) lumps++
    }
    setBusy(null)
    if (res.error) setErr(`Some numbers were refused: ${res.error}`)
    toast(`Imported ${count(res.saved, 'number')}${added ? `, ${count(added, 'new page')}` : ''}${lumps ? `, ${count(lumps, 'adjustment')}` : ''}.`)
    onDone()
    if (!res.error) onClose()
  }

  return (
    <Modal
      wide
      title="Import from the sheet"
      sub={`${client.name} · into ${target.label}`}
      onClose={onClose}
      foot={
        <>
          {busy && <span style={{ marginRight: 'auto', color: 'var(--ink-3)', fontSize: 12 }}>{busy}</span>}
          <button className="btn btn--sm" onClick={onClose}>Cancel</button>
          <button className="btn btn--sm btn--primary" disabled={!plan || !!busy || (numbers.length === 0 && newPages === 0)} onClick={() => void run()}>
            {busy ? 'Importing…' : plan ? `Import ${count(numbers.length, 'number')}` : 'Import'}
          </button>
        </>
      }
    >
      {err && <div className="auth-err">{err}</div>}
      <div className="imp-pick">
        <button className="btn btn--sm" onClick={() => fileRef.current?.click()} disabled={reading}>
          {reading ? 'Reading…' : book ? 'Another file' : 'Choose the file'}
        </button>
        <input ref={fileRef} type="file" hidden accept=".xlsx,.xls,.csv" onChange={(e) => { void open(e.target.files?.[0]); e.target.value = '' }} />
        {book && book.length > 1 && (
          <select className="input" aria-label="Which tab" value={tab} onChange={(e) => setTab(e.target.value)}>
            {book.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
        )}
        {!book && <span className="field-hint">Google Sheets → File → Download → Microsoft Excel (.xlsx). The whole Client Master is one file; you pick the tab here.</span>}
      </div>

      {parsed && 'error' in parsed && <div className="auth-err">{parsed.error}</div>}

      {sheet && plan && (
        <>
          <p className="imp-sum">
            {count(plan.pages.length, 'page')} ({newPages ? `${newPages} new` : 'all already here'}) ·{' '}
            {count(numbers.length, 'number')} across {count(weeks, 'week')}
            {plan.numbers.length > numbers.length ? ` · ${plan.numbers.length - numbers.length} in weeks that have not started, left out` : ''}
          </p>

          {check.length > 0 && (
            <div className="grid-shell">
              <table className="grid imp-check">
                <thead><tr><th>Period</th><th>The sheet's Achieved</th><th>The app, after this</th><th /></tr></thead>
                <tbody>
                  {check.map((c) => {
                    const diff = c.sheet != null && c.app != null ? c.app - c.sheet : null
                    return (
                      <tr key={c.label}>
                        <td>{c.label}</td>
                        <td className="num">{c.sheet != null ? exact(c.sheet) : '—'}</td>
                        <td className="num">{c.app != null ? exact(c.app) : c.matched ? '—' : 'no matching period'}</td>
                        <td>{diff == null ? null : diff === 0
                          ? <Chip cls="chip--good">Matches</Chip>
                          : <Chip cls="chip--warn">{diff > 0 ? '+' : '−'}{exact(Math.abs(diff))}</Chip>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {plan.unplaced.map((u) => (
            <div className="imp-lump" key={u.rangeKey}>
              <span><strong>{u.label}</strong> is not a Monday–Sunday week: {exact(u.views)} views in total ({fmtDay(u.from)} – {fmtDay(u.to)}).</span>
              <select className="input" aria-label={`What to do with ${u.label}`} value={lumpType[u.rangeKey] ?? guessType}
                      onChange={(e) => setLumpType((p) => ({ ...p, [u.rangeKey]: e.target.value }))}>
                <option value="">Add it as… (pick a type)</option>
                <option value="skip">Leave it out</option>
                {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          ))}

          {conflicts > 0 && (
            <div className="imp-lump">
              <span>{count(conflicts, 'week')} already {conflicts === 1 ? 'has' : 'have'} a different number in the app.</span>
              <div className="seg seg--form">
                <button type="button" className={keepApp ? 'is-on' : ''} onClick={() => setKeepApp(true)}>Keep the app's</button>
                <button type="button" className={!keepApp ? 'is-on' : ''} onClick={() => setKeepApp(false)}>Use the sheet's</button>
              </div>
            </div>
          )}

          <div className="grid-shell">
            <div className="grid-scroll" style={{ maxHeight: 260 }}>
              <table className="grid">
                <thead><tr><th style={{ width: 44 }}>#</th><th>Sheet page</th><th>Goes to</th><th>Instagram</th><th>YouTube</th><th style={{ width: 90 }}>Numbers</th></tr></thead>
                <tbody>
                  {plan.pages.map((p) => (
                    <tr key={p.sheet.row}>
                      <td className="cell-idx">{p.sheet.num || '·'}</td>
                      <td>{p.label || <span className="cell-dash">(no name)</span>}</td>
                      <td>{p.pageId ? pages.find((x) => x.id === p.pageId)?.label || 'Existing page' : <Chip cls="chip--accent">New fan page</Chip>}</td>
                      <td>{p.channels.instagram?.handle ?? <span className="cell-dash">—</span>}</td>
                      <td>{p.channels.youtube?.handle ?? <span className="cell-dash">—</span>}</td>
                      <td className="num">{numbers.filter((n) => n.sheetRow === p.sheet.row).length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {sheet.team.some((t) => t.names.length) && (
            <p className="field-hint">
              The sheet's team — {sheet.team.filter((t) => t.names.length).map((t) => `${t.role}: ${t.names.map((n) => (teamNames.has(n.split(' ')[0]!.toLowerCase()) ? `${n} ✓` : n)).join(', ')}`).join(' · ')}.
              {' '}People are not added from here — a name is not enough to know who; add them on the Team tab (✓ = already on it).
            </p>
          )}
          {sheet.target && sheet.target.total != null && sheet.target.total !== target.totalViews && (
            <p className="field-hint" style={{ color: 'var(--warn)' }}>
              The sheet's total is {fmtCompact(sheet.target.total)}; this target is {fmtCompact(target.totalViews)}.
            </p>
          )}
          {sheet.warnings.length > 0 && (
            <details className="imp-warn">
              <summary>{count(sheet.warnings.length, 'cell')} left out</summary>
              {sheet.warnings.slice(0, 40).map((w) => <div key={w}>{w}</div>)}
            </details>
          )}
        </>
      )}
    </Modal>
  )
}
