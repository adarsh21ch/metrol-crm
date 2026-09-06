import { useEffect, useMemo, useState } from 'react'
import { DataGrid, type GridCol } from '@/components/DataGrid'
import { LeadsBoard } from '@/components/LeadsBoard'
import { Menu, type MenuItem } from '@/components/Menu'
import { ThemeToggle } from '@/components/ThemeToggle'
import { DensitySlider } from '@/components/DensitySlider'
import { Avatar, Chip, EditChip, IconBtn, Kpi } from '@/components/bits'
import { SaleModal } from '@/modals/SaleModal'
import { HistoryModal } from '@/modals/HistoryModal'
import { ProfileModal } from '@/modals/ProfileModal'
import { LeaveRequestModal } from '@/modals/LeaveRequestModal'
import { agoDays, count, daysSince, money, pct, plural } from '@/lib/format'
import { QUALITY, STATUS, isConnected, isConverted, type Lead, type LeadStatus, type Quality } from '@/lib/types'
import { supabase } from '@/lib/supabase'
import { useEmployees } from '@/data/useEmployees'
import { useLeaveRequests } from '@/data/useLeaveRequests'
import { useSalaryRecords } from '@/data/useSalaryRecords'
import { useOnboardingTasks } from '@/data/useOnboardingTasks'
import { useEmployeeDocuments } from '@/data/useEmployeeDocuments'
import { useExitTasks } from '@/data/useExitTasks'
import { DOC_TYPE, EMP_STATUS, LEAVE_STATUS, SALARY_STATUS, fmtDate, fmtPeriod, usedLeaveDays } from '@/lib/hr'
import type { Workspace } from '@/data/useWorkspace'

type LeadsView = 'list' | 'board'
const LEADS_VIEW_KEY = 'metrol-crm-leadsview'

/**
 * Three sections rather than one long scroll — the same call Round 4 made for
 * the owner's project screen, arriving late here. A salesperson works leads;
 * a sale they already closed and the owner already verified is a record, not
 * a thing to scroll past on the way to the next call. It is one tap away when
 * they do want it.
 */
type MemberSec = 'overview' | 'leads' | 'sales' | 'team' | 'leave' | 'salary' | 'onboarding' | 'exit'
const HEAD: Record<MemberSec, { title: string; sub: string }> = {
  overview: { title: 'Overview', sub: 'Where your leads stand right now' },
  leads: { title: 'My leads', sub: 'Assigned to you by the owner' },
  sales: { title: 'My sales', sub: '' },
  team: { title: 'Manage team', sub: 'The people in your department, and how they are doing' },
  leave: { title: 'Leave', sub: 'Request time off and see your balance' },
  salary: { title: 'Salary', sub: 'Your payslip history' },
  onboarding: { title: 'Onboarding', sub: 'Your offer, checklist and documents on file' },
  exit: { title: 'Exit', sub: 'What still needs handing back before your last day' },
}

/** One label / value pair — same small component HrPage uses for an
 *  employee's own fields, kept local here rather than shared for one screen
 *  each so far. */
const Fld = ({ l, v }: { l: string; v: React.ReactNode }) => (
  <div className="hr-fld"><div className="l">{l}</div><div className="v">{v || '—'}</div></div>
)

/** One row of the Manage team tab. */
interface TeamRow {
  id: string
  name: string
  designation: string
  phone: string
  joined: string
  leads: number
  connected: number
  converted: number
  sale: number
  isMe: boolean
}

/** The salesperson's whole app: the leads the owner handed them, and what they
 *  closed. They set status and quality; they never see anybody else's rows —
 *  and the row level security means that is true of the data, not just the UI. */
export function Member({ ws, toast }: { ws: Workspace; toast: (m: string) => void }) {
  const me = ws.me
  const lastVisitKey = 'metrol-crm-lastvisit-' + (me?.id ?? 'anon')
  // Read the *previous* visit before this one overwrites it, so "N leads
  // assigned to you" can compare against a moment before right now. A member
  // opening the app for the very first time has no previous visit to compare
  // to — every one of their leads would count as "since last visit", which is
  // just their whole backlog restated, not news — so that case pins the
  // reference to now and quietly skips the notice.
  const [lastVisit] = useState<number>(() => {
    try {
      const stored = localStorage.getItem(lastVisitKey)
      return stored ? Number(stored) : Date.now()
    } catch { return Date.now() }
  })
  useEffect(() => {
    try { localStorage.setItem(lastVisitKey, String(Date.now())) } catch { /* best-effort */ }
    // Only ever runs once per mount — recording *this* visit, not tracking lastVisitKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [sec, setSec] = useState<MemberSec>('overview')
  const [edit, setEdit] = useState<{ kind: 'status' | 'quality'; anchor: HTMLElement; lead: Lead } | null>(null)
  const [saleFor, setSaleFor] = useState<Lead | null>(null)
  const [historyFor, setHistoryFor] = useState<Lead | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  // Board (the card view) is the default open — it's the one built for a
  // phone-in-hand, work-the-queue flow. Whichever view someone actually picks
  // is remembered per-browser via pickView below, so a salesperson who prefers
  // calling down the list keeps seeing List on their next visit; someone who
  // never touches the toggle keeps seeing Board.
  const [leadsView, setLeadsView] = useState<LeadsView>(() => {
    try { return localStorage.getItem(LEADS_VIEW_KEY) === 'list' ? 'list' : 'board' } catch { return 'board' }
  })
  const pickView = (v: LeadsView) => {
    setLeadsView(v)
    try { localStorage.setItem(LEADS_VIEW_KEY, v) } catch { /* a remembered view is a convenience */ }
  }

  // A team lead gets ONE extra tab, and nothing else about their app changes:
  // same Overview, same My leads, same My sales. Not a second dashboard, and
  // not the owner's view scoped down — they cannot reassign a lead or verify a
  // payment here, and the policies in 0008 do not let them either.
  const isLead = !!me?.isTeamLead
  // Everybody asks this now, not just a team lead — Leave needs a person's own
  // employee record for their entitlement, and RLS (0006) hands back exactly
  // one row (their own) to anybody who is not HR, the owner, or a team lead.
  const staff = useEmployees(true)
  const myEmployee = staff.rows.find((e) => e.profileId === me?.id) ?? null
  const leave = useLeaveRequests(true)
  const myLeave = useMemo(
    () => (myEmployee ? leave.rows.filter((r) => r.employeeId === myEmployee.id) : []),
    [leave.rows, myEmployee],
  )
  const [requestingLeave, setRequestingLeave] = useState(false)
  // No create/update calls live on this screen at all — RLS (0010) refuses
  // every write to salary_records for anybody but the owner or HR, so this is
  // read-only by construction, not just by omission.
  const salaryRecords = useSalaryRecords(true)
  const mySalary = useMemo(
    () => (myEmployee ? salaryRecords.rows.filter((r) => r.employeeId === myEmployee.id) : []),
    [salaryRecords.rows, myEmployee],
  )
  // Read-only here too — RLS (0011) refuses every write to onboarding_tasks
  // and employee_documents for anybody but the owner or HR.
  const onboardingTasks = useOnboardingTasks(true)
  const myTasks = useMemo(
    () => (myEmployee ? onboardingTasks.rows.filter((t) => t.employeeId === myEmployee.id).sort((a, b) => a.sortOrder - b.sortOrder) : []),
    [onboardingTasks.rows, myEmployee],
  )
  const myDocs = useEmployeeDocuments(true)
  const myOwnDocs = useMemo(
    () => (myEmployee ? myDocs.rows.filter((d) => d.employeeId === myEmployee.id) : []),
    [myDocs.rows, myEmployee],
  )
  // Only relevant once somebody is actually leaving — showing this tab to
  // every active employee would read as a strange, unprompted question.
  const isLeaving = !!myEmployee && myEmployee.status !== 'active'
  const myExitTasks = useExitTasks(isLeaving)
  const myOwnExitTasks = useMemo(
    () => (myEmployee ? myExitTasks.rows.filter((t) => t.employeeId === myEmployee.id).sort((a, b) => a.sortOrder - b.sortOrder) : []),
    [myExitTasks.rows, myEmployee],
  )
  const shownSec: MemberSec = (sec === 'team' && !isLead) || (sec === 'exit' && !isLeaving) ? 'overview' : sec

  const teamRows = useMemo<TeamRow[]>(() => {
    if (!isLead || !me?.departmentId) return []
    const mates = ws.members.filter((m) => m.departmentId === me.departmentId)
    return mates.map((m) => {
      const theirs = ws.leads.filter((l) => l.ownerId === m.id)
      const won = theirs.filter(isConverted)
      const record = staff.rows.find((e) => e.profileId === m.id)
      return {
        id: m.id,
        name: m.name,
        designation: record?.designation ?? '',
        phone: record?.phone ?? m.phone ?? '',
        joined: record?.dateOfJoining ?? '',
        leads: theirs.length,
        connected: theirs.filter(isConnected).length,
        converted: won.length,
        sale: won.reduce((t, l) => t + l.amount, 0),
        isMe: m.id === me.id,
      }
    }).sort((a, b) => b.sale - a.sale || b.leads - a.leads || a.name.localeCompare(b.name))
  }, [isLead, me, ws.members, ws.leads, staff.rows])

  // Sales is the only department anybody has said what to measure for. A lead
  // in a department with no leads to their name gets the roster instead of a
  // table of zeros — and no invented metric until Adarsh says what they track.
  const teamHasLeads = teamRows.some((r) => r.leads > 0)

  const teamCols = useMemo<GridCol<TeamRow>[]>(() => {
    const person: GridCol<TeamRow> = {
      key: 'name', label: 'Member', width: 190,
      render: (r) => (
        <div className="td-flex">
          <Avatar>{r.name.slice(0, 2).toUpperCase()}</Avatar>
          <span className={r.isMe ? 'cell-strong' : ''}>{r.name}{r.isMe ? ' (you)' : ''}</span>
        </div>
      ),
    }
    const desig: GridCol<TeamRow> = {
      key: 'desig', label: 'Designation', width: 170,
      render: (r) => r.designation || <span className="cell-dash">—</span>,
    }
    if (!teamHasLeads) {
      return [person, desig,
        { key: 'phone', label: 'Phone', width: 160, render: (r) => r.phone || <span className="cell-dash">—</span> },
        { key: 'joined', label: 'Joined', width: 130, render: (r) => fmtDate(r.joined) },
      ]
    }
    return [person, desig,
      { key: 'leads', label: 'Leads', width: 92, render: (r) => r.leads },
      { key: 'conn', label: 'Connected', width: 110, render: (r) => r.connected },
      { key: 'conv', label: 'Converted', width: 110, render: (r) => r.converted },
      { key: 'sale', label: 'Sales', width: 140, render: (r) => <span className="cell-money">{money(r.sale)}</span> },
    ]
  }, [teamHasLeads])

  const mine = useMemo(() => ws.leads.filter((l) => l.ownerId === me?.id), [ws.leads, me])
  const cv = useMemo(() => mine.filter(isConverted), [mine])
  // "Landed since I last opened this" — durable across a reload, unlike isNew,
  // because it compares the database's own assignedAt to a timestamp saved
  // last visit rather than a flag that only ever lived in this tab.
  const justAssigned = useMemo(
    () => mine.filter((l) => l.assignedAt && new Date(l.assignedAt).getTime() > lastVisit),
    [mine, lastVisit],
  )
  const projectName = (id: string) => ws.projects.find((p) => p.id === id)?.name ?? '—'
  const sum = (rs: Lead[]) => rs.reduce((s, l) => s + l.amount, 0)

  /** The board's drag-and-drop is a shortcut for the exact same write the list's
   *  status dropdown makes below — a lead converting still needs a sale amount,
   *  so dropping on Converted with none set opens the same modal the dropdown does. */
  async function dropStatus(l: Lead, status: LeadStatus) {
    if (status === 'converted' && !l.amount) { setSaleFor(l); return }
    await ws.setStatus(l, status, me?.name ?? 'Salesperson')
    toast(`${l.name} — status set to ${STATUS[status].label}`)
  }

  const leadCols: GridCol<Lead>[] = [
    { key: 'idx', label: '#', width: 52, render: (_l, i) => <span className="cell-idx">{i + 1}</span> },
    {
      key: 'name', label: 'Name', width: 180,
      render: (l) => (
        <span className="td-flex">
          {l.isNew && <span className="new-dot" title="New lead" />}
          <button className="name-btn" onClick={() => setHistoryFor(l)}>{l.name}</button>
        </span>
      ),
    },
    { key: 'ph', label: 'Phone', width: 152, render: (l) => <span className="cell-mono">{l.phone || '—'}</span> },
    { key: 'pr', label: 'Project', width: 158, render: (l) => <span className="cell-mute">{projectName(l.projectId)}</span> },
    {
      key: 'st', label: 'Status', width: 134,
      render: (l) => <EditChip cls={STATUS[l.status].cls} label={STATUS[l.status].label}
                       onClick={(e) => setEdit({ kind: 'status', anchor: e.currentTarget, lead: l })} />,
    },
    {
      key: 'ql', label: 'Quality', width: 126,
      render: (l) => <EditChip cls={l.quality ? QUALITY[l.quality].cls : 'chip--none'}
                       label={l.quality ? QUALITY[l.quality].label : 'Not set'}
                       onClick={(e) => setEdit({ kind: 'quality', anchor: e.currentTarget, lead: l })} />,
    },
    {
      key: 'am', label: 'Sale', width: 120,
      render: (l) => l.amount ? <span className="cell-money">{money(l.amount)}</span> : <span className="cell-mute">—</span>,
    },
  ]

  const salesCols: GridCol<Lead>[] = [
    { key: 'idx', label: '#', width: 52, render: (_l, i) => <span className="cell-idx">{i + 1}</span> },
    { key: 'cust', label: 'Customer', width: 190, render: (l) => <span className="cell-strong">{l.name}</span> },
    { key: 'pr', label: 'Project', width: 170, render: (l) => <span className="cell-mute">{projectName(l.projectId)}</span> },
    { key: 'amt', label: 'Amount', width: 130, render: (l) => <span className="cell-money">{money(l.amount)}</span> },
    // The salesperson reads the payment state; only the owner sets it.
    { key: 'ver', label: 'Payment', width: 130, render: (l) => <Chip cls={l.verified ? 'chip--good' : 'chip--warn'}>{l.verified ? 'Verified' : 'Pending'}</Chip> },
    { key: 'when', label: 'Closed', width: 130, render: (l) => <span className="cell-mute">{agoDays(daysSince(l.convertedAt ?? l.createdAt))}</span> },
  ]

  const items: MenuItem[] = edit?.kind === 'status'
    ? (Object.keys(STATUS) as LeadStatus[]).map((k) => ({ value: k, label: STATUS[k].label, cls: STATUS[k].cls }))
    : edit?.kind === 'quality'
      ? (Object.keys(QUALITY) as Quality[]).map((k) => ({ value: k, label: QUALITY[k].label, cls: QUALITY[k].cls }))
      : []

  async function pick(v: string) {
    if (!edit) return
    const l = edit.lead
    if (edit.kind === 'status') {
      await dropStatus(l, v as LeadStatus)
    } else {
      await ws.setQuality(l, v as Quality, me?.name ?? 'Salesperson')
      toast(`${l.name} — marked ${QUALITY[v as Quality].label}`)
    }
  }

  const projects = new Set(mine.map((l) => l.projectId)).size

  // A salesperson's own work queue: called and rated is the whole job, so
  // these are the three ways a lead can still be waiting on them.
  const todo = [
    {
      n: mine.filter((l) => l.status === 'new').length, cta: 'Call them',
      label: (n: number) => `${plural(n, 'lead')} you have not called yet`,
    },
    {
      n: mine.filter((l) => l.status === 'follow_up').length, cta: 'Open leads',
      label: (n: number) => `${plural(n, 'follow-up')} to make`,
    },
    {
      n: mine.filter((l) => l.status !== 'new' && !l.quality).length, cta: 'Rate them',
      label: (n: number) => `${plural(n, 'lead')} called but not rated yet`,
    },
  ]

  return (
    <div className="screen screen--app is-active">
      <div className="topbar">
        <div className="brand">
          <div className="monogram">M</div>
          <div className="brand-name">Metrol Media</div>
        </div>
        <div className="topbar-right">
          <ThemeToggle />
          <DensitySlider />
          <button className="user-chip" title="My profile" onClick={() => setProfileOpen(true)}>
            <Avatar lg src={me?.avatarUrl}>{me?.initials}</Avatar>
            <div>
              <div className="name">{me?.name}</div>
              {/* Their actual department, not a word hardcoded when Sales was
                  the only one that existed. */}
              <div className="role">{ws.departmentName(me?.departmentId ?? null) ?? 'Sales'}</div>
            </div>
          </button>
          <IconBtn title="Sign out" onClick={() => void supabase.auth.signOut()}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </IconBtn>
        </div>
      </div>

      <div className="shell">
        <div className="workspace">
          <div className="wrap">
            <div className="page-head">
              <h1>{HEAD[sec].title}</h1>
              <div className="sub">
                {sec === 'sales' ? `${count(cv.length, 'deal')} closed · ${money(sum(cv))} total`
                  : sec === 'leads' ? `${count(mine.length, 'lead')} across ${count(projects, 'project')}`
                    : HEAD[sec].sub}
              </div>
              <div className="section-tools">
                {sec === 'leads' && (
                  <div className="seg">
                    <button className={leadsView === 'board' ? 'is-on' : ''} onClick={() => pickView('board')}>Board</button>
                    <button className={leadsView === 'list' ? 'is-on' : ''} onClick={() => pickView('list')}>List</button>
                  </div>
                )}
                {/* Live sync should mean nobody needs this — it exists for
                    anyone who would rather press something than trust it, so
                    it stays on every tab rather than living on one of them. */}
                <button className="btn btn--ghost btn--sm refresh-btn" disabled={ws.refreshing}
                        onClick={() => void ws.refresh()}>
                  <svg className={ws.refreshing ? 'spin' : ''} width="14" height="14" viewBox="0 0 24 24"
                       fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v6h-6" />
                  </svg>
                  {ws.refreshing ? 'Refreshing…' : 'Refresh'}
                </button>
              </div>
            </div>

            <div className="tabs">
              <button className={sec === 'overview' ? 'is-on' : ''} onClick={() => setSec('overview')}>Overview</button>
              <button className={sec === 'leads' ? 'is-on' : ''} onClick={() => setSec('leads')}>
                My leads <span className="count">{mine.length}</span>
              </button>
              <button className={sec === 'sales' ? 'is-on' : ''} onClick={() => setSec('sales')}>
                My sales <span className="count">{cv.length}</span>
              </button>
              {isLead && (
                <button className={sec === 'team' ? 'is-on' : ''} onClick={() => setSec('team')}>
                  Manage team <span className="count">{teamRows.length}</span>
                </button>
              )}
              <button className={sec === 'leave' ? 'is-on' : ''} onClick={() => setSec('leave')}>
                Leave {myLeave.some((r) => r.status === 'pending') && <span className="count">{myLeave.filter((r) => r.status === 'pending').length}</span>}
              </button>
              <button className={sec === 'salary' ? 'is-on' : ''} onClick={() => setSec('salary')}>Salary</button>
              <button className={sec === 'onboarding' ? 'is-on' : ''} onClick={() => setSec('onboarding')}>Onboarding</button>
              {isLeaving && (
                <button className={sec === 'exit' ? 'is-on' : ''} onClick={() => setSec('exit')}>Exit</button>
              )}
            </div>

            {shownSec === 'exit' && myEmployee && (
              <>
                <div className="hr-fields" style={{ marginBottom: 14 }}>
                  <Fld l="Status" v={EMP_STATUS[myEmployee.status].label} />
                  <Fld l="Resignation date" v={fmtDate(myEmployee.resignationDate)} />
                  <Fld l="Notice period" v={myEmployee.noticePeriodDays != null ? `${myEmployee.noticePeriodDays} days` : null} />
                  <Fld l="Last working day" v={fmtDate(myEmployee.lastWorkingDay)} />
                </div>
                <div className="section">
                  <div className="section-head"><h3>Checklist</h3></div>
                  <div className="hr-soon">
                    {myOwnExitTasks.map((t) => (
                      <Chip key={t.id} cls={t.done ? 'chip--good' : 'chip--mute'}>{t.done ? '✓ ' : ''}{t.label}</Chip>
                    ))}
                  </div>
                </div>
              </>
            )}

            {shownSec === 'onboarding' && (
              <>
                {!myEmployee ? (
                  <div className="ov-card">
                    <div className="ov-head"><h4>No employee record yet</h4></div>
                    <p style={{ padding: '0 16px 16px', color: 'var(--ink-3)' }}>HR has not added you to the directory yet.</p>
                  </div>
                ) : (
                  <>
                    <div className="section">
                      <div className="section-head"><h3>Checklist</h3></div>
                      <div className="hr-soon">
                        {myTasks.map((t) => (
                          <Chip key={t.id} cls={t.done ? 'chip--good' : 'chip--mute'}>{t.done ? '✓ ' : ''}{t.label}</Chip>
                        ))}
                      </div>
                    </div>
                    <div className="section">
                      <div className="section-head"><h3>Documents on file</h3></div>
                      {myOwnDocs.length === 0 ? (
                        <p style={{ color: 'var(--ink-3)' }}>Nothing on file yet.</p>
                      ) : (
                        <div className="ov-actions">
                          {myOwnDocs.map((d) => (
                            <div className="ov-row" key={d.id} style={{ cursor: 'default' }}>
                              <span className="ov-n">{DOC_TYPE[d.docType].slice(0, 2).toUpperCase()}</span>
                              <span className="ov-l">{d.fileName} · {DOC_TYPE[d.docType]}</span>
                              <span className="ov-cta">{fmtDate(d.uploadedAt.slice(0, 10))}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            )}

            {shownSec === 'salary' && (
              <>
                {!myEmployee || mySalary.length === 0 ? (
                  <div className="ov-card">
                    <div className="ov-head"><h4>No payslips yet</h4></div>
                    <p style={{ padding: '0 16px 16px', color: 'var(--ink-3)' }}>
                      {myEmployee ? 'HR has not added a payslip for you yet.' : 'HR has not added you to the directory yet.'}
                    </p>
                  </div>
                ) : (
                  <div className="section">
                    <div className="ov-actions">
                      {[...mySalary].sort((a, b) => b.period.localeCompare(a.period)).map((r) => (
                        <div className="ov-row" key={r.id} style={{ cursor: 'default' }}>
                          <span className="ov-n">{fmtPeriod(r.period)}</span>
                          <span className="ov-l">Net {money(r.netAmount)} · Gross {money(r.grossAmount)}</span>
                          <Chip cls={SALARY_STATUS[r.status].cls}>{SALARY_STATUS[r.status].label}</Chip>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {shownSec === 'leave' && (
              <>
                {!myEmployee ? (
                  <div className="ov-card">
                    <div className="ov-head"><h4>No employee record yet</h4></div>
                    <p style={{ padding: '0 16px 16px', color: 'var(--ink-3)' }}>
                      HR has not added you to the directory yet, so there is nothing to request leave against.
                      Ask HR to add your record.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="kpis">
                      <Kpi accent label="Remaining" value={Math.max(0, myEmployee.annualLeaveDays - usedLeaveDays(leave.rows, myEmployee.id))} sub="days left this year" />
                      <Kpi label="Entitlement" value={myEmployee.annualLeaveDays} sub="days this year" />
                      <Kpi label="Used" value={usedLeaveDays(leave.rows, myEmployee.id)} sub="approved this year" />
                      <Kpi label="Pending" value={myLeave.filter((r) => r.status === 'pending').length} sub="awaiting a decision" />
                    </div>

                    {leave.error && <div className="auth-err" style={{ marginBottom: 14 }}>{leave.error}</div>}

                    <div className="section">
                      <div className="section-head">
                        <h3>My requests</h3>
                        <div className="section-tools">
                          <button className="btn btn--sm btn--primary" onClick={() => setRequestingLeave(true)}>Request leave</button>
                        </div>
                      </div>
                      {myLeave.length === 0 ? (
                        <p style={{ color: 'var(--ink-3)' }}>No requests yet.</p>
                      ) : (
                        <div className="ov-actions">
                          {[...myLeave].sort((a, b) => b.startDate.localeCompare(a.startDate)).map((r) => (
                            <div className="ov-row" key={r.id} style={{ cursor: 'default' }}>
                              <span className="ov-n">{r.daysCount}d</span>
                              <span className="ov-l">
                                {fmtDate(r.startDate)} – {fmtDate(r.endDate)}{r.reason ? ' · ' + r.reason : ''}
                                {r.decisionNote ? <span style={{ color: 'var(--ink-3)' }}> — {r.decisionNote}</span> : null}
                              </span>
                              <Chip cls={LEAVE_STATUS[r.status].cls}>{LEAVE_STATUS[r.status].label}</Chip>
                              {r.status === 'pending' && (
                                <button className="btn btn--sm" style={{ marginLeft: 10 }}
                                        onClick={() => void leave.cancel(r.id).then((m) => toast(m ?? 'Request cancelled.'))}>
                                  Cancel
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            )}

            {shownSec === 'team' && (
              <>
                <div className="kpis">
                  <Kpi accent label="Team size" value={teamRows.length}
                       sub={ws.departmentName(me?.departmentId ?? null) ?? 'Your department'} />
                  {teamHasLeads ? (
                    <>
                      <Kpi label="Team leads" value={teamRows.reduce((t, r) => t + r.leads, 0)} sub="assigned across the team" />
                      <Kpi label="Converted" value={teamRows.reduce((t, r) => t + r.converted, 0)} sub="closed by the team" />
                      <Kpi label="Team sales" value={money(teamRows.reduce((t, r) => t + r.sale, 0))} sub="gross, including unverified" />
                    </>
                  ) : (
                    <Kpi label="On record" value={teamRows.filter((r) => r.designation).length}
                         sub="have an employee record" />
                  )}
                </div>

                {!teamHasLeads && (
                  <div className="banner">
                    <div>
                      <div className="t">No numbers for this department yet</div>
                      <div className="d">
                        Nobody has said what this team measures day to day, so this is the roster rather than
                        an invented scoreboard. Tell the owner what you need to see here and it gets built.
                      </div>
                    </div>
                  </div>
                )}

                <DataGrid cols={teamCols} rows={teamRows} storageKey="member-team"
                          empty="Nobody else is in your department yet."
                          foot={<div className="grid-foot"><span>{count(teamRows.length, 'person', 'people')}</span></div>} />
              </>
            )}

            {sec === 'overview' && (
              <>
                {justAssigned.length > 0 && !dismissed && (
                  <div className="banner">
                    <div>
                      <div className="t">{count(justAssigned.length, 'lead')} assigned to you</div>
                      <div className="d">Call them and set a status so the owner can see where they stand.</div>
                    </div>
                    <button className="btn btn--sm" onClick={() => setDismissed(true)}>Got it</button>
                  </div>
                )}

                <div className="kpis">
                  <Kpi accent label="My leads" value={mine.length} sub={`${mine.filter((l) => l.status === 'new').length} not called yet`} />
                  <Kpi label="Connected" value={mine.filter(isConnected).length} sub={`${pct(mine.filter(isConnected).length, mine.length)} of my leads`} />
                  <Kpi label="Follow-ups" value={mine.filter((l) => l.status === 'follow_up').length} sub="need a next call" />
                  <Kpi label="Converted" value={cv.length} sub={`${pct(cv.length, mine.length)} conversion`} />
                  <Kpi label="My sales" value={money(sum(cv))} sub={`${cv.filter((l) => !l.verified).length} awaiting verification`} />
                </div>

                {/* The same shape as the owner's Overview, asking the question a
                    salesperson actually has: what do I do next? Every row is a
                    button into My leads, where the work happens. */}
                <div className="ov-card">
                  <div className="ov-head"><h4>What needs you</h4></div>
                  <div className="ov-actions">
                    {todo.map((x) => (
                      <button className="ov-row" key={x.cta} onClick={() => setSec('leads')}>
                        <span className={'ov-n' + (x.n ? '' : ' is-zero')}>{x.n}</span>
                        <span className="ov-l">{x.label(x.n)}</span>
                        <span className="ov-cta">{x.cta} →</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {sec === 'leads' && (
              <div className="section">
                {leadsView === 'list' ? (
                  <DataGrid cols={leadCols} rows={mine} storageKey="member-leads"
                            empty="Nothing assigned to you yet. The owner will hand you leads from here."
                            foot={<div className="grid-foot"><span>{count(mine.length, 'lead')}</span>
                              <span className="grid-hint">Drag a column edge to resize · <kbd>double-click</kbd> to reset</span></div>} />
                ) : (
                  <LeadsBoard leads={mine} projectName={projectName} onOpenHistory={setHistoryFor} onDropStatus={(l, s) => void dropStatus(l, s)}
                              onEditQuality={(e, l) => setEdit({ kind: 'quality', anchor: e.currentTarget, lead: l })} />
                )}
              </div>
            )}

            {sec === 'sales' && (
              <div className="section">
                <DataGrid cols={salesCols} rows={[...cv].sort((a, b) => daysSince(a.convertedAt ?? a.createdAt) - daysSince(b.convertedAt ?? b.createdAt))}
                          storageKey="member-sales"
                          empty="No sales yet. Mark a lead Converted and record the amount, and it lands here."
                          foot={<div className="grid-foot"><span>{cv.filter((l) => l.verified).length} verified · {cv.filter((l) => !l.verified).length} pending</span></div>} />
              </div>
            )}
          </div>
        </div>
      </div>

      {edit && <Menu anchor={edit.anchor} items={items}
                     current={edit.kind === 'status' ? edit.lead.status : edit.lead.quality}
                     onPick={(v) => void pick(v)} onClose={() => setEdit(null)} />}

      {saleFor && (
        <SaleModal lead={saleFor} onClose={() => setSaleFor(null)}
          onSave={async (amount) => {
            await ws.recordSale(saleFor, amount, me?.name ?? 'Salesperson')
            toast(`${saleFor.name} — sale recorded`)
            setSaleFor(null)
          }} />
      )}

      {historyFor && (
        <HistoryModal lead={ws.leads.find((l) => l.id === historyFor.id) ?? historyFor}
          events={ws.events} members={ws.members}
          projectName={projectName(historyFor.projectId)}
          onClose={() => setHistoryFor(null)} />
      )}

      {profileOpen && <ProfileModal ws={ws} onClose={() => setProfileOpen(false)} />}

      {requestingLeave && myEmployee && (
        <LeaveRequestModal
          employeeId={myEmployee.id}
          onClose={() => setRequestingLeave(false)}
          onSave={async (draft) => {
            const message = await leave.create(draft)
            if (!message) toast('Leave request sent.')
            return message
          }}
        />
      )}
    </div>
  )
}
