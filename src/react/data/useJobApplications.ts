import { useCallback, useEffect, useRef, useState } from 'react'
import { functionErrorMessage, supabase } from '@/lib/supabase'
import { demoJobApplications, isDemo } from '@/data/demo'
import type { JobApplication } from '@/lib/hr'

type Row = Record<string, unknown>

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v))

/** A storage key Supabase will actually accept. It rejects spaces and colons,
 *  and the single most likely file anybody attaches from a Mac is called
 *  "Screenshot 2026-09-16 at 11.58.23 AM.png" — every one of which is
 *  illegal. The extension is kept because it is what decides how the file
 *  opens for HR later. */
const safeName = (name: string) => {
  const dot = name.lastIndexOf('.')
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) : ''
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'file'
  return ext ? `${base}.${ext}` : base
}

/** What actually made Submit look frozen: five files straight off a phone are
 *  20–30 MB, and on an Indian uplink that is a minute of silence.
 *
 *  A 4000px camera photo is shrunk to 1600px on its long edge at JPEG 0.82 —
 *  roughly 300 KB, a ten-fold cut. 1600px is chosen so a PAN or Aadhaar card
 *  stays READABLE: the numbers on one photographed edge-to-edge land around
 *  1100px wide at that size, well above what HR needs to check them. Shrinking
 *  further would start costing legibility, which is the whole point of
 *  collecting the document.
 *
 *  PDFs and anything already under 600 KB pass through untouched — a PDF has
 *  no pixels to resample, and a small file has nothing to win. Every failure
 *  path returns the ORIGINAL file: a browser that cannot decode the image must
 *  still be able to apply. */
const MAX_EDGE = 1600
const SHRINK_ABOVE = 600 * 1024

async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.size <= SHRINK_ABOVE) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    if (scale === 1) { bitmap.close(); return file }

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) { bitmap.close(); return file }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()

    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.82))
    // Only take the smaller one. An already-optimised JPEG can come back
    // BIGGER after a re-encode, and shipping that would be a loss.
    if (!blob || blob.size >= file.size) return file
    const base = file.name.replace(/\.[^.]+$/, '')
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg' })
  } catch {
    return file
  }
}

const toApp = (r: Row): JobApplication => ({
  id: str(r.id),
  fullName: str(r.full_name),
  phone: str(r.phone),
  email: str(r.email),
  positionInterest: str(r.position_interest),
  noPreviousEmployment: Boolean(r.no_previous_employment),
  firstName: str(r.first_name),
  lastName: str(r.last_name),
  fatherOrHusband: str(r.father_or_husband),
  gender: str(r.gender),
  dateOfBirth: (r.date_of_birth as string | null) ?? null,
  placeOfBirth: str(r.place_of_birth),
  nationality: str(r.nationality),
  religion: str(r.religion),
  maritalStatus: str(r.marital_status),
  dependents: str(r.dependents),
  aadhaarNumber: str(r.aadhaar_number),
  panNumber: str(r.pan_number),
  presentAddress: str(r.present_address),
  permanentAddress: str(r.permanent_address),
  pincode: str(r.pincode),
  // jsonb comes back parsed; the guard is for a row written before 0020,
  // where the column does not exist at all and this would be undefined.
  education: Array.isArray(r.education) ? (r.education as JobApplication['education']) : [],
  technicalQualification: str(r.technical_qualification),
  employmentHistory: Array.isArray(r.employment_history) ? (r.employment_history as JobApplication['employmentHistory']) : [],
  bankName: str(r.bank_name),
  bankAccountName: str(r.bank_account_name),
  bankAccountNo: str(r.bank_account_no),
  bankIfsc: str(r.bank_ifsc),
  languages: Array.isArray(r.languages) ? (r.languages as JobApplication['languages']) : [],
  referenceName: str(r.reference_name),
  referenceDepartment: str(r.reference_department),
  declarationAcceptedAt: (r.declaration_accepted_at as string | null) ?? null,
  termsAcceptedAt: (r.terms_accepted_at as string | null) ?? null,
  photoPath: str(r.photo_path),
  panPath: str(r.pan_path),
  aadhaarPath: str(r.aadhaar_path),
  bankProofPath: str(r.bank_proof_path),
  relievingLetterPath: (r.relieving_letter_path as string | null) ?? null,
  signaturePath: str(r.signature_path),
  experienceLetterPath: (r.experience_letter_path as string | null) ?? null,
  salarySlipPath: (r.salary_slip_path as string | null) ?? null,
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

/** One row of the education table on the paper form. */
export interface EducationRow {
  examination: string; year: string; institution: string; marks: string; subjects: string
}
/** One row of the employee-history table on the paper form. */
export interface EmploymentRow {
  from: string; to: string; totalYears: string; company: string
  designation: string; grossSalary: string; reason: string
}
/** One row of the language table — four skills, each a plain yes/no tick. */
export interface LanguageRow {
  language: string; understand: boolean; speak: boolean; read: boolean; write: boolean; remarks: string
}

/**
 * Every field Metrol Media's printed application form asks for. The shape
 * follows the paper: personal data, then addresses, then the three tables,
 * then bank, then the reference, then the two acceptances.
 */
export interface ApplicationSubmission {
  // personal
  firstName: string
  lastName: string
  fatherOrHusband: string
  gender: string
  dateOfBirth: string
  placeOfBirth: string
  nationality: string
  religion: string
  maritalStatus: string
  dependents: string
  aadhaarNumber: string
  panNumber: string
  phone: string
  email: string
  positionInterest: string
  // address
  presentAddress: string
  permanentAddress: string
  pincode: string
  // qualifications and history
  education: EducationRow[]
  technicalQualification: string
  employmentHistory: EmploymentRow[]
  // bank
  bankName: string
  bankAccountName: string
  bankAccountNo: string
  bankIfsc: string
  languages: LanguageRow[]
  // reference
  referenceName: string
  referenceDepartment: string
  // gates
  declarationAccepted: boolean
  termsAccepted: boolean
  noPreviousEmployment: boolean
  files: {
    photo: File
    pan: File
    aadhaar: File
    bank_proof: File
    relieving_letter: File | null
    signature: File
    experience_letter: File | null
    salary_slip: File | null
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
  // No leave number any more: paid leave is a company-wide monthly rule
  // (0022), not a per-person annual entitlement typed at approval. The Edge
  // Function still writes its own default to the now-unread column.
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
  const fetched = useRef(false)

  const load = useCallback(async (force = false) => {
    if (!enabled) { setLoading(false); return }
    /* Fetch once per mount, not once per visit. Gating these hooks on the
       section that reads them (so opening HR stopped firing nine queries)
       had a cost nobody asked for: `enabled` flips on every tab switch, so
       going Salary → Leave → Salary re-queried Salary each time and the tab
       felt like it was thinking. The rows are already in state and correct;
       re-reading them to learn the same thing is the definition of a slow
       tab. `reload(true)` still forces a genuine re-read, which is what the
       Refresh buttons and the post-write reconciles call. */
    if (fetched.current && !force) { setLoading(false); return }
    fetched.current = true
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

  const submit = useCallback(async (form: ApplicationSubmission, onProgress?: (msg: string) => void): Promise<string | null> => {
    if (isDemo()) return 'This is a demo. Applications cannot actually be submitted here.'

    if (!form.noPreviousEmployment && !form.files.relieving_letter) {
      return 'A relieving letter is required, or tick "I have no previous employer."'
    }
    if (!form.files.signature) return 'A signature is required.'
    if (!form.declarationAccepted) return 'Please accept the declaration before submitting.'
    if (!form.termsAccepted) return 'Please accept the Terms & Conditions before submitting.'

    // Generated here, not left to the table's default, so the upload path and
    // the row it belongs to agree before either exists — see 0017 section 4.
    const id = crypto.randomUUID()
    const stamp = Date.now()

    const uploads: [keyof ApplicationSubmission['files'], File | null][] = [
      ['photo', form.files.photo], ['pan', form.files.pan],
      ['aadhaar', form.files.aadhaar], ['bank_proof', form.files.bank_proof],
      ['relieving_letter', form.files.relieving_letter],
      ['signature', form.files.signature],
      ['experience_letter', form.files.experience_letter],
      ['salary_slip', form.files.salary_slip],
    ]
    const attached = uploads.filter((u): u is [keyof ApplicationSubmission['files'], File] => u[1] != null)
    const paths: Record<string, string | null> = {}
    for (const [key, file] of uploads) if (!file) paths[key] = null

    // Shrink first, so the progress count reflects real uploading rather than
    // stalling at "1 of 5" while the biggest photo is still being resampled.
    onProgress?.('Preparing…')
    const prepared = await Promise.all(attached.map(async ([key, file]) => [key, await shrink(file)] as const))

    // Uploaded together, not one after another. They are independent, and
    // five round-trips serialised is five times the handshake latency for no
    // reason. `done` is counted rather than indexed because they finish out
    // of order — the number is "how many are up", not "which one is going".
    let done = 0
    const total = prepared.length
    onProgress?.(`Uploading 0 of ${total}…`)
    const results = await Promise.all(prepared.map(async ([key, file]) => {
      const path = `${id}/${key}-${stamp}-${safeName(file.name)}`
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file)
      done += 1
      onProgress?.(`Uploading ${done} of ${total}…`)
      return { key, path, upErr }
    }))
    const failed = results.find((r) => r.upErr)
    if (failed) return `Could not upload ${String(failed.key).replace('_', ' ')}: ${failed.upErr!.message}`
    for (const r of results) paths[r.key] = r.path

    onProgress?.('Saving…')

    // full_name stays the column every other screen already reads; the paper
    // form asks for the two halves, so it is built from them rather than
    // asked for a third time.
    const fullName = `${form.firstName.trim()} ${form.lastName.trim()}`.trim()

    // A blank row the candidate tabbed through is not an answer — drop it
    // rather than storing empty objects HR has to read past.
    const education = form.education.filter((r) => r.examination.trim() || r.institution.trim())
    const employmentHistory = form.employmentHistory.filter((r) => r.company.trim() || r.designation.trim())
    const languages = form.languages.filter((r) => r.language.trim())

    const { error: err } = await supabase.from('job_applications').insert({
      id,
      full_name: fullName,
      first_name: form.firstName.trim(),
      last_name: form.lastName.trim(),
      father_or_husband: form.fatherOrHusband.trim(),
      gender: form.gender,
      date_of_birth: form.dateOfBirth || null,
      place_of_birth: form.placeOfBirth.trim(),
      nationality: form.nationality.trim(),
      religion: form.religion.trim(),
      marital_status: form.maritalStatus,
      dependents: form.dependents.trim(),
      aadhaar_number: form.aadhaarNumber.trim(),
      pan_number: form.panNumber.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      position_interest: form.positionInterest.trim(),
      present_address: form.presentAddress.trim(),
      permanent_address: form.permanentAddress.trim(),
      pincode: form.pincode.trim(),
      education,
      technical_qualification: form.technicalQualification.trim(),
      employment_history: employmentHistory,
      bank_name: form.bankName.trim(),
      bank_account_name: form.bankAccountName.trim(),
      bank_account_no: form.bankAccountNo.trim(),
      bank_ifsc: form.bankIfsc.trim().toUpperCase(),
      languages,
      reference_name: form.referenceName.trim(),
      reference_department: form.referenceDepartment.trim(),
      // Sent as a marker only — 0020's trigger overwrites both with the
      // server's own now(), because "when did they agree" must not come
      // from a clock the applicant controls.
      declaration_accepted_at: form.declarationAccepted ? new Date().toISOString() : null,
      terms_accepted_at: form.termsAccepted ? new Date().toISOString() : null,
      no_previous_employment: form.noPreviousEmployment,
      photo_path: paths.photo,
      pan_path: paths.pan,
      aadhaar_path: paths.aadhaar,
      bank_proof_path: paths.bank_proof,
      relieving_letter_path: paths.relieving_letter,
      signature_path: paths.signature,
      experience_letter_path: paths.experience_letter,
      salary_slip_path: paths.salary_slip,
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
   *  server-side — this just invokes it and patches the one row it changed.
   *
   *  This used to `await load()` — a full re-select of every application —
   *  stacked directly on top of an Edge Function call that, before the same
   *  round's other fix, was already the slowest single thing in this app.
   *  The function's own response already says which row changed and to
   *  what (`employeeId`, `ok`); there is nothing a second network round trip
   *  would tell us that the first one didn't. */
  const approve = useCallback(async (id: string, details: ApprovalDetails): Promise<string | null> => {
    if (isDemo()) return 'This is a demo. Approving here cannot actually create a login.'

    // Optimistic, for the same reason as remove(): the Edge Function is slow
    // and the answer is not in doubt. The row reads "Approved" immediately and
    // reverts, loudly, if the function refuses.
    let before: JobApplication[] = []
    setRows((p) => {
      before = p
      return p.map((a) => (a.id === id ? { ...a, status: 'approved', decidedAt: new Date().toISOString() } : a))
    })

    const { data, error: err } = await supabase.functions.invoke('approve-job-application', {
      body: { applicationId: id, ...details },
    })
    // err.message here is the SDK's own generic "non-2xx status code" text,
    // not what the function said — see functionErrorMessage's own comment.
    const message = err ? await functionErrorMessage(err) : data?.error ? String(data.error) : null
    if (message) { setRows(before); return message }

    // Only the employee id was genuinely unknown until now; patch that in.
    const employeeId = data?.employeeId as string | undefined
    if (employeeId) setRows((p) => p.map((a) => (a.id === id ? { ...a, employeeId } : a)))
    return null
  }, [])

  const resend = useCallback(async (id: string): Promise<string | null> => {
    if (isDemo()) return 'This is a demo. No email is actually sent here.'
    const { data, error: err } = await supabase.functions.invoke('approve-job-application', {
      body: { applicationId: id, resend: true },
    })
    if (err) return await functionErrorMessage(err)
    if (data?.error) return String(data.error)
    setRows((p) => p.map((a) => (a.id === id ? { ...a, inviteSentCount: a.inviteSentCount + 1 } : a)))
    return null
  }, [])

  /** Deletes a test or duplicate application outright — its own documents
   *  first (same bucket, same HR/owner delete policy 0017 already granted),
   *  then the row (0021). Deliberately allowed at ANY status: a rejected
   *  test entry is exactly as much clutter as a pending one, and an already-
   *  approved one is still just the APPLICATION — the employee it produced,
   *  if any, is a separate record with its own, harder, owner-only delete
   *  (delete-employee). Removing this row never touches that one; 0017's
   *  `employee_id ... on delete set null` only fires the other direction. */
  const remove = useCallback(async (app: JobApplication): Promise<string | null> => {
    if (isDemo()) { setRows((p) => p.filter((a) => a.id !== app.id)); return null }

    // Optimistic, and the two calls no longer queue behind each other. The
    // documents and the row do not depend on one another — the row carries
    // the paths, which we already hold — so waiting for five file deletes
    // before asking Postgres to drop one row was pure serialised latency.
    let before: JobApplication[] = []
    setRows((p) => { before = p; return p.filter((a) => a.id !== app.id) })

    const paths = [
      app.photoPath, app.panPath, app.aadhaarPath, app.bankProofPath, app.relievingLetterPath,
      app.signaturePath, app.experienceLetterPath, app.salarySlipPath,
    ].filter((p): p is string => !!p)
    const [, rowRes] = await Promise.all([
      paths.length > 0 ? supabase.storage.from(BUCKET).remove(paths) : Promise.resolve(null),
      supabase.from('job_applications').delete().eq('id', app.id),
    ])
    if (rowRes.error) { setRows(before); return rowRes.error.message }
    return null
  }, [])

  const documentUrl = useCallback(async (path: string | null): Promise<string | null> => {
    if (!path || isDemo()) return null
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60)
    return data?.signedUrl ?? null
  }, [])

  return { rows, loading, error, reload: () => load(true), submit, reject, approve, resend, remove, documentUrl, clearError: () => setError(null) }
}

export type JobApplications = ReturnType<typeof useJobApplications>
