/* The domain, named once. A finance or HR module later adds its own file
   beside this one rather than widening these types. */

export type Role = 'owner' | 'member'
export type LeadStatus = 'new' | 'connected' | 'follow_up' | 'converted' | 'dead'
export type Quality = 'good' | 'average' | 'bad'
export type ProjectStatus = 'active' | 'paused' | 'done'

export interface Member {
  id: string
  name: string
  initials: string
  email: string | null
  phone: string | null
  avatarUrl: string | null
  role: Role
}

export interface Project {
  id: string
  name: string
  description: string
  status: ProjectStatus
  imageUrl: string | null
  updatedAt: string
  createdAt: string
}

export interface Lead {
  id: string
  projectId: string
  name: string
  email: string
  phone: string
  status: LeadStatus
  quality: Quality | null
  ownerId: string | null
  amount: number
  verified: boolean
  convertedAt: string | null
  createdAt: string
  /** Set locally when a lead has just been assigned, to flag the row. */
  isNew?: boolean
}

export interface LeadEvent {
  id: number
  leadId: string
  what: string
  from: string
  to: string
  by: string
  at: number
}

/** The chip vocabulary, carried over from the prototype unchanged.
 *  "Connected" is deliberately neutral — it carries no good/bad meaning. */
export const STATUS: Record<LeadStatus, { label: string; cls: string }> = {
  new: { label: 'New', cls: 'chip--mute' },
  connected: { label: 'Connected', cls: 'chip--accent' },
  follow_up: { label: 'Follow-up', cls: 'chip--warn' },
  converted: { label: 'Converted', cls: 'chip--good' },
  dead: { label: 'Dead', cls: 'chip--mute' },
}

export const QUALITY: Record<Quality, { label: string; cls: string }> = {
  good: { label: 'Good', cls: 'chip--good' },
  average: { label: 'Average', cls: 'chip--warn' },
  bad: { label: 'Bad', cls: 'chip--bad' },
}

export const isConnected = (l: Lead) => l.status !== 'new'
export const isConverted = (l: Lead) => l.status === 'converted'
