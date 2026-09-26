import { readFileSync } from 'node:fs'
import { computeProgress } from '../../../src/react/lib/targets.ts'
const f = JSON.parse(readFileSync(new URL('./.progress_fixture.json', import.meta.url)))
const target = (t) => ({ id: t.id, clientId: t.client_id, label: t.label, totalViews: Number(t.total_views), startsOn: t.starts_on, endsOn: t.ends_on, countMain: t.count_main, countFan: t.count_fan, platforms: t.platforms, weekCountsIn: t.week_counts_in, isActive: t.is_active, notes: '' })
const periods = (f.periods ?? []).map((p) => ({ id: p.id, targetId: p.target_id, label: p.label, startsOn: p.starts_on, endsOn: p.ends_on, sharePct: p.share_pct == null ? null : Number(p.share_pct), targetViews: p.target_views == null ? null : Number(p.target_views), sortOrder: p.sort_order }))
const pages = f.pages.map((p) => ({ id: p.id, clientId: p.client_id, pageType: p.page_type }))
const channels = f.channels.map((c) => ({ id: c.id, pageId: c.page_id, platform: c.platform, handle: c.handle, url: c.url ?? '', isActive: c.is_active, createdAt: c.created_at }))
const weekly = (f.weekly ?? []).map((w) => ({ id: w.id, channelId: w.channel_id, weekStart: w.week_start, views: Number(w.views), followers: null, proofPath: null, enteredBy: null, enteredAt: '', updatedBy: null, updatedAt: null }))
const adjustments = (f.adjustments ?? []).map((a) => ({ id: a.id, targetId: a.target_id, periodId: a.period_id, weekStart: a.week_start, typeId: a.type_id, views: Number(a.views), note: a.note ?? '', createdAt: a.created_at }))
let checked = 0, bad = 0
const eq = (label, sqlv, tsv) => { checked++; const a = sqlv == null ? null : Number(sqlv); const b = tsv == null ? null : Number(tsv); const ok = (a == null && b == null) || (a != null && b != null && Math.abs(a - b) < 1e-6); if (!ok) { bad++; console.log('MISMATCH', label, 'sql=', sqlv, 'ts=', tsv) } }
for (const t of f.targets) {
  const tp = computeProgress({ target: target(t), periods, pages, channels, weekly, adjustments, today: f.today })
  const rows = f.sql.filter((r) => r.target_id === t.id)
  const tr = rows.find((r) => r.grain === 'target')
  for (const k of [['goal','goal'],['views_fan','fan'],['views_main','main'],['views_instagram','instagram'],['views_youtube','youtube'],['adjustments','adjustments'],['achieved','achieved'],['left_views','left'],['elapsed_share','elapsedShare'],['achieved_share','achievedShare']]) eq(`${t.label} target ${k[0]}`, tr[k[0]], tp.target[k[1]])
  for (const pp of tp.periods) {
    const pr = rows.find((r) => r.grain === 'period' && r.period_id === pp.period.id)
    for (const k of [['goal','goal'],['views_fan','fan'],['views_main','main'],['adjustments','adjustments'],['achieved','achieved'],['left_views','left'],['elapsed_share','elapsedShare'],['achieved_share','achievedShare']]) eq(`${t.label} ${pp.period.label} ${k[0]}`, pr[k[0]], pp[k[1]])
    const sqlWeeks = rows.filter((r) => r.grain === 'week' && r.period_id === pp.period.id).sort((a, b) => a.week_start.localeCompare(b.week_start))
    eq(`${t.label} ${pp.period.label} week count`, sqlWeeks.length, pp.weeks.length)
    sqlWeeks.forEach((sw, i) => { const tw = pp.weeks[i]; if (!tw || tw.weekStart !== sw.week_start) { bad++; console.log('WEEK MISMATCH', sw.week_start, tw?.weekStart); return }
      for (const k of [['views_fan','fan'],['views_main','main'],['adjustments','adjustments'],['achieved','achieved'],['running_left','runningLeft']]) eq(`${t.label} ${sw.week_start} ${k[0]}`, sw[k[0]], tw[k[1]]) })
  }
}
console.log(`${checked} numbers compared, ${bad} mismatches`)
