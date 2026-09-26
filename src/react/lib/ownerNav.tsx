import type { RailItem } from '@/components/Rail'
import type { ProfileRow } from '@/components/ProfileSection'

/**
 * The owner's and HR's whole app, in one place (AGENCY-OS-PLAN.md §9, Round 1).
 *
 * It used to be two flat lists that knew nothing of each other: the owner's
 * rail (projects, Team, HR, a gear) and HR's rail (nine sections in the order
 * they happened to be built). Adarsh: "proper tabs, navigation and options,
 * categorised, easy to maintain and understand." So every owner-level screen
 * — HR's, Projects, a project, Team, Profile — now draws the SAME list, in
 * labelled groups, from this file. A screen only says which item is lit.
 *
 * To add a screen: one entry in DEST, one key in a group. A screen that is not
 * built yet has no entry — no dead buttons (Shoots arrive in Round 4 and slot
 * into "Clients & content", beside Content and Tasks from Round 2).
 *
 * The keys that are HR-screen sections ARE HrPage's section names, so a
 * section remembered from before this change still opens.
 */
export type OwnerDest =
  | 'dashboard'
  | 'directory' | 'attendance' | 'salary' | 'joining' | 'departments'
  | 'clientsPages' | 'content' | 'tasks' | 'reels'
  | 'projects' | 'team'
  | 'access' | 'workflows' | 'company' | 'terms'

/** Destinations that live on HR's screen (HrPage), as its section names. */
export const HR_SECTIONS = [
  'dashboard', 'directory', 'attendance', 'salary', 'joining', 'departments',
  'clientsPages', 'content', 'tasks', 'reels', 'access', 'workflows', 'terms',
] as const
export type HrSection = (typeof HR_SECTIONS)[number] | 'profile'
export const isHrSection = (d: string): d is (typeof HR_SECTIONS)[number] => (HR_SECTIONS as readonly string[]).includes(d)

const svg = (children: React.ReactNode, size = 16) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
       strokeLinecap="round" strokeLinejoin="round">{children}</svg>
)

export const DEST: Record<OwnerDest, { label: string; icon: React.ReactNode }> = {
  dashboard: { label: 'Dashboard', icon: svg(<><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>) },
  directory: { label: 'Employees', icon: svg(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /></>) },
  attendance: { label: 'Attendance', icon: svg(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>) },
  salary: { label: 'Salary', icon: svg(<><circle cx="12" cy="12" r="9" /><path d="M12 7v10M9.5 9.5a2.5 2.5 0 0 1 2.5-1h.3a2.2 2.2 0 0 1 0 4.4h-.6a2.2 2.2 0 0 0 0 4.4h.3a2.5 2.5 0 0 0 2.5-1" /></>) },
  joining: { label: 'Joining & Exit', icon: svg(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 15l2 2 4-4" /></>) },
  departments: { label: 'Departments', icon: svg(<path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01" />, 15) },
  clientsPages: { label: 'Clients', icon: svg(<><path d="M3 21h18" /><path d="M5 21V9l7-5 7 5v12" /><path d="M10 21v-6h4v6" /></>) },
  content: { label: 'Content', icon: svg(<><rect x="3" y="4" width="5" height="16" rx="1.5" /><rect x="10" y="4" width="5" height="11" rx="1.5" /><rect x="17" y="4" width="4" height="7" rx="1.5" /></>) },
  tasks: { label: 'Tasks', icon: svg(<><path d="M9 6h11M9 12h11M9 18h11" /><path d="M3.5 6l1.2 1.2L7 5M3.5 12l1.2 1.2L7 11M3.5 18l1.2 1.2L7 17" /></>) },
  reels: { label: 'Reels', icon: svg(<><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M3 8h18M8 3l3 5M14 3l3 5" /><path d="M10.5 12.5v5l4-2.5z" /></>) },
  projects: { label: 'Projects', icon: svg(<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>) },
  team: { label: 'Sales team', icon: svg(<path d="M3 20V10M9 20V4M15 20v-7M21 20v-11" />, 15) },
  access: { label: 'Roles & access', icon: svg(<><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /><circle cx="12" cy="16" r="1.3" /></>) },
  workflows: { label: 'Workflows & lists', icon: svg(<><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="12" r="2.5" /><circle cx="6" cy="18" r="2.5" /><path d="M8.5 6H12a3 3 0 0 1 3 3v.5M8.5 18H12a3 3 0 0 0 3-3v-.5" /></>) },
  company: { label: 'Company', icon: svg(<><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h.01M15 15h.01M10 21v-3h4v3" /></>) },
  terms: { label: 'Terms & Conditions', icon: svg(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8M8 17h5" /></>) },
}

/** The groups, in the order the rail draws them. Dashboard is home, above them all. */
export const GROUPS: { label: string | null; items: OwnerDest[] }[] = [
  { label: null, items: ['dashboard'] },
  { label: 'People', items: ['directory', 'attendance', 'salary', 'joining', 'departments'] },
  { label: 'Clients & content', items: ['clientsPages', 'content', 'tasks', 'reels'] },
  { label: 'Sales', items: ['projects', 'team'] },
  { label: 'Settings', items: ['access', 'workflows', 'company', 'terms'] },
]

export interface NavOptions {
  /** Not on this screen's list at all (not built yet, not installed, or a
   *  bottom-bar tab when these are Profile's rows). */
  hide?: OwnerDest[]
  /** A different label — "Attendance (3)", "Clients & Pages" before 0036. */
  label?: Partial<Record<OwnerDest, string>>
  /** A count on a Profile row. */
  badge?: Partial<Record<OwnerDest, number>>
  /** Rows nested under one destination — each project under Projects. */
  under?: Partial<Record<OwnerDest, RailItem[]>>
}

/** The rail: every destination, grouped. */
export function ownerRail(go: (d: OwnerDest) => void, o: NavOptions = {}): RailItem[] {
  const out: RailItem[] = []
  for (const g of GROUPS) {
    for (const key of g.items) {
      if (o.hide?.includes(key)) continue
      out.push({ key, label: o.label?.[key] ?? DEST[key].label, icon: DEST[key].icon, group: g.label ?? undefined, onClick: () => go(key) })
      for (const sub of o.under?.[key] ?? []) out.push({ ...sub, group: g.label ?? undefined, sub: true })
    }
  }
  return out
}

/** Profile's rows on a phone — the same groups, minus the screen's tab bar.
 *  Terms sits at the foot with Sign out: read once at joining, never daily. */
export function ownerProfileRows(go: (d: OwnerDest) => void, o: NavOptions = {}): ProfileRow[] {
  const out: ProfileRow[] = []
  for (const g of GROUPS) {
    for (const key of g.items) {
      if (o.hide?.includes(key)) continue
      out.push({
        key, label: o.label?.[key] ?? DEST[key].label, group: g.label ?? undefined,
        badge: o.badge?.[key], atFoot: key === 'terms', onClick: () => go(key),
      })
    }
  }
  return out
}
