import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { demoJobApplications, isDemo } from '@/data/demo'
import type { JobApplication } from '@/lib/hr'

type Row = Record<string, unknown>

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v))

const toApp = (r: Row): JobApplication => ({
  id: str(r.id),
  fullName: str(r.full_name),
  phone: str(r.phone),
  email: str(r.email),
  positionInterest: str(r.position_interest),
  noPreviousEmployment: Boolean(r.no_previous_employment),
  photoPath: str(r.photo_path),
  panPath: str(r.pan_path),
  aadhaarPath: str(r.aadhaar_path),
  bankProofPath: str(r.bank_proof_path),
  relievingLetterPath: (r.relieving_letter_path as string | null) ?? null,
  status: (r.status as JobApplication['status']) ?? 'pending',
  decidedBy: (r.decided_by as string | null) ?? null,
  decidedAt: (r.decided_at as string | null) ?? null,
  decisionNote: (r.decision_note as string | null) ?? null,
  employeeId: (r.employee_id as string | null) ?? null,
  inviteSentCount: Number(r.invite_sent_count) || 0,
  inviteSentAt: (r.invite_sent_at as string | null) ?? null,
  createdAt: str(r.created_at),
})

const BUCKET = 'job-applications'

export interface ApplicationSubmission {
  fullName: string
  phone: string
  email: string
  positionInterest: string
  noPreviousEmployment: boolean
  files: {
    photo: File
    pan: File
    aadhaar: File
    bank_proof: File
    relieving_letter: File | null
  }
}

export interface ApprovalDetails {
  departmentId: string | null
  designation: string
  employmentType: 'full_time' | 'part_time' | 'intern' | 'contract'
  officeId: string | null
  shiftId: string | null
  dateOfJoining: string
  grossAmount: number
  netAmount: number
  annualLeaveDays: number
}

/**
 * The Phase 8 pipeline: a stranger submits (no session required — this is the
 * one screen in the app that runs signed out), HR reviews, and approval hands
 * off to the `approve-job-application` Edge Function because creating a login
 * needs the service role key, which must never reach the browser (0017).
 *
 * `submit` is usable with no Supabase session at all — the anon role's own
 * insert policy is what makes that safe, not anything client-side.
 */
export function useJobApplications(enabled = true) {
  const [rows, setRows] = useState<JobApplication[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!enabled) { setLoading(false); return }
    if (isDemo()) {
      setRows(demoJobApplications)
      setLoading(false)
      return
    }
    const { data, error: err } = await supabase
      .from('job_applications')
      .select('*')
      .order('created_at', { ascending: false })
    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }
    setRows((data ?? []).map((r) => toApp(r as Row)))
    setLoading(false)
  }, [enabled])

  useEffect(() => { void load() }, [load])

  const submit = useCallback(async (form: ApplicationSubmission): Promise<string | null> => {
    if (isDemo()) return 'This is a demo. Applications cannot actually be submitted here.'

    if (!form.noPreviousEmployment && !form.files.relieving_letter) {
      return 'A relieving letter is required, or tick "I have no previous employer."'
    }

    // Generated here, not left to the table's default, so the upload path and
    // the row it belongs to agree before either exists — see 0017 section 4.
    const id = crypto.randomUUID()
    const stamp = Date.now()

    const uploads: [keyof ApplicationSubmission['files'], File | null][] = [
      ['photo', form.files.photo], ['pan', form.files.pan],
      ['aadhaar', form.files.aadhaar], ['bank_proof', form.files.bank_proof],
      ['relieving_letter', form.files.relieving_letter],
    ]
    const paths: Record<string, string | null> = {}
    for (const [key, file] of uploads) {
      if (!file) { paths[key] = null; continue }
      const path = `${id}/${key}-${stamp}-${file.name}`
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file)
      if (upErr) return `Could not upload ${key.replace('_', ' ')}: ${upErr.message}`
      paths[key] = path
    }

    const { error: err } = await supabase.from('job_applications').insert({
      id,
      full_name: form.fullName.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      position_interest: form.positionInterest.trim(),
      no_previous_employment: form.noPreviousEmployment,
      photo_path: paths.photo,
      pan_path: paths.pan,
      aadhaar_path: paths.aadhaar,
      bank_proof_path: paths.bank_proof,
      relieving_letter_path: paths.relieving_letter,
    })
    if (err) return err.message
    return null
  }, [])

  const reject = useCallback(async (id: string, note: string, decidedBy: string): Promise<string | null> => {
    if (isDemo()) {
      setRows((p) => p.map((a) => (a.id === id ? { ...a, status: 'rejected', decisionNote: note, decidedBy, decidedAt: new Date().toISOString() } : a)))
      return null
    }
    const { data, error: err } = await supabase
      .from('job_applications')
      .update({ status: 'rejected', decision_note: note || null, decided_by: decidedBy, decided_at: new Date().toISOString() })
      .eq('id', id).select('*').single()
    if (err) return err.message
    if (data) setRows((p) => p.map((a) => (a.id === id ? toApp(data as Row) : a)))
    return null
  }, [])

  /** Everything that actually creates the login and the employee record runs
   *  server-side — this just invokes it and refreshes the row it changed. */
  const approve = useCallback(async (id: string, details: ApprovalDetails): Promise<string | null> => {
    if (isDemo()) return 'This is a demo. Approving here cannot actually create a login.'
    const { data, error: err } = await supabase.functions.invoke('approve-job-application', {
      body: { applicationId: id, ...details },
    })
    if (err) return err.message
    if (data?.error) return String(data.error)
    await load()
    return null
  }, [load])

  const resend = useCallback(async (id: string): Promise<string | null> => {
    if (isDemo()) return 'This is a demo. No email is actually sent here.'
    const { data, error: err } = await supabase.functions.invoke('approve-job-application', {
      body: { applicationId: id, resend: true },
    })
    if (err) return err.message
    if (data?.error) return String(data.error)
    await load()
    return null
  }, [load])

  const documentUrl = useCallback(async (path: string | null): Promise<string | null> => {
    if (!path || isDemo()) return null
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60)
    return data?.signedUrl ?? null
  }, [])

  return { rows, loading, error, reload: load, submit, reject, approve, resend, documentUrl, clearError: () => setError(null) }
}

export type JobApplications = ReturnType<typeof useJobApplications>
