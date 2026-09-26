/* Agency OS — Phase 1's vocabulary (AGENCY-OS-PLAN.md). Roles and what they
   may do (0035), the client master and its team (0036), and view targets
   with their weekly numbers (0037). hr.ts carries Client and Page; this file
   carries everything that hangs off them. */

/* ------------------------------------------------------ roles & capabilities */

/** The fixed list — the app has to know what each one MEANS, so it lives in
 *  code. Which role holds which is data. Mirrors role_capabilities' CHECK in
 *  0035; keep the two in step. */
export type Capability =
  | 'view_all_clients' | 'manage_clients' | 'see_client_money'
  | 'view_targets' | 'manage_targets' | 'enter_views' | 'assign_team'
  | 'manage_workflows' | 'view_all_work' | 'approve_incentives'
  | 'manage_hr' | 'manage_payroll' | 'manage_assets' | 'manage_settings'

/** `live` is whether anything in the app reads it yet. The Roles & access
 *  screen only offers the live ones: a tick that changes nothing is a control
 *  that lies. The rest are seeded so they already say the right thing on the
 *  day the part of the app that needs them is built. */
export const CAPABILITIES: { key: Capability; label: string; hint: string; live: boolean }[] = [
  { key: 'view_all_clients', label: 'See every client', hint: 'Not only the clients they are on', live: true },
  { key: 'manage_clients', label: 'Edit clients & pages', hint: 'Details, links, pages, channels, page colours', live: true },
  { key: 'assign_team', label: 'Assign people', hint: 'Put anyone on a client team, give out pages', live: true },
  { key: 'see_client_money', label: 'See client money', hint: 'Monthly value and payment status', live: true },
  { key: 'view_targets', label: 'See view targets', hint: 'Targets, periods, achieved and left', live: true },
  { key: 'manage_targets', label: 'Set targets', hint: 'Targets, periods, adjustments, any week\'s number', live: true },
  { key: 'enter_views', label: 'Enter weekly views', hint: 'Per client role: only on pages they hold', live: true },
  { key: 'manage_settings', label: 'Roles & access', hint: 'This screen, and the colour lists', live: true },
  { key: 'manage_workflows', label: 'Workflows & lists', hint: 'Workflow stages, task statuses, content formats', live: true },
  { key: 'view_all_work', label: 'See all work', hint: 'Every content item and task — and give tasks to anyone in the department', live: true },
  { key: 'approve_incentives', label: 'Approve incentives', hint: 'Still HR today', live: false },
  { key: 'manage_hr', label: 'HR', hint: 'Still the HR department today', live: false },
  { key: 'manage_payroll', label: 'Payroll', hint: 'Still the HR department today', live: false },
  { key: 'manage_assets', label: 'Assets', hint: 'Phase 3', live: false },
]

export type HeldBy = 'assigned' | 'department' | 'team_leads'

export interface Role {
  id: string
  name: string
  departmentId: string | null
  /** Held per client (SMM, Editor) — through a client's team, never company-wide. */
  clientScoped: boolean
  heldBy: HeldBy
  /** Who may put somebody in this role on a client — the §3.3 chain. */
  assignedByRoleId: string | null
  /** The role somebody gets on a client when they are given one of its pages. */
  pageHolder: boolean
  sortOrder: number
  isActive: boolean
}

export interface RoleCapability { roleId: string; capability: Capability }

/** A company-wide role given to one person by hand. departmentId narrows it:
 *  "Head of Video Editors" is Department Head with that department. */
export interface EmployeeRole {
  id: string
  employeeId: string
  roleId: string
  departmentId: string | null
  grantedAt: string
}

/* ------------------------------------------------------ workflows (0043) */

/** Phase 2's spine: an ordered list of stages, each naming the role that acts
 *  on it. Round 2 hangs content items on these rows — nothing about "Editing
 *  comes after Shoot done" lives in code. */
export type PageKind = 'main' | 'fan'

export interface Workflow {
  id: string
  name: string
  /** Which pages it is for — a new item on a fan page starts on the first
   *  active fan workflow. null = any page. */
  pageType: PageKind | null
  sortOrder: number
  isActive: boolean
}

export interface WorkflowStage {
  id: string
  workflowId: string
  name: string
  sortOrder: number
  /** Whoever holds this role on the item's client team acts on it. */
  ownerRoleId: string | null
  /** Somebody approves it here or sends it back. */
  isReview: boolean
  /** What a client would see in a portal (Phase 3). */
  clientVisible: boolean
  /** An item here is finished — no task is made for it. */
  isDone: boolean
  tone: Tone
  slaHours: number | null
  isActive: boolean
}

export type StageDraft = Omit<WorkflowStage, 'id' | 'workflowId' | 'sortOrder'>

/** The first active one is where a new task starts; a done one finishes it. */
export interface TaskStatus {
  id: string
  name: string
  tone: Tone
  sortOrder: number
  isDone: boolean
  isActive: boolean
}

/* ---------------------------------------------------------- the client master */

/** The app's own chip colours — a status reads the same in light and dark. */
export type Tone = 'good' | 'warn' | 'bad' | 'accent' | 'mute'
export const TONES: { key: Tone; label: string }[] = [
  { key: 'good', label: 'Green' },
  { key: 'warn', label: 'Orange' },
  { key: 'bad', label: 'Red' },
  { key: 'accent', label: 'Black' },
  { key: 'mute', label: 'Grey' },
]

/** client_statuses, page_statuses and view_adjustment_types are all this
 *  shape — three small lists management edits, none of them code. */
export interface ListItem {
  id: string
  name: string
  tone: Tone
  sortOrder: number
  isActive: boolean
}

export interface ClientLink {
  id: string
  clientId: string
  label: string
  url: string
  sortOrder: number
}

/** Its own table on purpose (0036): RLS is per row, so money on `clients`
 *  would be readable by every SMM who can read the client. */
export interface ClientFinancials {
  clientId: string
  monthlyValue: number | null
  paymentStatus: string
  notes: string
  updatedAt: string
}

export type Platform = 'instagram' | 'youtube' | 'facebook'
export const PLATFORMS: Platform[] = ['instagram', 'youtube', 'facebook']
export const PLATFORM: Record<Platform, { label: string; short: string }> = {
  instagram: { label: 'Instagram', short: 'IG' },
  youtube: { label: 'YouTube', short: 'YT' },
  facebook: { label: 'Facebook', short: 'FB' },
}

export interface PageChannel {
  id: string
  pageId: string
  platform: Platform
  handle: string
  url: string
  isActive: boolean
  createdAt: string
}

/** One person, one role, one client — kept after it ends, so "who was on
 *  this client in May" has an answer. */
export interface ClientAssignment {
  id: string
  clientId: string
  employeeId: string
  roleId: string
  assignedAt: string
  endedAt: string | null
}

/* ------------------------------------------------------------ view targets */

export type WeekRule = 'start' | 'end'

export interface ViewTarget {
  id: string
  clientId: string
  label: string
  totalViews: number
  startsOn: string
  endsOn: string
  countMain: boolean
  countFan: boolean
  platforms: Platform[]
  /** Q4: a week crossing into the next period counts where it starts, or
   *  where it ends (LavBhushan's sheet does the second). */
  weekCountsIn: WeekRule
  isActive: boolean
  notes: string
}

export interface ViewTargetPeriod {
  id: string
  targetId: string
  label: string
  startsOn: string
  endsOn: string
  sharePct: number | null
  /** Its own number, when the sheet's figure is not total × share (Q3). */
  targetViews: number | null
  sortOrder: number
}

export interface WeeklyView {
  id: string
  channelId: string
  /** A Monday. */
  weekStart: string
  views: number
  followers: number | null
  proofPath: string | null
  enteredBy: string | null
  enteredAt: string
  updatedBy: string | null
  updatedAt: string | null
}

export interface ViewAdjustment {
  id: string
  targetId: string
  periodId: string | null
  weekStart: string | null
  typeId: string
  /** Signed — suspended-account views are negative, as the sheet writes them. */
  views: number
  note: string
  createdAt: string
}

/* ------------------------------------------------------------ small helpers */

/** "@handle" out of a pasted Instagram link, an @handle or a bare username —
 *  the same thing ig_handle() does in 0036. */
export function igHandle(input: string): string {
  const s = input.trim()
  if (!s) return ''
  const m = s.match(/instagram\.com\/([A-Za-z0-9_.]+)/i)
  return '@' + (m ? m[1] : s.replace(/^@+/, ''))
}

/** What a pasted link is, so one box can take any of them. */
export function platformOfUrl(url: string): Platform | null {
  if (/instagram\.com/i.test(url)) return 'instagram'
  if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube'
  if (/facebook\.com|fb\.com/i.test(url)) return 'facebook'
  return null
}

/** A channel's link, built from its handle when nobody pasted one. */
export function channelUrl(platform: Platform, handle: string, url?: string | null): string {
  if (url && /^https?:\/\//i.test(url)) return url
  const h = handle.trim().replace(/^@+/, '')
  if (!h) return ''
  if (platform === 'instagram') return `https://www.instagram.com/${h}/`
  if (platform === 'youtube') return `https://www.youtube.com/@${h}`
  return `https://www.facebook.com/${h}`
}

/** A YouTube channel's name or @handle out of whatever was pasted. */
export function channelHandle(platform: Platform, input: string): string {
  const s = input.trim()
  if (platform === 'instagram') return igHandle(s)
  if (platform === 'youtube') {
    const at = s.match(/youtube\.com\/@([A-Za-z0-9_.-]+)/i)
    if (at) return '@' + at[1]
    const ch = s.match(/youtube\.com\/(?:channel|c|user)\/([A-Za-z0-9_-]+)/i)
    if (ch) return ch[1]!
    return s
  }
  const fb = s.match(/facebook\.com\/([A-Za-z0-9_.-]+)/i)
  return fb ? fb[1]! : s
}

/** A code or a name to sort by — MM-0003 before MM-0012. */
export const byCode = (a: { code?: string | null; name: string }, b: { code?: string | null; name: string }) =>
  (a.code ?? '').localeCompare(b.code ?? '', undefined, { numeric: true }) || a.name.localeCompare(b.name)
