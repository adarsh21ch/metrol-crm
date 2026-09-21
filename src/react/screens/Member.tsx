import { useCallback, useEffect, useMemo, useState } from 'react'
import { isDemo } from '@/data/demo'
import { supabase } from '@/lib/supabase'
import { DataGrid, usePhoneView, type GridCol } from '@/components/DataGrid'
import { LeadsBoard } from '@/components/LeadsBoard'
import { Menu, type MenuItem } from '@/components/Menu'
import { BottomNav, NAV_ICONS, type BottomNavItems } from '@/components/BottomNav'
import { AccountControls } from '@/components/AccountControls'
import { ProfileSection } from '@/components/ProfileSection'
import { DensitySlider } from '@/components/DensitySlider'
import { Tip } from '@/components/Tip'
import { Modal } from '@/components/Modal'
import { Avatar, Chip, EditChip, Kpi } from '@/components/bits'
import { SaleModal } from '@/modals/SaleModal'
import { HistoryModal } from '@/modals/HistoryModal'
import { LeaveRequestModal } from '@/modals/LeaveRequestModal'
import { VisitEntryRequestModal } from '@/modals/VisitEntryRequestModal'
import { WfhRequestModal } from '@/modals/WfhRequestModal'
import { agoDays, count, daysSince, money, pct, plural } from '@/lib/format'
import { QUALITY, STATUS, isConnected, isConverted, type Lead, type LeadStatus, type Quality } from '@/lib/types'
import { useEmployees } from '@/data/useEmployees'
import { useLeaveRequests } from '@/data/useLeaveRequests'
import { useVisitEntries } from '@/data/useVisitEntries'
import { useWfhRequests } from '@/data/useWfhRequests'
import { useVisitPurposes } from '@/data/useVisitPurposes'
import { notifyApprovers } from '@/data/useNotifications'
import { useSalaryRecords } from '@/data/useSalaryRecords'
import { useOnboardingTasks } from '@/data/useOnboardingTasks'
import { useEmployeeDocuments } from '@/data/useEmployeeDocuments'
import { useExitTasks } from '@/data/useExitTasks'
import { useAttendance } from '@/data/useAttendance'
import { PunchCard } from '@/components/PunchCard'
import { TermsAndConditions } from '@/screens/sections/TermsAndConditions'
import { usePersistedState } from '@/lib/usePersistedState'
import { statusChip, fmtDuration, fmtTime, officeToday,
  buildCalendar, calendarTotals, monthStart, monthEnd, addDays, DAY_KIND } from '@/lib/attendance'
import { DOC_TYPE, EMP_STATUS, LEAVE_STATUS, LEAVE_TYPE, SALARY_STATUS, VISIT_TYPE, fmtDate, fmtPeriod } from '@/lib/hr'
import { useLeaveMonth } from '@/data/useLeaveMonths'
import { useCompOffBalance } from '@/data/useCompOffBalance'
import { addMonths, firstOfMonth, fmtDays } from '@/lib/leaveRules'
import type { Workspace } from '@/data/useWorkspace'

type AttRange = 'this' | 'last' | 'custom'

type LeadsView = 'list' | 'board'
const LEADS_VIEW_KEY = 'metrol-crm-leadsview'

/**
 * Three sections rather than one long scroll — the same call Round 4 made for
 * the owner's project screen, arriving late here. A salesperson works leads;
 * a sale they already closed and the owner already verified is a record, not
 * a thing to scroll past on the way to the next call. It is one tap away when
 * they do want it.
 */
type MemberSec = 'overview' | 'attendance' | 'leads' | 'sales' | 'team' | 'profile'
const HEAD: Record<MemberSec, { title: string; sub: string }> = {
  // Subtitles that only describe the title are read once and then skipped
  // forever — "why would we be explaining it". Where the sub carries a real
  // count it survives, in the ternary below.
  overview: { title: 'Overview', sub: '' },
  // The line that used to live here is a one-time <Tip> inside the section
  // now — see the Attendance block below. Empty, so the page head drops the
  // whole row rather than printing a blank one.
  attendance: { title: 'Attendance', sub: '' },
  leads: { title: 'My leads', sub: '' },
  sales: { title: 'My sales', sub: '' },
  team: { title: 'Manage team', sub: '' },
  profile: { title: 'Profile', sub: '' },
}

/* Leave, Salary, Onboarding and Exit were four of the nine tabs on this
   screen, and all four are the same subject: me. They are one tab now, with
   these inside it — which is what takes the phone's tab bar down to five and
   removes the More sheet for everybody who is not a team lead. */
type MeTab = 'leave' | 'visit' | 'wfh' | 'salary' | 'onboarding' | 'exit' | 'terms'
const ME_TABS: { key: MeTab; label: string }[] = [
  { key: 'leave', label: 'Leave' },
  // Round 7 — same "apply, HR decides" shape as Leave, but neither one is a
  // leave type: a visit or a WFH day never touches the paid-leave balance.
  { key: 'visit', label: 'Visit entries' },
  { key: 'wfh', label: 'Work from home' },
  { key: 'salary', label: 'Salary' },
  { key: 'onboarding', label: 'Onboarding' },
  { key: 'exit', label: 'Exit' },
]
/* Terms is not in that list on purpose. "The terms and conditions is not
   something they are openly doing regularly" — it is read once at joining and
   almost never again, so it sits at the foot of the page with Sign out rather
   than taking a quarter of the row everything else has to share. */

/* The attendance table's cells. The year and the am/pm sit in their own spans
   so the phone stylesheet can drop what a narrow screen cannot afford, rather
   than a second formatter that the desktop and the phone could disagree on. */
const DateCell = ({ iso }: { iso: string }) => {
  const full = fmtDate(iso)
  const cut = full.lastIndexOf(' ')
  return <td className="num">{full.slice(0, cut)}<span className="yr">{full.slice(cut)}</span></td>
}
const TimeCell = ({ iso, tz }: { iso: string | null; tz: string }) => {
  if (!iso) return <td className="num"><span className="muted">—</span></td>
  const t = fmtTime(iso, tz)
  const m = /^(\d{1,2}:\d{2})\s*(.+)$/.exec(t)
  return <td className="num">{m ? <>{m[1]}<span className="ampm"> {m[2]}</span></> : t}</td>
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
  // Same "screen load is the cron tick" trick finalize_open_attendance() and
  // HrPage's own copy of this call use — this is the screen an ordinary
  // employee opens daily, so it's the one place that trick actually reaches
  // everybody, not just HR/owner. check_todays_birthdays() (0025) is
  // idempotent, so five salespeople opening the app the same morning costs
  // four no-op queries, not four duplicate notifications.
  useEffect(() => { if (!isDemo()) void supabase.rpc('check_todays_birthdays') }, [])
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
  const [sec, setSec] = usePersistedState<MemberSec>('member-sec', 'overview')
  const [edit, setEdit] = useState<{ kind: 'status' | 'quality'; anchor: HTMLElement; lead: Lead } | null>(null)
  const [saleFor, setSaleFor] = useState<Lead | null>(null)
  const [historyFor, setHistoryFor] = useState<Lead | null>(null)
  const [dismissed, setDismissed] = useState(false)
  // null = the menu itself. Profile opens on its list of sections, and one of
  // them opens over the top; it does not land you inside Leave by default.
  const [meTab, setMeTab] = usePersistedState<MeTab | null>('member-meTab', null)
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
  /** Payroll phase 1 (0029) — the one column an employee may write on their
   *  own employees row. update_my_pan() is scoped so it can only ever touch
   *  the caller's own pan_number, so this has no business going through
   *  staff.update (HR/owner only) at all. */
  const saveMyPan = useCallback(async (pan: string): Promise<string | null> => {
    if (isDemo()) { return 'PAN cannot be saved in demo mode.' }
    const { error: err } = await supabase.rpc('update_my_pan', { p_pan: pan })
    if (err) return err.message
    await staff.reload()
    return null
  }, [staff])
  const leave = useLeaveRequests(true)
  // Round 7 — same shape as leave, neither one a leave type: see useVisitEntries.ts.
  const visitEntries = useVisitEntries(true)
  const wfhRequests = useWfhRequests(true)
  const visitPurposes = useVisitPurposes(true)
  const activePurposes = useMemo(() => visitPurposes.rows.filter((p) => p.isActive), [visitPurposes.rows])
  // Attendance is the one HR table an ordinary employee writes to every day —
  // through punch_in()/punch_out(), never directly. RLS hands back only their
  // own rows, so `att.rows` here IS their history, not a filtered view of
  // everyone's.
  const att = useAttendance(true)
  const myLeave = useMemo(
    () => (myEmployee ? leave.rows.filter((r) => r.employeeId === myEmployee.id) : []),
    [leave.rows, myEmployee],
  )
  const myVisits = useMemo(
    () => (myEmployee ? visitEntries.rows.filter((r) => r.employeeId === myEmployee.id) : []),
    [visitEntries.rows, myEmployee],
  )
  const myVisitsWithLabel = useMemo(
    () => myVisits.map((v) => ({ ...v, label: visitPurposes.rows.find((p) => p.id === v.purposeId)?.label ?? 'Visit entry' })),
    [myVisits, visitPurposes.rows],
  )
  const myWfh = useMemo(
    () => (myEmployee ? wfhRequests.rows.filter((r) => r.employeeId === myEmployee.id) : []),
    [wfhRequests.rows, myEmployee],
  )
  const tz = att.settings?.timezone ?? 'Asia/Kolkata'

  /* Leave stopped being a yearly entitlement in Round 2. It accrues 2 days a
     MONTH, a half day costs half of one, and whatever is left is either paid
     out or carried — so the balance is a month's balance, and the month has to
     be pickable: somebody checking a payslip is asking about last month, not
     this one. */
  const [leaveMonth, setLeaveMonth] = useState(() => firstOfMonth(officeToday()))
  const leaveSrc = useMemo(() => ({
    employees: staff.rows, rows: att.rows, leaves: leave.rows,
    holidays: att.holidays, settings: att.settings, today: officeToday(tz),
  }), [staff.rows, att.rows, leave.rows, att.holidays, att.settings, tz])
  const lm = useLeaveMonth(myEmployee?.id ?? null, leaveMonth, leaveSrc)
  const compOffBalance = useCompOffBalance(myEmployee?.id ?? null)
  const thisMonth = firstOfMonth(officeToday(tz))
  const monthName = (m: string) => new Date(m + 'T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
  const myAtt = useMemo(
    () => (myEmployee
      ? att.rows.filter((r) => r.employeeId === myEmployee.id).sort((a, b) => b.workDate.localeCompare(a.workDate))
      : []),
    [att.rows, myEmployee],
  )
  /* The range the attendance table and the grid both answer to. Defaults to
     this month because that is what somebody opening the screen wants; the
     two date inputs are there for Adarsh's "from where to where". */
  const [attFrom, setAttFrom] = useState(() => monthStart(officeToday()))
  // The whole month, not "so far" — the grid below reads as a real calendar
  // month (1st to the 30th/31st) rather than a strip that grows one square a
  // day. Days after today render blank (buildCalendar's own 'future' kind,
  // already excluded from the table beneath it), so nothing here is guessed.
  const [attTo, setAttTo] = useState(() => monthEnd(officeToday()))
  /* Three buttons and two date fields, always on screen, to answer a question
     that is "this month" almost every time. One dropdown, and the two fields
     only when somebody actually asks for Custom. */
  const [attRange, setAttRange] = useState<AttRange>('this')
  const pickRange = (r: AttRange) => {
    setAttRange(r)
    const t = officeToday(tz)
    if (r === 'this') { setAttFrom(monthStart(t)); setAttTo(monthEnd(t)) }
    else if (r === 'last') {
      const prev = addDays(monthStart(t), -1)
      setAttFrom(monthStart(prev)); setAttTo(monthEnd(prev))
    }
    // 'custom' moves nothing — it only reveals the two fields, so the range
    // you were already looking at is the one you start editing from.
  }
  // What the calendar's colours mean, behind a ⓘ instead of five labels
  // living under the strip forever.
  const [keyOpen, setKeyOpen] = useState(false)
  // Light/dark is a setting on the Profile tab now, not a sun icon sitting on
  // top of every screen in the app.
  // Sales' Cards/List lived on a row of its own inside the grid. The law says
  // it belongs on the title's line, so this screen owns it and puts it there.
  const [salesView, setSalesView] = usePhoneView('member-sales')
  // My leads had TWO switches on a phone — Board/List in the head and the
  // grid's own Cards/List on a row under it, both with a button labelled
  // "List" meaning different things. They are one three-way control now:
  // Board is the kanban, Cards is the card list, List is the table. The Cards
  // button hides above the phone breakpoint, where the grid is always a table.
  const [leadsGridView, setLeadsGridView] = usePhoneView('member-leads')

  /* Every date in the range, told what it is — a punched day, an approved
     leave, a holiday, a Sunday, or an absence. The grid and the table below
     render THIS list, not two separately-derived ones, so a square and its
     row cannot disagree about a date. */
  const calendar = useMemo(() => buildCalendar({
    from: attFrom, to: attTo,
    rows: myAtt,
    holidays: att.holidays,
    weekOffs: att.settings?.weekOffs ?? [0],
    leaves: myLeave,
    visits: myVisitsWithLabel,
    wfh: myWfh,
    today: officeToday(tz),
  }), [attFrom, attTo, myAtt, att.holidays, att.settings, myLeave, myVisitsWithLabel, myWfh, tz])
  const totals = useMemo(() => calendarTotals(calendar), [calendar])


  const [requestingLeave, setRequestingLeave] = useState(false)
  const [requestingVisit, setRequestingVisit] = useState(false)
  const [requestingWfh, setRequestingWfh] = useState(false)
  // The Attendance tab's title-line "Apply ▾" button — one control standing
  // in for three, per THE LAYOUT LAW: a phone has no room left on that line
  // for three separate buttons once the range picker is already on it.
  const [applyAnchor, setApplyAnchor] = useState<HTMLElement | null>(null)
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

  /* The passport photo the joining form already collected — it has been
     sitting in employee-documents since approval and was never shown to the
     person it belongs to. Signed on demand, like every other document. */
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const photoDoc = useMemo(() => myOwnDocs.find((d) => d.docType === 'photo') ?? null, [myOwnDocs])
  useEffect(() => {
    let alive = true
    if (!photoDoc) { setPhotoUrl(null); return }
    void myDocs.downloadUrl(photoDoc.filePath).then((u) => { if (alive) setPhotoUrl(u) })
    return () => { alive = false }
  }, [photoDoc, myDocs.downloadUrl])
  // Only relevant once somebody is actually leaving — showing this tab to
  // every active employee would read as a strange, unprompted question.
  const isLeaving = !!myEmployee && myEmployee.status !== 'active'
  const myExitTasks = useExitTasks(isLeaving)
  const myOwnExitTasks = useMemo(
    () => (myEmployee ? myExitTasks.rows.filter((t) => t.employeeId === myEmployee.id).sort((a, b) => a.sortOrder - b.sortOrder) : []),
    [myExitTasks.rows, myEmployee],
  )
  const shownSec: MemberSec = sec === 'team' && !isLead ? 'overview' : sec
  const shownMeTab: MeTab | null = meTab === 'exit' && !isLeaving ? null : meTab

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

  /* One string, resolved once, because an empty <div className="sub"> is not
     nothing — it is a line of the page. Attendance's sub is '' now (its copy
     moved into a dismissible Tip), and Profile's used to repeat the employee
     code and designation that the new identity card below prints properly,
     so both tabs get that row back. */
  // Rule 6 of the layout law: totals live on the bottom edge of the thing they
  // count, not in the header fighting the view switch for the same row. Both
  // of these moved into their grid foots.
  const headSub = HEAD[sec].sub

  return (
    <div className="screen screen--app is-active">
      <div className="topbar">
        <div className="brand">
          <div className="monogram">M</div>
          <div className="brand-name">Metrol Media</div>
        </div>
        <div className="topbar-right">
          {/* What this app did first — sign-out and the avatar chip off the
              topbar, "so their space becomes clean" — is what every screen
              does now. AccountControls drops them for any topbar, so there is
              nothing left here to pass. */}
          <AccountControls ws={ws} variant="topbar" alwaysShow
                           onRefresh={() => { if (!ws.refreshing) void ws.refresh() }}
                           refreshing={ws.refreshing}
                           extra={<DensitySlider />}
                           roleLabel={ws.departmentName(me?.departmentId ?? null) ?? 'Sales'}
                           onOpenProfile={() => setSec('profile')} />
        </div>
      </div>

      <div className="shell">
        <div className="workspace">
          <div className="wrap">
            <div className="page-head">
              <h1>{HEAD[sec].title}</h1>
              {headSub && <div className="sub">{headSub}</div>}
              {/* Refresh used to sit here, labelled, on a row of its own under
                  every single page title. It is an icon in the top bar now —
                  same button, on every tab, costing no vertical space. So this
                  row only exists on the one tab that has a real control. */}
              {sec === 'leads' && (
                <div className="section-tools">
                  <div className="seg seg--leads">
                    <button className={leadsView === 'board' ? 'is-on' : ''} onClick={() => pickView('board')}>Board</button>
                    <button className={'seg-cards' + (leadsView === 'list' && leadsGridView === 'cards' ? ' is-on' : '')}
                            onClick={() => { pickView('list'); setLeadsGridView('cards') }}>Cards</button>
                    <button className={leadsView === 'list' && leadsGridView === 'list' ? 'is-on' : ''}
                            onClick={() => { pickView('list'); setLeadsGridView('list') }}>List</button>
                  </div>
                </div>
              )}
              {/* Beside the title, not in .section-tools — that wrapper takes a
                  full row to itself on a phone, which is the row this was
                  supposed to save. */}
              {sec === 'sales' && (
                <div className="section-tools">
                  <div className="seg">
                    <button className={salesView === 'cards' ? 'is-on' : ''} onClick={() => setSalesView('cards')}>Cards</button>
                    <button className={salesView === 'list' ? 'is-on' : ''} onClick={() => setSalesView('list')}>List</button>
                  </div>
                </div>
              )}
              {sec === 'attendance' && myEmployee && (
                <button className="btn btn--sm btn--primary head-cta"
                        onClick={(e) => setApplyAnchor(e.currentTarget)}>
                  Apply ▾
                </button>
              )}
              {applyAnchor && (
                <Menu
                  anchor={applyAnchor}
                  items={[
                    { value: 'leave', label: 'Leave' },
                    { value: 'visit', label: 'Visit entry' },
                    { value: 'wfh', label: 'Work from home' },
                  ]}
                  onPick={(v) => {
                    if (v === 'leave') setRequestingLeave(true)
                    else if (v === 'visit') setRequestingVisit(true)
                    else setRequestingWfh(true)
                  }}
                  onClose={() => setApplyAnchor(null)}
                />
              )}
            </div>

            <div className="tabs tabs--nav">
              <button className={sec === 'overview' ? 'is-on' : ''} onClick={() => setSec('overview')}>Overview</button>
              <button className={sec === 'attendance' ? 'is-on' : ''} onClick={() => setSec('attendance')}>
                Attendance
              </button>
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
              <button className={sec === 'profile' ? 'is-on' : ''} onClick={() => setSec('profile')}>
                Profile {myLeave.some((r) => r.status === 'pending') && <span className="count">{myLeave.filter((r) => r.status === 'pending').length}</span>}
              </button>
            </div>

            {/* Profile — the same component the owner's and HR's screens
                render. The identity card, the list of everything about me,
                the account editor, Appearance and Sign out are one thing in
                one place now, and this screen no longer owns a private copy
                of it that the other two could drift away from.
                It shows on the LANDING view only: opening Leave or Salary
                used to keep the whole card above the ← header, which on an
                812px phone is a third of the screen spent saying who you are
                on a page you opened to read a table. */}
            {shownSec === 'profile' && shownMeTab === null && (
              <ProfileSection
                ws={ws}
                photoUrl={photoUrl}
                fullName={myEmployee?.fullName || me?.name || undefined}
                subtitle={ws.departmentName(me?.departmentId ?? null) ?? 'Sales'}
                pan={myEmployee ? myEmployee.panNumber : undefined}
                onSavePan={myEmployee ? saveMyPan : undefined}
                meta={myEmployee ? (
                  <div className="emp-meta">
                    <span className="emp-code">{myEmployee.employeeCode || 'No ID'}</span>
                    <span>{myEmployee.designation || 'No designation'}</span>
                    <span className="emp-dept">{ws.departmentName(myEmployee.departmentId) ?? 'No department'}</span>
                  </div>
                ) : undefined}
                rows={[
                  /* A team lead's Overview gives its tab up to Manage team —
                     it is a summary of My leads and My sales, and both of
                     those are tabs of their own, so it is the one that loses
                     least by being a tap away instead of a tab. */
                  ...(isLead ? [{ key: 'overview', label: 'Overview', onClick: () => setSec('overview') }] : []),
                  ...ME_TABS.filter((t) => t.key !== 'exit' || isLeaving).map((t) => ({
                    key: t.key,
                    label: t.label,
                    badge: t.key === 'leave' ? myLeave.filter((r) => r.status === 'pending').length
                      : t.key === 'visit' ? myVisits.filter((r) => r.status === 'pending').length
                      : t.key === 'wfh' ? myWfh.filter((r) => r.status === 'pending').length
                      : undefined,
                    onClick: () => setMeTab(t.key),
                  })),
                  { key: 'terms', label: 'Terms & Conditions', atFoot: true, onClick: () => setMeTab('terms') },
                ]}
              />
            )}

            {shownSec === 'profile' && shownMeTab !== null && (
              <div className="prof-back">
                <button className="btn btn--sm" onClick={() => setMeTab(null)} aria-label="Back to profile">←</button>
                <h3>{shownMeTab === 'terms' ? 'Terms & Conditions'
                  : (ME_TABS.find((t) => t.key === shownMeTab)?.label ?? '')}</h3>
                {/* The month stepper is a filter for Leave, so it rides on
                    Leave's own header rather than a band of its own. */}
                {shownMeTab === 'leave' && myEmployee && (
                  <div className="month-step">
                    <button className="btn btn--sm" aria-label="Previous month"
                            onClick={() => setLeaveMonth((m) => addMonths(m, -1))}>←</button>
                    <strong>{monthName(leaveMonth)}</strong>
                    <button className="btn btn--sm" aria-label="Next month" disabled={leaveMonth >= thisMonth}
                            onClick={() => setLeaveMonth((m) => addMonths(m, 1))}>→</button>
                  </div>
                )}
              </div>
            )}

            {shownSec === 'profile' && shownMeTab === 'exit' && myEmployee && (
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

            {shownSec === 'profile' && shownMeTab === 'onboarding' && (
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

            {shownSec === 'profile' && shownMeTab === 'salary' && (
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

            {shownSec === 'profile' && shownMeTab === 'terms' && (
              <TermsAndConditions settings={att.settings} />
            )}

            {shownSec === 'attendance' && (
              <>
                {!myEmployee ? (
                  <div className="ov-card">
                    <div className="ov-head"><h4>No employee record yet</h4></div>
                    <p style={{ padding: '0 16px 16px', color: 'var(--ink-3)' }}>
                      HR has not added you to the directory yet, so there is nothing to record attendance against.
                      Ask HR to add your record.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* The line that used to sit under the page title every
                        single day. Once, with an ✕ — "did they need this text
                        again after the first time? No, right?" */}
                    <Tip tipKey="metrol-att-help">
                      Punch in when you reach the office, punch out when you leave.
                    </Tip>

                    {/* The identity card that used to sit here is gone: Profile
                        opens with the same photo, name, code and designation,
                        and printing them twice was a card's worth of height on
                        the screen somebody opens every single morning. The one
                        control that was on it — Request leave — moved up onto
                        the page title's own line. Punching in is the first
                        thing on this page now, which is what the page is for. */}
                    <PunchCard att={att} myEmployeeId={myEmployee.id}
                               shiftStart={att.shifts.find((s) => s.id === myEmployee.shiftId)?.startsAt ?? null}
                               myOfficeId={myEmployee.officeId} toast={toast} />

                    <div className="section">
                      {/* The range controls sit ON the heading line, not on a
                          row of their own under it — they are one control, and
                          a whole band of white above the month is exactly the
                          space this screen was wasting. */}
                      <div className="section-head section-head--wrap">
                        {/* Heading and ⓘ are one item on purpose: this row
                            stacks into a column on a phone, so two siblings
                            would be two rows. A legend nobody needs twice
                            should not cost a row to hide either. */}
                        <div className="sh-title">
                          <h3>My attendance</h3>
                          <button className="pb-info" onClick={() => setKeyOpen(true)}
                                  aria-label="What the colours mean">i</button>
                        </div>
                      <div className="range-bar">
                        <select className="input range-pick" aria-label="Date range"
                                value={attRange} onChange={(e) => pickRange(e.target.value as AttRange)}>
                          <option value="this">This month</option>
                          <option value="last">Last month</option>
                          <option value="custom">Custom</option>
                        </select>
                        {attRange === 'custom' && (
                          <>
                            <div className="field">
                              <label htmlFor="attFrom">From</label>
                              <input className="input" id="attFrom" type="date" value={attFrom}
                                     max={attTo} onChange={(e) => setAttFrom(e.target.value)} />
                            </div>
                            <div className="field">
                              <label htmlFor="attTo">To</label>
                              <input className="input" id="attTo" type="date" value={attTo}
                                     min={attFrom} onChange={(e) => setAttTo(e.target.value)} />
                            </div>
                          </>
                        )}
                      </div>
                      </div>

                      {/* The month, and it is the FIRST thing on the page —
                          "how is my month going" is the question somebody opens
                          this screen with, not "how many half days do I have".

                          One strip, one row, small square cells — not a five-row
                          block. Every day of the month sits side by side, square
                          corners, a hairline between each one (Apple Calendar's
                          own trick: cells are the surface colour, the strip under
                          them is the line colour, and the 1px gap between cells
                          is what draws a dead-straight line without a border
                          fighting its neighbour's border). Colour lives on the
                          date NUMBER itself, not a filled tile, so the strip stays
                          calm at a glance; today is the one cell that gets a
                          filled circle. It scrolls sideways on a narrow phone
                          rather than wrapping into a second, taller shape — the
                          strip is always this one shape, on every screen. */}
                      {calendar.length > 0 && (
                        <div className="cal-wrap">
                          {/* --cal-third is a third of the month, rounded up. The
                              phone stylesheet reads it as its column count so the
                              three rows come out even; desktop ignores it entirely
                              and stays one scrolling strip. */}
                          <div className="cal-strip"
                               style={{ ['--cal-third' as string]: Math.ceil(calendar.length / 3) }}>
                            {calendar.map((d) => (
                              <div className={'cal-cell ' + DAY_KIND[d.kind].cls
                                     + (d.date === officeToday(tz) ? ' cal-cell--today' : '')}
                                   key={d.date}
                                   title={`${fmtDate(d.date)} — ${[DAY_KIND[d.kind].label || 'Nothing recorded', d.remark].filter(Boolean).join(' · ')}`}>
                                <span className="dw">{['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][new Date(d.date + 'T00:00:00Z').getUTCDay()]}</span>
                                <span className="d">{Number(d.date.slice(8, 10))}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="att-sum">
                        <div className="att-sum-tile"><div className="n">{totals.present}</div><div className="l">Present</div></div>
                        <div className="att-sum-tile"><div className="n">{totals.late}</div><div className="l">Late coming</div></div>
                        <div className="att-sum-tile"><div className="n">{totals.halfDay}</div><div className="l">Half days</div></div>
                        <div className="att-sum-tile"><div className="n">{totals.leave}</div><div className="l">Leave</div></div>
                        <div className="att-sum-tile"><div className="n">{totals.visit}</div><div className="l">Visit</div></div>
                        <div className="att-sum-tile"><div className="n">{totals.wfh}</div><div className="l">WFH</div></div>
                        <div className="att-sum-tile"><div className="n">{totals.absent}</div><div className="l">Absent</div></div>
                        <div className="att-sum-tile"><div className="n">{fmtDuration(totals.workedMinutes)}</div><div className="l">Worked</div></div>
                      </div>

                      {/* The same days again, with the actual times on them.
                          Every date in the range has a row — a Sunday, a
                          holiday and an absence all used to be simply missing
                          from this list, which is what made it impossible to
                          check a month against a payslip. */}
                      <div className="att-table-wrap">
                        <table className="att-table">
                          <thead>
                            {/* Two spellings of three headers: the whole words
                                on a laptop, In / Out / Hours on a phone, where
                                "WORK DURATION" alone was wider than the hours
                                written under it. */}
                            <tr>
                              <th>Date</th>
                              <th><span className="lbl-long">Punch in</span><span className="lbl-short">In</span></th>
                              <th><span className="lbl-long">Punch out</span><span className="lbl-short">Out</span></th>
                              {/* Remark before the total: in and out are two
                                  times, the remark says what kind of day it
                                  was, and the hours are the answer that
                                  follows from all three. Reading a total
                                  between the times and their explanation was
                                  the thing that did not scan. */}
                              <th>Remark</th>
                              <th><span className="lbl-long">Work duration</span><span className="lbl-short">Hours</span></th>
                            </tr>
                          </thead>
                          <tbody>
                            {calendar.filter((d) => d.kind !== 'future').slice().reverse().map((d) => {
                              const note = [d.remark, d.row?.source === 'hr' ? 'corrected by HR' : ''].filter(Boolean).join(' · ')
                              return (
                                <tr key={d.date}>
                                  <DateCell iso={d.date} />
                                  <TimeCell iso={d.row?.punchInAt ?? null} tz={tz} />
                                  <TimeCell iso={d.row?.punchOutAt ?? null} tz={tz} />
                                  <td className="rmk">
                                    <Chip cls={d.row ? statusChip(d.row.status).cls : d.kind === 'absent' ? 'chip--bad' : 'chip--mute'}>
                                      {DAY_KIND[d.kind].label}
                                    </Chip>
                                    {note && <span className="att-note">{note}</span>}
                                  </td>
                                  <td className="num">{d.row?.workedMinutes ? fmtDuration(d.row.workedMinutes) : <span className="muted">—</span>}</td>
                                </tr>
                              )
                            })}
                            {calendar.filter((d) => d.kind !== 'future').length === 0 && (
                              <tr><td colSpan={5} className="muted" style={{ padding: 16 }}>
                                Nothing in this range. Pick different dates, or punch in to start today.
                              </td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}

            {shownSec === 'profile' && shownMeTab === 'leave' && (
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
                      {/* Available is what CAN be spent — last month's leftover
                          plus this month's accrual — not a yearly allowance. */}
                      <Kpi accent label="Available" value={fmtDays(lm.data?.available)}
                           sub={`${fmtDays(lm.data?.opening)} brought forward + ${fmtDays(lm.data?.accrued)} earned`} />
                      <Kpi label="Used" value={fmtDays(lm.data?.used)} sub="approved leave and half days" />
                      <Kpi label="Left" value={fmtDays(lm.data?.closing)}
                           sub={lm.data?.closed
                             ? (lm.data.choice === 'payout' ? `paid out ${fmtDays(lm.data.payoutDays)}` : `carried ${fmtDays(lm.data.carried)}`)
                             : 'before HR closes the month'} />
                      {/* Unpaid is not a withdrawal from the balance — it is
                          what comes off the salary. Two different facts. */}
                      <Kpi label="Unpaid" value={fmtDays(lm.data?.unpaidDays)} sub="absences and leave without pay" />
                    </div>

                    {lm.error && <div className="auth-err" style={{ marginBottom: 14 }}>{lm.error}</div>}
                    {lm.data && !lm.data.counted && (
                      <p className="punch-note">Leave is not counted for this month yet, so every number above is zero.</p>
                    )}
                    {lm.data?.provisional && (
                      <p className="punch-note">
                        {/* Was three lines explaining itself. The fact is that
                            the figure is provisional; the reasoning behind it
                            is not something anybody re-reads every month. */}
                        Brought-forward is provisional — HR has not closed last month yet.
                      </p>
                    )}
                    {!!lm.data?.lateHalfDays && (
                      <p className="punch-note">
                        {/* lateHalfDays COUNTS half days, it is not a number
                            of days — one of them costs half a day. Saying "1
                            off your balance" for a single half day was wrong. */}
                        {lm.data.lateCount} late arrivals this month. The first {att.settings?.freeLatesPerMonth ?? 4} do
                        not cost anything; each one after that is a half day, so far {fmtDays(lm.data.lateHalfDays)} of
                        them — {fmtDays(lm.data.lateHalfDays * 0.5)} off your balance.
                      </p>
                    )}
                    {!!lm.data?.unsettledDays && (
                      <p className="punch-note">
                        {lm.data.unsettledDays} day(s) you never punched out of. HR has to settle those before this month can close.
                      </p>
                    )}

                    {lm.history.length > 0 && (
                      <div className="section">
                        <div className="section-head"><h3>Closed months</h3></div>
                        <div className="ov-actions">
                          {lm.history.map((h) => (
                            <div className="ov-row" key={h.month} style={{ cursor: 'default' }}>
                              <span className="ov-l">
                                <strong>{monthName(h.month)}</strong>
                                <span style={{ color: 'var(--ink-3)' }}>{'  ·  '}used {fmtDays(h.used)}</span>
                              </span>
                              <Chip cls="chip--mute">
                                {h.choice === 'payout' ? `Paid out ${fmtDays(h.payoutDays)}` : `Carried ${fmtDays(h.carried)}`}
                              </Chip>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

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
                                <strong>{LEAVE_TYPE[r.leaveType].label}</strong> · {fmtDate(r.startDate)} – {fmtDate(r.endDate)}
                                {r.reason ? ' · ' + r.reason : ''}
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

            {/* Round 7 — same list shape as Leave's "My requests", but no
                balance KPIs above it: a visit or a WFH day has no balance to
                report against. */}
            {shownSec === 'profile' && shownMeTab === 'visit' && myEmployee && (
              <>
                {visitEntries.error && <div className="auth-err" style={{ marginBottom: 14 }}>{visitEntries.error}</div>}
                <div className="section">
                  <div className="section-head">
                    <h3>My requests</h3>
                    <div className="section-tools">
                      <button className="btn btn--sm btn--primary" onClick={() => setRequestingVisit(true)}>Apply for visit entry</button>
                    </div>
                  </div>
                  {myVisitsWithLabel.length === 0 ? (
                    <p style={{ color: 'var(--ink-3)' }}>No requests yet.</p>
                  ) : (
                    <div className="ov-actions">
                      {[...myVisitsWithLabel].sort((a, b) => b.startDate.localeCompare(a.startDate)).map((r) => (
                        <div className="ov-row" key={r.id} style={{ cursor: 'default' }}>
                          <span className="ov-n">{r.daysCount}d</span>
                          <span className="ov-l">
                            <strong>{r.label}</strong> · {VISIT_TYPE[r.visitType].label} · {fmtDate(r.startDate)}
                            {r.endDate !== r.startDate ? ` – ${fmtDate(r.endDate)}` : ''}
                            {r.detail ? ' · ' + r.detail : ''}
                            {r.decisionNote ? <span style={{ color: 'var(--ink-3)' }}> — {r.decisionNote}</span> : null}
                          </span>
                          <Chip cls={LEAVE_STATUS[r.status].cls}>{LEAVE_STATUS[r.status].label}</Chip>
                          {r.status === 'pending' && (
                            <button className="btn btn--sm" style={{ marginLeft: 10 }}
                                    onClick={() => void visitEntries.cancel(r.id).then((m) => toast(m ?? 'Request cancelled.'))}>
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

            {shownSec === 'profile' && shownMeTab === 'wfh' && myEmployee && (
              <>
                {wfhRequests.error && <div className="auth-err" style={{ marginBottom: 14 }}>{wfhRequests.error}</div>}
                <div className="section">
                  <div className="section-head">
                    <h3>My requests</h3>
                    <div className="section-tools">
                      <button className="btn btn--sm btn--primary" onClick={() => setRequestingWfh(true)}>Apply for work from home</button>
                    </div>
                  </div>
                  {myWfh.length === 0 ? (
                    <p style={{ color: 'var(--ink-3)' }}>No requests yet.</p>
                  ) : (
                    <div className="ov-actions">
                      {[...myWfh].sort((a, b) => b.startDate.localeCompare(a.startDate)).map((r) => (
                        <div className="ov-row" key={r.id} style={{ cursor: 'default' }}>
                          <span className="ov-n">{r.daysCount}d</span>
                          <span className="ov-l">
                            <strong>Work from home</strong> · {fmtDate(r.startDate)} – {fmtDate(r.endDate)}
                            {r.reason ? ' · ' + r.reason : ''}
                            {r.decisionNote ? <span style={{ color: 'var(--ink-3)' }}> — {r.decisionNote}</span> : null}
                          </span>
                          <Chip cls={LEAVE_STATUS[r.status].cls}>{LEAVE_STATUS[r.status].label}</Chip>
                          {r.status === 'pending' && (
                            <button className="btn btn--sm" style={{ marginLeft: 10 }}
                                    onClick={() => void wfhRequests.cancel(r.id).then((m) => toast(m ?? 'Request cancelled.'))}>
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

            {/* Sign out lives on Profile now, not as an icon in the top bar
                — "the last item, after scrolling", on the one tab that is
                about you. Gated on the section only, so it is the end of
                Profile whichever inner tab is open. It sits here rather than
                beside the other profile blocks because Leave renders after
                Attendance in this file: anything higher would land in the
                middle of the page on the Leave tab. */}
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
                  {/* Accent at both ends of the funnel: leads in, money out.
                      This is the card that spans the row on a phone, so it
                      carries the weight rather than trailing off. */}
                  <Kpi accent label="My sales" value={money(sum(cv))} sub={`${cv.filter((l) => !l.verified).length} awaiting verification`} />
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
                  <DataGrid cols={leadCols} rows={mine} storageKey="member-leads" phoneView={leadsGridView}
                            empty="Nothing assigned to you yet. The owner will hand you leads from here."
                            foot={<div className="grid-foot"><span>{count(mine.length, 'lead')} across {count(projects, 'project')}</span>
                              <span className="grid-hint">Drag a column edge to resize · <kbd>double-click</kbd> to reset</span></div>} />
                ) : (
                  <>
                    <LeadsBoard leads={mine} projectName={projectName} onOpenHistory={setHistoryFor} onDropStatus={(l, s) => void dropStatus(l, s)}
                                onEditQuality={(e, l) => setEdit({ kind: 'quality', anchor: e.currentTarget, lead: l })} />
                    {/* The board has no grid to hang a foot off, so it gets the
                        same line the list's foot carries — the total does not
                        disappear just because you switched view. */}
                    <div className="grid-foot"><span>{count(mine.length, 'lead')} across {count(projects, 'project')}</span></div>
                  </>
                )}
              </div>
            )}

            {sec === 'sales' && (
              <div className="section">
                <DataGrid cols={salesCols} rows={[...cv].sort((a, b) => daysSince(a.convertedAt ?? a.createdAt) - daysSince(b.convertedAt ?? b.createdAt))}
                          storageKey="member-sales" phoneView={salesView}
                          empty="No sales yet. Mark a lead Converted and record the amount, and it lands here."
                          foot={<div className="grid-foot">
                            <span>{count(cv.length, 'deal')} closed · {money(sum(cv))} total</span>
                            <span className="grid-hint">{cv.filter((l) => l.verified).length} verified · {cv.filter((l) => !l.verified).length} pending</span>
                          </div>} />
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

      {/* The same sections as the tab strip above, which is hidden at this
          width: nine of them scrolled sideways and most were never seen. The
          four an employee opens daily are tabs; the rest are behind More. */}
      {/* Five, and the fifth is Profile. It used to be SIX for a team lead —
          which pushed Profile into the "More" sheet, so the one tab that is
          supposed to be in the same place for everybody was the one tab a
          lead could not find. Manage team takes Overview's slot instead, and
          Overview is a row inside Profile for them. */}
      <BottomNav
        active={sec}
        items={[
          isLead
            ? { key: 'team', label: 'Manage team', short: 'Team', badge: teamRows.length, icon: NAV_ICONS.team, onClick: () => setSec('team') }
            : { key: 'overview', label: 'Overview', icon: NAV_ICONS.overview, onClick: () => setSec('overview') },
          { key: 'attendance', label: 'Attendance', icon: NAV_ICONS.attendance, onClick: () => setSec('attendance') },
          { key: 'leads', label: 'My leads', short: 'Leads', badge: mine.length, icon: NAV_ICONS.leads, onClick: () => setSec('leads') },
          { key: 'sales', label: 'My sales', short: 'Sales', badge: cv.length, icon: NAV_ICONS.sales, onClick: () => setSec('sales') },
          { key: 'profile', label: 'Profile', icon: NAV_ICONS.profile, badge: myLeave.filter((r) => r.status === 'pending').length, onClick: () => setSec('profile') },
        ] satisfies BottomNavItems}
      />

      {keyOpen && (
        <Modal title="What the colours mean" sub="The month strip above, explained"
               onClose={() => setKeyOpen(false)}
               foot={<button className="btn btn--primary" onClick={() => setKeyOpen(false)}>Got it</button>}>
          <div className="cal-key cal-key--modal">
            <span><i style={{ background: 'var(--cal-present)' }} />Present</span>
            <span><i style={{ background: 'var(--cal-late)' }} />Late / half day</span>
            <span><i style={{ background: 'var(--cal-leave)' }} />Leave</span>
            <span><i style={{ background: 'var(--cal-visit)' }} />Visit entry</span>
            <span><i style={{ background: 'var(--cal-wfh)' }} />Work from home</span>
            <span><i style={{ background: 'var(--cal-absent)' }} />Absent</span>
            <span><i className="cal-key-holiday" />Holiday or weekly off</span>
          </div>
        </Modal>
      )}


      {requestingLeave && myEmployee && (
        <LeaveRequestModal
          employeeId={myEmployee.id}
          weekOffs={att.settings?.weekOffs ?? [0]}
          holidays={att.holidays}
          allowPeriod={(att.settings?.periodLeavePerMonth ?? 0) > 0}
          gender={myEmployee.gender}
          compOffBalance={compOffBalance}
          existingLeave={myLeave}
          onClose={() => setRequestingLeave(false)}
          onSave={async (draft) => {
            const message = await leave.create(draft)
            if (!message) toast('Leave request sent.')
            return message
          }}
        />
      )}
      {requestingVisit && myEmployee && (
        <VisitEntryRequestModal
          employeeId={myEmployee.id}
          purposes={activePurposes}
          weekOffs={att.settings?.weekOffs ?? [0]}
          holidays={att.holidays}
          onClose={() => setRequestingVisit(false)}
          onSave={async (draft) => {
            const message = await visitEntries.create(draft)
            if (!message) {
              toast('Visit entry sent.')
              const purpose = activePurposes.find((p) => p.id === draft.purposeId)?.label ?? 'a visit'
              void notifyApprovers('visit_request', 'New visit entry request',
                `${myEmployee.fullName} — ${purpose}. Review it in Attendance → Visit.`)
            }
            return message
          }}
        />
      )}
      {requestingWfh && myEmployee && (
        <WfhRequestModal
          employeeId={myEmployee.id}
          weekOffs={att.settings?.weekOffs ?? [0]}
          holidays={att.holidays}
          onClose={() => setRequestingWfh(false)}
          onSave={async (draft) => {
            const message = await wfhRequests.create(draft)
            if (!message) {
              toast('WFH request sent.')
              void notifyApprovers('wfh_request', 'New work-from-home request',
                `${myEmployee.fullName} applied for WFH. Review it in Attendance → WFH.`)
            }
            return message
          }}
        />
      )}
    </div>
  )
}
