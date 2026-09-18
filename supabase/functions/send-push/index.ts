// Metrol CRM — real push notifications, the "proper" version Adarsh asked
// for (2026-09-18 PARKED note), not an in-app banner.
//
// Same shape as send-payslip-email: bearer token identifies the caller,
// a service-role connection re-checks is_owner()/is_hr() by hand (RLS does
// not apply to that connection, same reason approve-job-application does
// this), and only then does the privileged work. The in-app notifications
// row is already written by the time this runs — create_broadcast() (0025)
// is called first, client-side, and this function is invoked right after,
// fire-and-forget. If this fails, the in-app feed is still correct; this is
// best-effort delivery on top of it, not the record of truth.
//
// DEPLOY: paste this whole file into Supabase Dashboard → Edge Functions →
// New function → name it exactly "send-push" → Deploy. It needs its own two
// secrets that do not exist yet, added the same way RESEND_API_KEY was —
// Edge Functions → Manage secrets:
//   VAPID_PRIVATE_KEY   = (see CLAUDE.md's 2026-09-18 entry for the value)
//   VAPID_SUBJECT        = mailto:you@metrol.in

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')
  const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')
    ?? 'BHUJ78d5VEud5WybcQLKH_AcNHPQATWknciEoMyFycAh82kyIiy0EhhboyvizcR3SJE3WZn5av6dNGBpuaE4lSQ'
  const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:hr@metrol.in'

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

  // Reproduces is_owner()/is_hr() by hand, same as send-payslip-email — this
  // connection uses the service role, so RLS does not apply to it.
  const { data: callerProfile } = await admin
    .from('profiles').select('role, department_id').eq('id', callerId).single()
  let isPrivileged = callerProfile?.role === 'owner'
  if (!isPrivileged && callerProfile?.department_id) {
    const { data: dept } = await admin
      .from('departments').select('name').eq('id', callerProfile.department_id).single()
    isPrivileged = dept?.name === 'Human Resources'
  }
  if (!isPrivileged) return json({ error: 'Only HR or the owner can do this.' }, 403)

  if (!VAPID_PRIVATE_KEY) return json({ error: 'VAPID_PRIVATE_KEY is not set. Add it under Edge Functions → Manage secrets.' }, 500)
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'Bad request body.' }, 400) }
  const title = String(body.title ?? '').trim()
  const notifBody = String(body.body ?? '')
  const audience = String(body.audience ?? 'all')
  if (!title) return json({ error: 'title is required.' }, 400)

  let empQuery = admin.from('employees').select('id').eq('status', 'active')
  if (audience !== 'all') empQuery = empQuery.eq('department_id', audience)
  const { data: employees } = await empQuery
  const employeeIds = (employees ?? []).map((e) => e.id)
  if (employeeIds.length === 0) return json({ ok: true, sent: 0, note: 'No employees in that audience.' })

  const { data: subs } = await admin
    .from('push_subscriptions').select('id, endpoint, p256dh, auth').in('employee_id', employeeIds)
  if (!subs || subs.length === 0) return json({ ok: true, sent: 0, note: 'Nobody in that audience has notifications enabled on a device yet.' })

  const payload = JSON.stringify({ title, body: notifBody })
  let sent = 0
  const dead: string[] = []
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
      )
      sent++
    } catch (e) {
      // 404/410 means the browser itself has thrown this subscription away
      // (uninstalled, permission revoked) — clean it up rather than retrying
      // a dead endpoint on every future broadcast.
      const status = (e as { statusCode?: number })?.statusCode
      if (status === 404 || status === 410) dead.push(s.id)
    }
  }))
  if (dead.length > 0) await admin.from('push_subscriptions').delete().in('id', dead)

  return json({ ok: true, sent, expired: dead.length })
})
