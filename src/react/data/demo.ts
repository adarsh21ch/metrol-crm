import type { Lead, LeadEvent, LeadStatus, Member, Project, Quality } from '@/lib/types'
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

const MEMBER_NAMES = ['Mohit Verma', 'Priya Nair', 'Arjun Mehta', 'Sneha Kulkarni', 'Imran Shaikh']

export const demoMembers: Member[] = MEMBER_NAMES.map((name, i) => ({
  id: 'm' + (i + 1),
  name,
  initials: initials(name),
  email: name.toLowerCase().replace(/\s+/g, '.') + '@metrol.in',
  phone: null,
  avatarUrl: null,
  role: 'member',
}))

const OWNER: Member = {
  id: 'owner', name: 'Owner', initials: 'MM', email: 'owner@metrol.in', phone: null, avatarUrl: null, role: 'owner',
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
 *  both roles can be checked without two real accounts. */
export const demoMe = (() => {
  if (typeof window === 'undefined') return OWNER
  const as = new URLSearchParams(window.location.search).get('as')
  return as === 'member' ? demoMembers[0]! : OWNER
})()
