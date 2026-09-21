import type { Department, Lead, LeadEvent, LeadStatus, Member, Project, Quality } from '@/lib/types'
import type { Employee, EmployeeDocument, ExitTask, JobApplication, LeaveRequest, OnboardingTask, SalaryRecord, TdsCategory, VisitEntry, VisitPurpose, WfhRequest } from '@/lib/hr'
import type { AttendanceRow, AttendanceSettings, Holiday, OfficeLocation, Shift } from '@/lib/attendance'
import { workingDaysBetween } from '@/lib/hr'
import { initials } from '@/lib/format'

/**
 * The prototype's sample data, reproduced so the interface can be worked on and
 * checked without a database — the sandbox this was built in cannot reach
 * Supabase at all. Reached with ?demo=1; it never touches the network, and it
 * doubles as a way to show the product to somebody before their data exists.
 */

const NAMES: [string, string][] = []
const FIRST = ['Aarav', 'Isha', 'Rohan', 'Ananya', 'Kabir', 'Meera', 'Siddharth', 'Nisha', 'Varun', 'Riya',
  'Aditya', 'Sneha', 'Karan', 'Pooja', 'Rahul', 'Diya', 'Nikhil', 'Tanya', 'Vivek', 'Aisha',
  'Manav', 'Kritika', 'Yash', 'Sanya', 'Dev', 'Ira', 'Arnav', 'Naina', 'Rehan', 'Simran']
const LAST = ['Sharma', 'Patel', 'Reddy', 'Nair', 'Iyer', 'Singh', 'Gupta', 'Mehta', 'Joshi', 'Rao',
  'Bose', 'Kulkarni', 'Chopra', 'Malhotra', 'Bhatt', 'Sethi', 'Kapoor', 'Menon', 'Shah', 'Verma']
for (let i = 0; i < 600; i++) NAMES.push([FIRST[(i * 7) % FIRST.length]!, LAST[(i * 11) % LAST.length]!])

/** The seeded six. Everyone sits in Sales until the owner moves them. */
export const demoDepartments: Department[] = [
  { id: 'd1', name: 'Sales', sortOrder: 1, isActive: true },
  { id: 'd2', name: 'Production', sortOrder: 2, isActive: true },
  { id: 'd3', name: 'Content Creation', sortOrder: 3, isActive: true },
  { id: 'd4', name: 'Video Editors', sortOrder: 4, isActive: true },
  { id: 'd5', name: 'Developers', sortOrder: 5, isActive: true },
  { id: 'd6', name: 'AI Staff', sortOrder: 6, isActive: true },
  { id: 'd7', name: 'Human Resources', sortOrder: 7, isActive: true },
  { id: 'd8', name: 'Performance Marketing', sortOrder: 8, isActive: true },
]

const MEMBER_NAMES = ['Mohit Verma', 'Priya Nair', 'Arjun Mehta', 'Sneha Kulkarni', 'Imran Shaikh']

export const demoMembers: Member[] = MEMBER_NAMES.map((name, i) => ({
  id: 'm' + (i + 1),
  name,
  initials: initials(name),
  email: name.toLowerCase().replace(/\s+/g, '.') + '@metrol.in',
  phone: null,
  avatarUrl: null,
  departmentId: 'd1',
  role: 'member',
  isTeamLead: false,
}))

const OWNER: Member = {
  id: 'owner', name: 'Owner', initials: 'MM', email: 'owner@metrol.in',
  phone: null, avatarUrl: null, departmentId: null, role: 'owner', isTeamLead: false,
}

/** Not in demoMembers: they are not a salesperson, so they have no business in
 *  the assign menu. They exist so ?demo=1&as=hr has somebody to sign in as. */
const HR_PERSON: Member = {
  id: 'hr1', name: 'Priya Sharma', initials: 'PS', email: 'priya.sharma@metrol.in',
  phone: null, avatarUrl: null, departmentId: 'd7', role: 'member', isTeamLead: false,
}

const iso = (daysAgo: number, hourOffset = 0) =>
  new Date(Date.now() - daysAgo * 86400000 - hourOffset * 3600000).toISOString()

interface Spec { id: string; name: string; desc: string; status: Project['status']; n: number; conv: number; gross: number; photo: boolean }
const SPECS: Spec[] = [
  { id: 'p1', name: 'Funding Room', desc: 'Investor lead generation across Meta and Google campaigns.', status: 'active', n: 122, conv: 9, gross: 1328000, photo: true },
  { id: 'p2', name: 'Prime Estates', desc: 'Site-visit bookings for the Gurugram residential launch.', status: 'active', n: 186, conv: 22, gross: 1120000, photo: false },
  { id: 'p3', name: 'Skillveda Academy', desc: 'Admission enquiries for the digital marketing batch.', status: 'active', n: 412, conv: 96, gross: 864000, photo: true },
  { id: 'p4', name: 'Aarogya Clinics', desc: 'Appointment leads across three Indore branches.', status: 'active', n: 97, conv: 31, gross: 372000, photo: false },
  { id: 'p5', name: 'Nova Motors', desc: 'Test-drive bookings for the EV showroom launch.', status: 'paused', n: 64, conv: 9, gross: 585000, photo: true },
  { id: 'p6', name: 'Metrol Retainers', desc: 'Inbound agency enquiries coming from metrol.in.', status: 'active', n: 38, conv: 7, gross: 1260000, photo: true },
]

export const demoProjects: Project[] = SPECS.map((s, i) => ({
  id: s.id,
  name: s.name,
  description: s.desc,
  status: s.status,
  imageUrl: null,
  updatedAt: iso(0, i * 3),
  createdAt: iso(120 - i * 10),
}))

const ST: LeadStatus[] = ['new', 'connected', 'follow_up', 'connected', 'new', 'dead', 'follow_up', 'connected']
const QL: Quality[] = ['good', 'average', 'good', 'bad', 'average', 'good', 'average', 'good']

export const demoLeads: Lead[] = (() => {
  const out: Lead[] = []
  let n = 0
  for (const s of SPECS) {
    // The converted ones come first so their amounts add up to the stated gross.
    const each = Math.round(s.gross / Math.max(1, s.conv) / 5000) * 5000
    for (let i = 0; i < s.n; i++) {
      const [f, l] = NAMES[n % NAMES.length]!
      const converted = i < s.conv
      const status: LeadStatus = converted ? 'converted' : ST[i % ST.length]!
      const days = converted ? i % 30 : 0
      out.push({
        id: s.id + '-' + i,
        projectId: s.id,
        name: f + ' ' + l,
        email: (f + '.' + l).toLowerCase() + (i % 4 ? '' : i) + '@gmail.com',
        phone: '+91 ' + (90000 + (n * 137) % 9999) + ' ' + (10000 + (n * 7919) % 89999),
        status,
        quality: status === 'new' ? null : QL[i % QL.length]!,
        ownerId: i % 9 === 0 ? null : demoMembers[i % demoMembers.length]!.id,
        amount: converted ? (i === s.conv - 1 ? s.gross - each * (s.conv - 1) : each) : 0,
        verified: converted && i % 3 !== 0,
        convertedAt: converted ? iso(days, 6) : null,
        createdAt: iso(60 - (i % 60), 2),
        // A handful per project read as "assigned in the last few hours" so
        // the on-load "assigned to you" notice has something real to count in
        // demo mode; the rest look like they landed weeks ago, same as createdAt.
        assignedAt: i % 9 === 0 ? null : (i < 8 ? iso(0, i + 1) : iso(60 - (i % 60), 2)),
      })
      n++
    }
  }
  return out
})()

/* A plausible trail for the most recent conversions, so Recent activity and the
   history drawer have something true-shaped to show. Every timestamp is clamped
   into the past: an earlier round anchored them at "now" plus an offset, which
   put them in the future and pinned them to the top of the feed forever. */
export const demoEvents: LeadEvent[] = (() => {
  const out: LeadEvent[] = []
  let id = 0
  const recent = demoLeads.filter((l) => l.status === 'converted').slice(0, 14)
  for (const l of recent) {
    const who = demoMembers.find((m) => m.id === l.ownerId)?.name ?? 'Owner'
    const base = new Date(l.convertedAt ?? l.createdAt).getTime()
    out.push({ id: ++id, leadId: l.id, what: 'Status', from: 'Follow-up', to: 'Converted', by: who, at: base - 7200000 })
    out.push({ id: ++id, leadId: l.id, what: 'Sale recorded', from: '', to: String(l.amount), by: who, at: base - 3600000 })
    if (l.verified) out.push({ id: ++id, leadId: l.id, what: 'Payment', from: 'Pending', to: 'Verified', by: 'Owner', at: base - 600000 })
  }
  return out.sort((a, b) => a.at - b.at)
})()

// The owner is never a salesperson, so they never belong in the assign menu.
export const demoAllMembers = demoMembers

export const isDemo = () =>
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('demo')

/** ?demo=1&as=member shows the salesperson's app instead of the owner's, so
 *  every screen can be checked without a real account for each one.
 *    as=member — the salesperson
 *    as=lead   — the same salesperson, with the Manage team tab
 *    as=hr     — the HR dashboard
 */
export const demoMe = (() => {
  if (typeof window === 'undefined') return OWNER
  const as = new URLSearchParams(window.location.search).get('as')
  if (as === 'hr') return HR_PERSON
  if (as === 'lead') return { ...demoMembers[0]!, isTeamLead: true }
  return as === 'member' ? demoMembers[0]! : OWNER
})()

const DESIGNATIONS = ['Sales Executive', 'Senior Sales Executive', 'Sales Executive', 'Sales Executive', 'Sales Executive']
const JOINED = ['2023-04-11', '2022-09-01', '2024-01-15', '2025-03-03', '2021-11-22']

/** Employee records for ?demo — the five salespeople, an HR manager, and one
 *  person working their notice, so the directory has every state in it. */
export const demoEmployees: Employee[] = [
  {
    id: 'e0', employeeCode: '4821', profileId: HR_PERSON.id, fullName: HR_PERSON.name,
    designation: 'HR Manager', departmentId: 'd7', employmentType: 'full_time',
    dateOfJoining: '2024-02-05', reportingTo: null,
    workEmail: HR_PERSON.email ?? '', personalEmail: 'priya.s@gmail.com', phone: '+91 98200 11001',
    dateOfBirth: '1994-08-19', address: 'Vijay Nagar, Indore, MP',
    emergencyName: 'Sunil Sharma', emergencyRelation: 'Father', emergencyPhone: '+91 98200 11002',
    status: 'active', lastWorkingDay: null, notes: '', createdAt: iso(400), shiftId: 'sh1', officeId: 'off1',
    offerExtendedOn: '2024-01-25', offerAcceptedOn: '2024-01-28',
    resignationDate: null, noticePeriodDays: null, monthlySalary: 45000, gender: 'Female',
    panNumber: 'AKLPS1234F', workLocation: 'Indore HQ', basicSalary: 25000, tdsCategoryId: null,
  },
  ...demoMembers.map((m, i) => ({
    id: 'e' + (i + 1),
    // Four random digits, like the real generator in 0015 — a sequence would
    // tell anybody holding two ID cards who joined first and how many people
    // work here. Fixed values here so the demo reads the same every time.
    employeeCode: ['7845', '3015', '9264', '5107', '6390'][i] ?? '1000',
    profileId: m.id,
    fullName: m.name,
    designation: DESIGNATIONS[i] ?? 'Sales Executive',
    departmentId: 'd1',
    employmentType: (i === 3 ? 'intern' : 'full_time') as Employee['employmentType'],
    dateOfJoining: JOINED[i] ?? '2024-01-01',
    reportingTo: i === 0 ? null : 'e1',
    workEmail: m.email ?? '',
    personalEmail: '',
    phone: '+91 98200 1' + String(2000 + i),
    dateOfBirth: null,
    address: 'Indore, MP',
    emergencyName: 'Family contact',
    emergencyRelation: 'Spouse',
    emergencyPhone: '+91 98200 9' + String(3000 + i),
    status: (i === 4 ? 'notice' : 'active') as Employee['status'],
    lastWorkingDay: i === 4 ? '2026-10-15' : null,
    notes: '',
    createdAt: iso(300 - i * 20),
    offerExtendedOn: JOINED[i] ?? '2024-01-01',
    offerAcceptedOn: JOINED[i] ?? '2024-01-01',
    resignationDate: i === 4 ? '2026-09-01' : null,
    noticePeriodDays: i === 4 ? 45 : null,
    // The five are spread across the three shifts, so the demo shows what a
    // 09:30 person and a 10:30 person being "late" actually mean.
    shiftId: 'sh' + ((i % 3) + 1),
    officeId: i < 2 ? 'off1' : 'off2',
    // Round 4: everybody in the demo is priced except the newest starter —
    // that one row shows what "Set a monthly salary first" looks like.
    monthlySalary: i === 3 ? null : 25000 + i * 6000,
    // Round 6: one female salesperson so the demo shows Period leave actually
    // being offered, not just an empty state.
    gender: i === 1 ? 'Female' : 'Male',
    // Payroll phase 1: e1 (Mohit Verma, contract) shows a filled TDS category
    // and PAN; the rest show what "not set yet" looks like.
    panNumber: i === 0 ? 'CBCPC3986J' : null,
    workLocation: i === 0 ? 'Noida-10' : null,
    basicSalary: i === 0 ? 20000 : null,
    tdsCategoryId: i === 0 ? 'tds1' : null,
  })),
]

const YEAR = new Date().getFullYear()

/** Holidays for ?demo. Phase 7's whole point is visible here: Diwali sits
 *  inside e3's 20–24 Oct request, so that request reads 4 working days, not 5,
 *  and the form says why. A real company enters its own list — nothing is
 *  seeded into the live database. */
export const demoHolidays: Holiday[] = [
  { date: YEAR + '-01-26', name: 'Republic Day' },
  { date: YEAR + '-08-15', name: 'Independence Day' },
  { date: YEAR + '-10-21', name: 'Diwali' },
]

const HOLIDAY_DATES = demoHolidays.map((h) => h.date)

/** Computed, never typed. The real day count comes from 0016's trigger, and a
 *  hand-written number here would drift from it the moment a demo date crossed
 *  a Sunday in a different year — YEAR is the current year, so these dates
 *  land on different weekdays every January. */
const wdays = (a: string, b: string) => workingDaysBetween(a, b, [0], HOLIDAY_DATES).total

/** Leave requests for ?demo — one of every state and every type, spread across
 *  the HR manager and the salespeople, so the directory's Leave section and the
 *  member's own tab both have something real-shaped to show. */
export const demoLeaveRequests: LeaveRequest[] = [
  {
    id: 'lv1', employeeId: 'e2', startDate: YEAR + '-01-10', endDate: YEAR + '-01-12',
    daysCount: wdays(YEAR + '-01-10', YEAR + '-01-12'), leaveType: 'casual',
    reason: 'Family function', status: 'approved', decidedBy: HR_PERSON.id, decidedAt: iso(200), decisionNote: null,
    createdAt: iso(205),
  },
  {
    id: 'lv2', employeeId: 'e2', startDate: YEAR + '-11-02', endDate: YEAR + '-11-02',
    daysCount: wdays(YEAR + '-11-02', YEAR + '-11-02'), leaveType: 'sick',
    reason: 'Not feeling well', status: 'pending', decidedBy: null, decidedAt: null, decisionNote: null,
    createdAt: iso(1),
  },
  {
    id: 'lv3', employeeId: 'e3', startDate: YEAR + '-10-20', endDate: YEAR + '-10-24',
    daysCount: wdays(YEAR + '-10-20', YEAR + '-10-24'), leaveType: 'casual',
    reason: 'Diwali travel', status: 'pending', decidedBy: null, decidedAt: null, decisionNote: null,
    createdAt: iso(2),
  },
  {
    id: 'lv4', employeeId: 'e4', startDate: YEAR + '-06-05', endDate: YEAR + '-06-05',
    daysCount: wdays(YEAR + '-06-05', YEAR + '-06-05'), leaveType: 'casual',
    reason: 'Personal', status: 'rejected', decidedBy: HR_PERSON.id, decidedAt: iso(90), decisionNote: 'Clashed with the Nova Motors launch week.',
    createdAt: iso(92),
  },
  {
    id: 'lv5', employeeId: 'e1', startDate: YEAR + '-03-01', endDate: YEAR + '-03-02',
    daysCount: wdays(YEAR + '-03-01', YEAR + '-03-02'), leaveType: 'casual',
    reason: 'Moving house', status: 'cancelled', decidedBy: null, decidedAt: null, decisionNote: null,
    createdAt: iso(180),
  },
  // e1 is whose screen ?demo=1&as=member shows. Without these two, every tile
  // on their Leave tab reads zero and the balance arithmetic proves nothing.
  {
    id: 'lv6', employeeId: 'e1', startDate: YEAR + '-05-14', endDate: YEAR + '-05-16',
    daysCount: wdays(YEAR + '-05-14', YEAR + '-05-16'), leaveType: 'sick',
    reason: 'Viral fever', status: 'approved', decidedBy: HR_PERSON.id, decidedAt: iso(118), decisionNote: null,
    createdAt: iso(120),
  },
  {
    id: 'lv7', employeeId: 'e1', startDate: YEAR + '-07-06', endDate: YEAR + '-07-07',
    daysCount: wdays(YEAR + '-07-06', YEAR + '-07-07'), leaveType: 'unpaid',
    reason: 'Extended trip, balance already used', status: 'approved', decidedBy: HR_PERSON.id, decidedAt: iso(68), decisionNote: 'Approved without pay.',
    createdAt: iso(70),
  },
]

/** Payroll phase 1 — ?demo's TDS categories, same two HR starts with in the
 *  real database (0029's seed). e1 (Mohit Verma) is assigned tds1. */
export const demoTdsCategories: TdsCategory[] = [
  { id: 'tds1', label: 'Contract', ratePercent: 1, sortOrder: 1, isActive: true },
  { id: 'tds2', label: 'Professional', ratePercent: 10, sortOrder: 2, isActive: true },
]

/** Round 7 — ?demo's visit-purpose dropdown, same three HR starts with in the
 *  real database (0027's seed). */
export const demoVisitPurposes: VisitPurpose[] = [
  { id: 'vp1', label: 'Shoot', sortOrder: 1, isActive: true },
  { id: 'vp2', label: 'Client meeting', sortOrder: 2, isActive: true },
  { id: 'vp3', label: 'Branch visit', sortOrder: 3, isActive: true },
]

/** One of each state, spread across the same people demoLeaveRequests uses,
 *  so a visit day and a leave day can both show up on one month's strip. */
export const demoVisitEntries: VisitEntry[] = [
  {
    id: 've1', employeeId: 'e1', purposeId: 'vp2', detail: 'Nova Motors — quarterly review',
    visitType: 'full_day', startDate: YEAR + '-09-08', endDate: YEAR + '-09-08', daysCount: 1,
    status: 'approved', decidedBy: HR_PERSON.id, decidedAt: iso(12), decisionNote: null, createdAt: iso(13),
  },
  {
    id: 've2', employeeId: 'e2', purposeId: 'vp1', detail: 'Product shoot, Andheri studio',
    visitType: 'half_day', startDate: YEAR + '-11-04', endDate: YEAR + '-11-04', daysCount: 0.5,
    status: 'pending', decidedBy: null, decidedAt: null, decisionNote: null, createdAt: iso(0),
  },
  {
    id: 've3', employeeId: 'e3', purposeId: 'vp3', detail: 'Pune branch — quarterly audit',
    visitType: 'custom', startDate: YEAR + '-06-16', endDate: YEAR + '-06-18',
    daysCount: wdays(YEAR + '-06-16', YEAR + '-06-18'),
    status: 'approved', decidedBy: HR_PERSON.id, decidedAt: iso(95), decisionNote: null, createdAt: iso(97),
  },
]

export const demoWfhRequests: WfhRequest[] = [
  {
    id: 'wf1', employeeId: 'e1', startDate: YEAR + '-08-20', endDate: YEAR + '-08-21',
    daysCount: wdays(YEAR + '-08-20', YEAR + '-08-21'), reason: 'Internet installation at the office building',
    status: 'approved', decidedBy: HR_PERSON.id, decidedAt: iso(30), decisionNote: null, createdAt: iso(32),
  },
  {
    id: 'wf2', employeeId: 'e4', startDate: YEAR + '-11-10', endDate: YEAR + '-11-10',
    daysCount: wdays(YEAR + '-11-10', YEAR + '-11-10'), reason: 'Waiting for a delivery, cannot leave home',
    status: 'pending', decidedBy: null, decidedAt: null, decisionNote: null, createdAt: iso(0),
  },
]

const pad2 = (n: number) => String(n).padStart(2, '0')
const monthsAgo = (n: number) => {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - n)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`
}

/** Two months of payslips for everybody with an employee record, last month
 *  paid and this month still pending — so the Salary rail page has both
 *  states to show, and each person's own tab has a real-shaped history. */
export const demoSalaryRecords: SalaryRecord[] = demoEmployees.flatMap((e, i) => {
  const gross = 25000 + i * 6000
  const net = Math.round(gross * 0.92)
  return [
    {
      id: 'sl-' + e.id + '-1', employeeId: e.id, period: monthsAgo(1), grossAmount: gross, netAmount: net,
      status: 'paid' as const, paidAt: iso(20), paidBy: HR_PERSON.id, notes: '', createdAt: iso(25),
      payslipSentCount: 1, payslipSentAt: iso(20),
    },
    {
      id: 'sl-' + e.id + '-0', employeeId: e.id, period: monthsAgo(0), grossAmount: gross, netAmount: net,
      status: 'pending' as const, paidAt: null, paidBy: null, notes: '', createdAt: iso(1),
      payslipSentCount: 0, payslipSentAt: null,
    },
  ]
})

const DEFAULT_TASKS = ['Offer letter signed', 'ID proof collected', 'Bank details collected', 'Equipment issued', 'Induction completed']

/** Every demo employee gets the standard five-item checklist, all done for
 *  people who joined a while ago and partially done for the newest starter —
 *  so the Onboarding rail page has both a finished record and one in
 *  progress to show. */
export const demoOnboardingTasks: OnboardingTask[] = demoEmployees.flatMap((e, ei) => {
  const isNewest = e.id === 'e4' // Sneha Kulkarni — joined most recently among the seeded five
  return DEFAULT_TASKS.map((label, i) => ({
    id: 'ot-' + e.id + '-' + i,
    employeeId: e.id,
    label,
    done: isNewest ? i < 2 : true,
    doneAt: isNewest ? (i < 2 ? iso(5) : null) : iso(300 - ei * 10),
    doneBy: isNewest ? (i < 2 ? HR_PERSON.id : null) : HR_PERSON.id,
    sortOrder: i + 1,
  }))
})

/** One document on file per person, so the Onboarding section has something
 *  real-shaped without needing actual file bytes in demo mode. */
export const demoEmployeeDocuments: EmployeeDocument[] = demoEmployees.map((e, i) => ({
  id: 'doc-' + e.id,
  employeeId: e.id,
  docType: (['pan', 'aadhaar', 'bank_proof', 'photo', 'resume', 'other'] as const)[i % 6],
  fileName: e.fullName.toLowerCase().replace(/\s+/g, '-') + '-id-proof.pdf',
  filePath: e.id + '/id-proof.pdf',
  uploadedBy: HR_PERSON.id,
  uploadedAt: iso(200 - i * 10),
  notes: '',
}))

const EXIT_TASKS = [
  'Resignation letter received', 'Assets returned (laptop, ID card)', 'Access revoked',
  'Full and final settlement', 'Exit interview completed', 'Experience letter issued',
]

/** Only Imran Shaikh (e5, status 'notice') has an exit checklist in demo —
 *  the trigger that seeds one only fires when somebody actually leaves
 *  'active', so nobody else should have one either. Partway through: notice
 *  given and assets sorted, settlement and the rest still ahead. */
export const demoExitTasks: ExitTask[] = EXIT_TASKS.map((label, i) => ({
  id: 'et-e5-' + i,
  employeeId: 'e5',
  label,
  done: i < 2,
  doneAt: i < 2 ? iso(3) : null,
  doneBy: i < 2 ? HR_PERSON.id : null,
  sortOrder: i + 1,
}))

/* --------------------------------------------------------- Phase 6: attendance */

/** The office in ?demo is a real-looking coordinate with a 50 m fence. The
 *  punch screen in demo never asks the browser for a location — it cannot be
 *  standing in a fictional office — so it simulates a fix 18 m away, which is
 *  what a person at their desk would see. */
export const DEMO_OFFICE = { lat: 22.719568, lng: 75.857727, label: 'Metrol Media, Indore' }

/** Two branches, because Metrol has two. The second sits about 1.9 km from the
 *  first, which is far enough that the demo's simulated fix is inside exactly
 *  one of them at a time. */
export const demoOffices: OfficeLocation[] = [
  {
    id: 'off1', name: 'Noida Sector 6', address: 'C-56, Sector 6, Noida',
    lat: DEMO_OFFICE.lat, lng: DEMO_OFFICE.lng, radiusMeters: 50,
    isActive: true, sortOrder: 1, qrToken: 'demo-token-1', qrRotatedAt: iso(30),
  },
  {
    id: 'off2', name: 'Noida Sector 10', address: 'B-14, Sector 10, Noida',
    lat: DEMO_OFFICE.lat + 0.017, lng: DEMO_OFFICE.lng + 0.004, radiusMeters: 75,
    isActive: true, sortOrder: 2, qrToken: 'demo-token-2', qrRotatedAt: iso(12),
  },
]

export const demoAttendanceSettings: AttendanceSettings = {
  graceMinutes: 7,
  requiredMinutes: 540,
  halfDayMinutes: 270,
  maxAccuracyMeters: 100,
  weekOffs: [0],
  timezone: 'Asia/Kolkata',
  allowAnyBranch: true,
  punchMethods: 'both',
  punchMethodsInstalled: true,
  freeLatesPerMonth: 4,
  paidLeavePerMonth: 2,
  probationMonths: 0,
  sameDayLeaveUnpaid: false,
  periodLeavePerMonth: 0,
  // Last month, so demo mode has one whole month HR can actually close.
  leaveRulesStart: (() => { const t = new Date(); return new Date(Date.UTC(t.getFullYear(), t.getMonth() - 1, 1)).toISOString().slice(0, 10) })(),
  leaveRulesInstalled: true,
  updatedAt: iso(9),
}

export const demoShifts: Shift[] = [
  { id: 'sh1', name: 'Shift 1', startsAt: '09:30:00', sortOrder: 1, isActive: true },
  { id: 'sh2', name: 'Shift 2', startsAt: '10:00:00', sortOrder: 2, isActive: true },
  { id: 'sh3', name: 'Shift 3', startsAt: '10:30:00', sortOrder: 3, isActive: true },
]

/** Every day since the 1st of last month for everybody but the signed-in demo member, who is left
 *  without a row for today on purpose: the first thing anybody opening this
 *  screen wants to see is a punch button that works, not a day already closed.
 *  Sundays are skipped, because Sunday is the seeded week off. */
export const demoAttendance: AttendanceRow[] = (() => {
  const rows: AttendanceRow[] = []
  const empIds = ['e0', 'e1', 'e2', 'e3', 'e4', 'e5']
  // The shift a day is judged against comes from the person's own record, not
  // from their position in this list — otherwise the demo shows somebody on a
  // 10:00 shift with a history full of 09:30 days.
  const shiftFor = (id: string) =>
    demoShifts.find((s) => s.id === demoEmployees.find((e) => e.id === id)?.shiftId) ?? demoShifts[0]!
  const pad = (n: number) => String(n).padStart(2, '0')

  // From the 1st of LAST month, not a flat six weeks: the leave rules count
  // whole months, and a demo month with its first week missing would read
  // as four absences nobody took.
  const since = (() => { const t = new Date(); const f = new Date(t.getFullYear(), t.getMonth() - 1, 1); return Math.round((new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime() - f.getTime()) / 86400000) })()
  for (let back = since; back >= 0; back--) {
    const d = new Date()
    d.setDate(d.getDate() - back)
    if (d.getDay() === 0) continue
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

    empIds.forEach((id, i) => {
      // The signed-in member's today is deliberately empty.
      if (back === 0 && id === 'e1') return
      // A plausible spread rather than a perfect one: most days on time, a
      // late morning every couple of weeks, the occasional short day.
      const seed = (back * 7 + i * 13) % 17
      if (seed === 3) return                                   // no row at all — absent
      const shift = shiftFor(id)
      const startH = Number(shift.startsAt.slice(0, 2))
      const startM = Number(shift.startsAt.slice(3, 5))
      // The signed-in member runs late more often than the rest, so the late
      // rule (L5 onwards is a half day) has something real to show.
      const lateBy = seed === 5 ? 24 : seed === 11 ? 13 : id === 'e1' && seed % 5 === 2 ? 16 : seed % 3 === 0 ? 4 : 0
      const inMin = startH * 60 + startM + lateBy
      const workMin = seed === 8 ? 320 : 540 + (seed % 4) * 6
      const at = (mins: number) => new Date(`${date}T${pad(Math.floor(mins / 60))}:${pad(mins % 60)}:00+05:30`).toISOString()
      const late = Math.max(0, lateBy - 7)
      const open = back === 0                                   // today: still in the office
      const branch = demoEmployees.find((e) => e.id === id)?.officeId ?? 'off1'
      rows.push({
        id: `att-${id}-${date}`,
        employeeId: id,
        workDate: date,
        officeId: branch,
        // A spread of both methods, so HR's table shows what each looks like.
        punchInMethod: seed % 4 === 1 ? 'qr' : 'button',
        punchOutMethod: seed % 4 === 1 ? 'qr' : 'button',
        shiftId: shift.id,
        shiftStart: shift.startsAt,
        punchInAt: at(inMin),
        punchInLat: DEMO_OFFICE.lat + 0.0001,
        punchInLng: DEMO_OFFICE.lng,
        punchInAccuracy: 12 + (seed % 9),
        punchInDistance: 11 + (seed % 20),
        punchOutAt: open ? null : at(inMin + workMin),
        punchOutLat: open ? null : DEMO_OFFICE.lat,
        punchOutLng: open ? null : DEMO_OFFICE.lng,
        punchOutAccuracy: open ? null : 14,
        punchOutDistance: open ? null : 9 + (seed % 14),
        workedMinutes: open ? 0 : workMin,
        lateMinutes: late,
        status: open ? 'in_progress' : workMin < 270 ? 'absent' : workMin < 540 ? 'half_day' : late > 0 ? 'late' : 'present',
        source: 'self',
        editedBy: null,
        editReason: null,
      })
    })
  }
  return rows
})()

/** Phase 8 for ?demo: one of each state a real inbox will have — a fresh
 *  submission, one already approved (with an invite already sent), and one
 *  HR turned down. Nothing here can actually be approved from the demo —
 *  that needs the real Edge Function — but the review screen and its layout
 *  are fully walkable. */
/** The paper-form half of an application (migration 0020). Spread into each
 *  demo row so the fixtures say what is interesting about that applicant and
 *  inherit the rest — three hand-typed copies of twenty-six fields would
 *  drift apart the first time one is edited. */
const APP_BLANK = {
  firstName: '', lastName: '', fatherOrHusband: '', gender: '', dateOfBirth: null,
  placeOfBirth: '', nationality: 'Indian', religion: '', maritalStatus: '', dependents: '',
  aadhaarNumber: '', panNumber: 'BNZPK5678L', presentAddress: '', permanentAddress: '', pincode: '',
  education: [], technicalQualification: '', employmentHistory: [],
  bankName: '', bankAccountName: '', bankAccountNo: '', bankIfsc: '',
  languages: [], referenceName: '', referenceDepartment: '',
  declarationAcceptedAt: null, termsAcceptedAt: null,
  signaturePath: 'demo/signature.jpg', experienceLetterPath: null, salarySlipPath: null,
} satisfies Partial<JobApplication>

export const demoJobApplications: JobApplication[] = [
  {
    ...APP_BLANK,
    id: 'app1', fullName: 'Rakesh Kumar', phone: '+91 98765 43210', email: 'rakesh.kumar@example.com',
    positionInterest: 'Video Editor', noPreviousEmployment: false,
    firstName: 'Rakesh', lastName: 'Kumar', fatherOrHusband: 'Suresh Kumar',
    gender: 'Male', dateOfBirth: '2001-04-18', placeOfBirth: 'Ghaziabad',
    religion: 'Hindu', maritalStatus: 'Unmarried', dependents: 'No',
    aadhaarNumber: '6424 4201 0063', pincode: '201204',
    presentAddress: 'D-33, Madan Pura, Modinagar, Ghaziabad',
    permanentAddress: 'D-33, Madan Pura, Modinagar, Ghaziabad',
    education: [
      { examination: '10th Std.', year: '2018', institution: 'T.R.M. Public School', marks: '72%', subjects: 'General' },
      { examination: '12th Std.', year: '2020', institution: 'Surevin International School', marks: '68%', subjects: 'Commerce' },
      { examination: 'Diploma in VFX', year: '2023', institution: 'Arena Animation', marks: 'A', subjects: 'VFX, Editing' },
    ],
    technicalQualification: 'Adobe Premiere Pro, After Effects',
    employmentHistory: [
      { from: '2023-08', to: '2026-07', totalYears: '3', company: 'Bright Media, Noida',
        designation: 'Junior Video Editor', grossSalary: '18,000', reason: 'Better opportunity' },
    ],
    bankName: 'Punjab National Bank', bankAccountName: 'MR. RAKESH KUMAR',
    bankAccountNo: '0323001500095327', bankIfsc: 'PUNB0032300',
    languages: [
      { language: 'Hindi', understand: true, speak: true, read: true, write: true, remarks: '' },
      { language: 'English', understand: true, speak: true, read: true, write: false, remarks: '' },
    ],
    declarationAcceptedAt: iso(1), termsAcceptedAt: iso(1),
    photoPath: 'app1/photo.jpg', panPath: 'app1/pan.jpg', aadhaarPath: 'app1/aadhaar.jpg',
    bankProofPath: 'app1/bank.jpg', relievingLetterPath: 'app1/relieving.pdf',
    status: 'pending', decidedBy: null, decidedAt: null, decisionNote: null, employeeId: null,
    inviteSentCount: 0, inviteSentAt: null, createdAt: iso(1),
  },
  {
    ...APP_BLANK,
    id: 'app2', fullName: 'Sneha Iyer', phone: '+91 98200 55221', email: 'sneha.iyer@example.com',
    positionInterest: 'Sales Executive', noPreviousEmployment: true,
    photoPath: 'app2/photo.jpg', panPath: 'app2/pan.jpg', aadhaarPath: 'app2/aadhaar.jpg',
    bankProofPath: 'app2/bank.jpg', relievingLetterPath: null,
    status: 'approved', decidedBy: HR_PERSON.id, decidedAt: iso(2), decisionNote: null, employeeId: 'e6',
    inviteSentCount: 1, inviteSentAt: iso(2), createdAt: iso(4),
  },
  {
    ...APP_BLANK,
    id: 'app3', fullName: 'Manoj Tiwari', phone: '+91 90000 12121', email: 'manoj.t@example.com',
    positionInterest: 'Developer', noPreviousEmployment: false,
    photoPath: 'app3/photo.jpg', panPath: 'app3/pan.jpg', aadhaarPath: 'app3/aadhaar.jpg',
    bankProofPath: 'app3/bank.jpg', relievingLetterPath: 'app3/relieving.pdf',
    status: 'rejected', decidedBy: HR_PERSON.id, decidedAt: iso(6), decisionNote: 'Not the right fit for this opening.',
    employeeId: null, inviteSentCount: 0, inviteSentAt: null, createdAt: iso(8),
  },
]
