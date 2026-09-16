// Metrol CRM — Phase 8: approving a job application.
//
// This is the project's first server-side code (see CLAUDE.md, the Phase 8
// handoff). It exists because of ONE constraint: creating a login needs the
// Supabase Admin API, which needs the service role key, and a key with that
// power must never be compiled into the browser bundle. So this function
// does everything the browser is not allowed to do:
//
//   1. Check the caller is actually HR or the owner (RLS on job_applications
//      would allow the update, but this function bypasses RLS entirely via
//      the service role, so it re-checks by hand).
//   2. Create the auth user (no password — they set their own, via the link
//      mailed to them). This fires 0001's handle_new_user trigger, which
//      creates their profiles row.
//   3. Insert the employees row HR just filled in on the review screen.
//      This fires 0006's employee_code trigger (a random 4-digit code) and
//      0011's onboarding-checklist trigger.
//   4. Copy the five documents from the quarantined 'job-applications'
//      bucket into 'employee-documents', row per document, then delete the
//      quarantined copies — a stranger's upload must not go on existing
//      next to a real employee's PAN card one second longer than it has to.
//   5. Generate a password-set link and email it, with the employee's new
//      4-digit code, via Resend — from hr@metrol.in, a domain already
//      verified in the Resend account (Adarsh confirmed this 2026-09-12).
//   6. Mark the application approved.
//
// `resend: true` in the body skips 1–4 (the employee already exists) and
// only repeats step 5, for a bounced or expired first email.
//
// DEPLOY: paste this whole file into Supabase Dashboard → Edge Functions →
// New function → name it exactly "approve-job-application" → Deploy. Then
// add ONE secret under Edge Functions → Manage secrets: RESEND_API_KEY. Do
// not put it in .env, and never with a VITE_ prefix — see the constraint at
// the top of this comment.

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

const QUARANTINE_BUCKET = 'job-applications'
const DOCS_BUCKET = 'employee-documents'

const DOC_MAP: { pathCol: string; docType: string }[] = [
  { pathCol: 'photo_path', docType: 'photo' },
  { pathCol: 'pan_path', docType: 'pan' },
  { pathCol: 'aadhaar_path', docType: 'aadhaar' },
  { pathCol: 'bank_proof_path', docType: 'bank_proof' },
  { pathCol: 'relieving_letter_path', docType: 'other' },
]

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

  const authHeader = req.headers.get('Authorization') ?? ''
  const callerToken = authHeader.replace(/^Bearer\s+/i, '')
  if (!callerToken) return json({ error: 'Sign in required.' }, 401)

  // Two clients on purpose: one that only ever acts as the caller (to find
  // out who they are), one that acts as the service role (to do the actual
  // writes). Neither is used for the other's job.
  const asCaller = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${callerToken}` } },
  })
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE)

  const { data: callerUser, error: callerErr } = await asCaller.auth.getUser()
  if (callerErr || !callerUser?.user) return json({ error: 'Could not verify who is calling this.' }, 401)
  const callerId = callerUser.user.id

  // Reproduces is_owner()/is_hr() by hand, since this connection uses the
  // service role and RLS (and therefore those functions running AS the
  // caller) does not apply to it.
  const { data: callerProfile } = await admin
    .from('profiles').select('role, department_id').eq('id', callerId).single()
  let isPrivileged = callerProfile?.role === 'owner'
  if (!isPrivileged && callerProfile?.department_id) {
    const { data: dept } = await admin
      .from('departments').select('name').eq('id', callerProfile.department_id).single()
    isPrivileged = dept?.name === 'Human Resources'
  }
  if (!isPrivileged) return json({ error: 'Only HR or the owner can do this.' }, 403)

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'Bad request body.' }, 400) }

  const applicationId = String(body.applicationId ?? '')
  if (!applicationId) return json({ error: 'applicationId is required.' }, 400)

  const { data: app, error: appErr } = await admin
    .from('job_applications').select('*').eq('id', applicationId).single()
  if (appErr || !app) return json({ error: 'That application no longer exists.' }, 404)

  if (body.resend) {
    if (app.status !== 'approved') {
      return json({ error: 'Only an already-approved application can be resent.' }, 400)
    }
    // These used to be ONE combined check with one generic message, which is
    // exactly what Adarsh hit: an application that reads "Approved" on
    // screen, with a genuinely different, discoverable reason underneath.
    // 0017's own FK is `employee_id ... on delete set null` — the moment
    // delete-employee removes the employee this application produced,
    // Postgres sets employee_id back to null BY ITSELF. Nothing marks the
    // application as changed; it still says "Approved", because it was — the
    // decision stands, only the record it created is gone. Worth saying so
    // rather than making this read like the application was never approved
    // at all.
    if (!app.employee_id) {
      return json({ error: 'This application is approved, but the employee record it created has since been deleted — there is no login left to invite.' }, 400)
    }
    const { data: emp } = await admin.from('employees').select('employee_code').eq('id', app.employee_id).single()
    const sent = await sendInviteEmail({ email: app.email, fullName: app.full_name, employeeCode: emp?.employee_code ?? '', supabaseUrl: SUPABASE_URL, admin, resendKey: RESEND_API_KEY })
    if (sent.error) return json({ error: sent.error }, 502)
    await admin.from('job_applications').update({
      invite_sent_count: (app.invite_sent_count ?? 0) + 1, invite_sent_at: new Date().toISOString(),
    }).eq('id', applicationId)
    return json({ ok: true, resent: true })
  }

  if (app.status !== 'pending') return json({ error: 'This application was already decided.' }, 400)

  const departmentId = body.departmentId ? String(body.departmentId) : null
  const designation = String(body.designation ?? '').trim()
  const employmentType = String(body.employmentType ?? 'full_time')
  const officeId = body.officeId ? String(body.officeId) : null
  const shiftId = body.shiftId ? String(body.shiftId) : null
  const dateOfJoining = String(body.dateOfJoining ?? '')
  const grossAmount = Number(body.grossAmount) || 0
  const netAmount = Number(body.netAmount) || 0
  const annualLeaveDays = Number(body.annualLeaveDays) || 18
  if (!designation || !dateOfJoining) return json({ error: 'Designation and date of joining are required.' }, 400)

  // 2. the login. No password: `type: 'recovery'` below hands them a link to
  // set one, and the account is usable only from that point.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: app.email, email_confirm: true, user_metadata: { name: app.full_name },
  })
  if (createErr || !created?.user) return json({ error: `Could not create the login: ${createErr?.message ?? 'unknown error'}` }, 502)
  const profileId = created.user.id

  // 3. the employee record. profile_id links it to the login just made;
  // employees_set_code (0015) and employees_seed_onboarding (0011) fire on
  // this insert exactly as they would from the HR directory's own form.
  const { data: employee, error: empErr } = await admin.from('employees').insert({
    profile_id: profileId,
    full_name: app.full_name,
    designation,
    department_id: departmentId,
    employment_type: employmentType,
    date_of_joining: dateOfJoining,
    work_email: app.email,
    phone: app.phone,
    // The only two paper-form fields that already have a home on `employees`
    // and mean exactly the same thing there. Carrying them means HR does not
    // re-type what the candidate already wrote. The other ~20 fields from the
    // joining form stay on the application on purpose — giving them a home
    // here would mean new columns on `employees`, which is Adarsh's call.
    date_of_birth: app.date_of_birth ?? null,
    address: app.present_address ?? '',
    office_id: officeId,
    shift_id: shiftId,
    annual_leave_days: annualLeaveDays,
    offer_extended_on: new Date().toISOString().slice(0, 10),
    offer_accepted_on: new Date().toISOString().slice(0, 10),
    created_by: callerId,
  }).select('*').single()
  if (empErr || !employee) {
    // The login now exists with no employee behind it — worth cleaning up
    // rather than leaving an orphan auth user from a failed approval.
    await admin.auth.admin.deleteUser(profileId)
    return json({ error: `Could not create the employee record: ${empErr?.message ?? 'unknown error'}` }, 502)
  }

  if (grossAmount > 0 || netAmount > 0) {
    await admin.from('salary_records').insert({
      employee_id: employee.id, period: dateOfJoining.slice(0, 7) + '-01',
      gross_amount: grossAmount, net_amount: netAmount, status: 'pending',
    })
  }

  // 4. move the documents out of quarantine — the FIVE FILES TOGETHER, not one
  // after another. This used to be a plain `for` loop: download, upload,
  // insert, remove, four awaited round-trips per document, all five documents
  // serialised. That was the single biggest reason Approve felt frozen —
  // measured, not guessed, the same class of bug as the Submit-side slowness
  // fixed earlier the same day. Each file's own four steps must still run in
  // order (you cannot upload a download that has not finished), but the five
  // FILES have never depended on each other, so they now run concurrently.
  await Promise.all(DOC_MAP.map(async ({ pathCol, docType }) => {
    const srcPath = app[pathCol] as string | null
    if (!srcPath) return
    const { data: file, error: dlErr } = await admin.storage.from(QUARANTINE_BUCKET).download(srcPath)
    if (dlErr || !file) return
    const fileName = srcPath.split('/').pop() ?? docType
    const destPath = `${employee.id}/${fileName}`
    const { error: upErr } = await admin.storage.from(DOCS_BUCKET).upload(destPath, file, { upsert: true })
    if (upErr) return
    await admin.from('employee_documents').insert({
      employee_id: employee.id, doc_type: docType, file_name: fileName, file_path: destPath, uploaded_by: callerId,
    })
    await admin.storage.from(QUARANTINE_BUCKET).remove([srcPath])
  }))

  // 5. mark it decided NOW, before the email. HR is waiting on THIS response —
  // the login and the employee record already exist, which is the part HR
  // actually needs back. The email is between us and Resend, an external
  // service on the other side of the internet that HR has no way to make
  // faster; making them wait on it was never buying anything.
  await admin.from('job_applications').update({
    status: 'approved', decided_by: callerId, decided_at: new Date().toISOString(),
    employee_id: employee.id,
  }).eq('id', applicationId)

  // 6. the email, sent AFTER the response goes back rather than before it —
  // `EdgeRuntime.waitUntil` keeps the function alive to finish this even
  // though the HTTP response has already returned. If Resend is slow, or
  // down, HR still sees "approved" the moment the real work is done; the
  // invite_sent_count/at columns update quietly once the send actually
  // finishes, and "Resend invite email" on this application already exists
  // for a bounced or a genuinely failed first attempt.
  const emailTask = (async () => {
    const sent = await sendInviteEmail({ email: app.email, fullName: app.full_name, employeeCode: employee.employee_code, supabaseUrl: SUPABASE_URL, admin, resendKey: RESEND_API_KEY })
    await admin.from('job_applications').update({
      invite_sent_count: sent.error ? 0 : 1,
      invite_sent_at: sent.error ? null : new Date().toISOString(),
    }).eq('id', applicationId)
  })()
  // @ts-ignore — EdgeRuntime is a Deno Deploy / Supabase Edge Functions
  // global, not a type `npm:@supabase/supabase-js` or Deno's own lib knows
  // about. Where it is not present (local `supabase functions serve`,
  // older runtimes) the task above still runs — it was already started —
  // this only controls whether the platform is told to keep the isolate
  // alive for it, so nothing breaks either way, and nothing is awaited here.
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(emailTask)

  return json({ ok: true, employeeId: employee.id })
})

async function sendInviteEmail(args: {
  email: string; fullName: string; employeeCode: string; supabaseUrl: string
  admin: ReturnType<typeof createClient>; resendKey: string | undefined
}): Promise<{ error: string | null }> {
  if (!args.resendKey) return { error: 'RESEND_API_KEY is not set. Add it under Edge Functions → Manage secrets.' }

  const { data: link, error: linkErr } = await args.admin.auth.admin.generateLink({
    type: 'recovery', email: args.email,
  })
  if (linkErr || !link) return { error: `Could not create the set-password link: ${linkErr?.message ?? 'unknown error'}` }
  const actionLink = link.properties?.action_link
  if (!actionLink) return { error: 'The password link came back empty.' }

  const html = `
    <p>Hi ${escapeHtml(args.fullName)},</p>
    <p>Welcome to Metrol Media. Your employee ID is <strong>${escapeHtml(args.employeeCode)}</strong> —
    you will use it to sign in to the team CRM.</p>
    <p><a href="${actionLink}">Set your password</a> to finish setting up your account.</p>
    <p>If the button does not work, copy this link into your browser:<br>${actionLink}</p>
    <p>— Metrol Media HR</p>
  `

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${args.resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Metrol Media HR <hr@metrol.in>', to: [args.email],
      subject: 'Welcome to Metrol Media — set your password', html,
    }),
  })
  if (!res.ok) return { error: `Resend rejected the email (${res.status}): ${await res.text()}` }
  return { error: null }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
