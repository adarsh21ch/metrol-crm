export type Role = 'owner' | 'member'
export type LeadStatus = 'new' | 'connected' | 'follow_up' | 'dead' | 'converted'
export type Quality = 'good' | 'average' | 'bad'

export interface Profile {
  id: string
  role: Role
  name: string
  email: string | null
  created_at: string
}

export interface Project {
  id: string
  name: string
  description: string | null
  status: 'active' | 'paused' | 'done'
  image_url: string | null
  owner_id: string
  created_at: string
}

export interface Lead {
  id: string
  project_id: string
  name: string
  email: string | null
  phone: string | null
  status: LeadStatus
  quality: Quality | null
  owner_id: string | null
  amount: number
  verified: boolean
  converted_at: string | null
  created_at: string
}

export const STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'New',
  connected: 'Connected',
  follow_up: 'Follow up',
  dead: 'Dead',
  converted: 'Converted',
}

export const QUALITY_LABEL: Record<Quality, string> = {
  good: 'Good',
  average: 'Average',
  bad: 'Bad',
}
