// Metrol CRM — push delivery for the Agency OS hand-offs (0044, 2026-09-26).
//
// send-push pushes a broadcast HR/owner wrote; notify-approvers pushes an
// employee's request to HR/owner. Both are told WHAT to say by their caller.
// This one is told nothing: the database has already decided who hears what
// — a task handed on (golden rule), a task nobody could take, a comment, an
// overdue task — and written those rows into `notifications`. This function
// only delivers them: every task notification from the last 15 minutes that
// has not been pushed yet, each stamped `pushed_at` first so it goes once.
//
// That is why any signed-in person may call it (the app does, right after
// anything that can hand work on): the caller chooses neither the words nor
// the people. The worst a call can do is deliver pending rows sooner.
//
// DEPLOY: paste this whole file into Supabase Dashboard → Edge Functions →
// New function → name it exactly "push-notifications" → Deploy. It reads the
// SAME VAPID_PRIVATE_KEY / VAPID_SUBJECT secrets send-push already has —
// nothing new to add under Manage secrets. Until it is deployed the in-app
// bell still shows every one of these; only the phone push waits.

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** Only the types 0044 writes; the older ones are pushed by their own functions. */
const TYPES = ['task_assigned', 'task_unassigned', 'task_overdue', 'task_comment']

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

  const callerToken = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!callerToken) return json({ error: 'Sign in required.' }, 401)
  const asCaller = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${callerToken}` } },
  })
  const { data: callerUser, error: callerErr } = await asCaller.auth.getUser()
  if (callerErr || !callerUser?.user) return json({ error: 'Could not verify who is calling this.' }, 401)

  if (!VAPID_PRIVATE_KEY) return json({ error: 'VAPID_PRIVATE_KEY is not set. Add it under Edge Functions → Manage secrets.' }, 500)
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE)

  // Claim first, in one statement: two callers at once cannot both take a
  // row, because the second one's "pushed_at is null" no longer matches.
  const since = new Date(Date.now() - 15 * 60_000).toISOString()
  const { data: rows, error: claimErr } = await admin
    .from('notifications')
    .update({ pushed_at: new Date().toISOString() })
    .in('type', TYPES)
    .is('pushed_at', null)
    .gte('created_at', since)
    .select('id, recipient_employee_id, title, body')
  if (claimErr) return json({ error: claimErr.message }, 500)
  if (!rows || rows.length === 0) return json({ ok: true, sent: 0 })

  const recipients = [...new Set(rows.map((r) => r.recipient_employee_id as string))]
  const { data: subs } = await admin
    .from('push_subscriptions').select('id, employee_id, endpoint, p256dh, auth').in('employee_id', recipients)
  if (!subs || subs.length === 0) return json({ ok: true, sent: 0, note: 'Nobody told has notifications on a device yet.' })

  let sent = 0
  const dead = new Set<string>()
  await Promise.all(rows.flatMap((n) => subs
    .filter((s) => s.employee_id === n.recipient_employee_id)
    .map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: n.title, body: n.body }),
        )
        sent++
      } catch (e) {
        // 404/410: the browser threw this subscription away — stop trying it.
        const status = (e as { statusCode?: number })?.statusCode
        if (status === 404 || status === 410) dead.add(s.id)
      }
    })))
  if (dead.size > 0) await admin.from('push_subscriptions').delete().in('id', [...dead])

  return json({ ok: true, sent, expired: dead.size })
})
