// Metrol CRM — Round 4: emailing one payslip.
//
// Same reason approve-job-application is server-side (see that file's own
// header): sending mail needs the Resend API key, which must never be
// compiled into the browser bundle, and reading a payslip that is not the
// caller's own needs to check HR/owner — which RLS on salary_records (0010)
// already does, but this function reads it a second time by hand anyway,
// the same defensive shape approve-job-application uses, because it also
// reads the EMPLOYEE row underneath to get an address to send to.
//
// DEPLOY: paste this whole file into Supabase Dashboard → Edge Functions →
// New function → name it exactly "send-payslip-email" → Deploy. It reuses
// the RESEND_API_KEY secret approve-job-application already has — no new
// secret to add.

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
function fmtPeriod(period: string): string {
  const d = new Date(period + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return period
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

  const authHeader = req.headers.get('Authorization') ?? ''
  const callerToken = authHeader.replace(/^Bearer\s+/i, '')
  if (!callerToken) return json({ error: 'Sign in required.' }, 401)

  const asCaller = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${callerToken}` } },
  })
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE)

  const { data: callerUser, error: callerErr } = await asCaller.auth.getUser()
  if (callerErr || !callerUser?.user) return json({ error: 'Could not verify who is calling this.' }, 401)
  const callerId = callerUser.user.id

  // Reproduces is_owner()/is_hr() by hand, same as approve-job-application —
  // this connection uses the service role, so RLS (and those functions
  // running AS the caller) does not apply to it.
  const { data: callerProfile } = await admin
    .from('profiles').select('role, department_id').eq('id', callerId).single()
  let isPrivileged = callerProfile?.role === 'owner'
  if (!isPrivileged && callerProfile?.department_id) {
    const { data: dept } = await admin
      .from('departments').select('name').eq('id', callerProfile.department_id).single()
    isPrivileged = dept?.name === 'Human Resources'
  }
  if (!isPrivileged) return json({ error: 'Only HR or the owner can do this.' }, 403)

  if (!RESEND_API_KEY) return json({ error: 'RESEND_API_KEY is not set. Add it under Edge Functions → Manage secrets.' }, 500)

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'Bad request body.' }, 400) }
  const salaryRecordId = String(body.salaryRecordId ?? '')
  if (!salaryRecordId) return json({ error: 'salaryRecordId is required.' }, 400)

  const { data: slip, error: slipErr } = await admin
    .from('salary_records').select('*').eq('id', salaryRecordId).single()
  if (slipErr || !slip) return json({ error: 'That payslip no longer exists.' }, 404)

  const { data: emp, error: empErr } = await admin
    .from('employees').select('full_name, employee_code, work_email, personal_email').eq('id', slip.employee_id).single()
  if (empErr || !emp) return json({ error: 'The employee this payslip belongs to no longer exists.' }, 404)

  const to = (emp.work_email || emp.personal_email || '').trim()
  if (!to) return json({ error: `${emp.full_name} has no email address on file to send this to.` }, 400)

  const period = fmtPeriod(String(slip.period))
  const notesHtml = slip.notes
    ? `<p style="color:#555">${escapeHtml(String(slip.notes))}</p>`
    : ''

  const html = `
    <p>Hi ${escapeHtml(emp.full_name)},</p>
    <p>Your payslip for <strong>${escapeHtml(period)}</strong> is ready.</p>
    <table cellpadding="6" style="border-collapse:collapse">
      <tr><td>Gross amount</td><td><strong>&#8377;${Number(slip.gross_amount).toLocaleString('en-IN')}</strong></td></tr>
      <tr><td>Net amount</td><td><strong>&#8377;${Number(slip.net_amount).toLocaleString('en-IN')}</strong></td></tr>
      <tr><td>Status</td><td>${slip.status === 'paid' ? 'Paid' : 'Being processed'}</td></tr>
    </table>
    ${notesHtml}
    <p>Employee ID: ${escapeHtml(String(emp.employee_code ?? ''))}</p>
    <p>Questions about this payslip go to HR, not to this email.</p>
    <p>— Metrol Media HR</p>
  `

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Metrol Media HR <hr@metrol.in>', to: [to],
      subject: `Your ${period} payslip — Metrol Media`, html,
    }),
  })
  if (!res.ok) return json({ error: `Resend rejected the email (${res.status}): ${await res.text()}` }, 502)

  await admin.from('salary_records').update({
    payslip_sent_count: (slip.payslip_sent_count ?? 0) + 1,
    payslip_sent_at: new Date().toISOString(),
  }).eq('id', salaryRecordId)

  return json({ ok: true })
})
