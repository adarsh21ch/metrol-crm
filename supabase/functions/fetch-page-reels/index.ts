// Metrol CRM — the page-analytics dashboard's own fetch
// (PAGE-ANALYTICS-DASHBOARD-PLAN.md, 2026-09-22 brief).
//
// Takes a pageId, resolves its handle, calls Apify's apify/instagram-reel-
// scraper for that profile's most recent reels, and upserts them into
// page_reels. Then — the part that also closes the "views not checked yet"
// gap on incentive claims — for every fetched reel, looks for an
// incentive_claims row on the SAME page whose reel_url matches, and updates
// its views. The existing set_incentive_tier trigger (0031/0032) recomputes
// the tier the moment views changes, so a matching claim goes from "Below
// threshold" to a real tier with no HR typing required. A claim with no
// matching reel (private, deleted, URL typo) is untouched — HR's manual
// "Save views" stays the fallback, on purpose.
//
// DEPLOY: paste this whole file into Supabase Dashboard → Edge Functions →
// New function → name it exactly "fetch-page-reels" → Deploy. Reuses the
// APIFY_API_KEY secret fetch-instagram-profile already has — no new secret.

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

// Two rounds of guessing the exact field name Apify uses for views were
// both wrong, live, on a real account — the actor's actual output isn't
// fully documented and apparently drifts from its own published schema.
// Rather than guess a third time, this SEARCHES the reel's own keys for
// anything that looks like the metric wanted and is a number — resilient to
// whatever Apify actually calls it, today or after it changes again.
type ApifyReel = Record<string, unknown>

/** A count can arrive as a plain number, a numeric string, or Instagram's own
 *  GraphQL wrapper shape ({ count: 42 }) — all three are the same fact. */
function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value)
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const c = (value as Record<string, unknown>).count
    if (typeof c === 'number') return c
  }
  return null
}

/** Searches an object (and, up to 3 levels, its nested objects) for the first
 *  key matching `pattern` that carries a usable number. Nested because
 *  Instagram's own payloads bury counts inside sub-objects, and two rounds of
 *  guessing flat camelCase field names were both wrong on real data. */
function pickNumber(obj: unknown, pattern: RegExp, depth = 0): number | null {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj) || depth > 3) return null
  const entries = Object.entries(obj as Record<string, unknown>)
  for (const [key, value] of entries) {
    if (!pattern.test(key)) continue
    const n = asNumber(value)
    if (n != null) return n
  }
  for (const [, value] of entries) {
    const hit = pickNumber(value, pattern, depth + 1)
    if (hit != null) return hit
  }
  return null
}

/** Patterns are tried in order, so the most specific name wins over a loose
 *  substring match — "videoViewCount" before anything merely containing
 *  "view". */
function findNumber(r: ApifyReel, patterns: RegExp[]): number | null {
  for (const pattern of patterns) {
    const hit = pickNumber(r, pattern)
    if (hit != null) return hit
  }
  return null
}

const VIEW_PATTERNS = [/videoview/i, /video_view/i, /viewcount/i, /view_count/i, /videoplay/i, /video_play/i, /playcount/i, /play_count/i, /view/i, /play/i]
const LIKE_PATTERNS = [/likescount/i, /likes_count/i, /likecount/i, /like/i]
const COMMENT_PATTERNS = [/commentscount/i, /comments_count/i, /commentcount/i, /comment/i]
const SHARE_PATTERNS = [/sharescount/i, /shares_count/i, /reshare/i, /share/i]

// Lower than the plan's original 25 (2026-09-22, live): a real 25-reel scrape
// ran long enough that the connection to this function was cut before it
// could respond — each reel is its own page Apify has to visit, so this is
// a genuine time cost, not a bug. 10 finishes reliably inside a normal
// request's time budget; raise it again once a background/async job queue
// exists to run a longer fetch without the caller waiting on the connection.
const RESULTS_LIMIT = 10

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const APIFY_API_KEY = Deno.env.get('APIFY_API_KEY')

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

  // Same privilege recheck fetch-instagram-profile already uses — the three
  // people who can write to pages can refresh its reels.
  const { data: callerProfile } = await admin
    .from('profiles').select('role, department_id, is_team_lead').eq('id', callerId).single()
  let isPrivileged = callerProfile?.role === 'owner'
  if (!isPrivileged && callerProfile?.department_id) {
    const { data: dept } = await admin
      .from('departments').select('name').eq('id', callerProfile.department_id).single()
    isPrivileged = dept?.name === 'Human Resources'
      || (!!callerProfile.is_team_lead && dept?.name === 'Content and Marketing')
  }
  if (!isPrivileged) return json({ error: 'Only HR, the owner, or the Content & Marketing lead can do this.' }, 403)

  if (!APIFY_API_KEY) return json({ error: 'APIFY_API_KEY is not set. Add it under Edge Functions → Manage secrets.' }, 500)

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'Bad request body.' }, 400) }
  const pageId = String(body.pageId ?? '')
  if (!pageId) return json({ error: 'pageId is required.' }, 400)

  const { data: page, error: pageErr } = await admin
    .from('pages').select('id, instagram_handle').eq('id', pageId).single()
  if (pageErr || !page) return json({ error: 'That page no longer exists.' }, 404)
  const handle = String(page.instagram_handle ?? '').replace(/^@/, '').trim()
  if (!handle) return json({ error: 'This page has no Instagram handle on file yet — add one first.' }, 400)

  /** One synchronous Apify actor run, returning its dataset items. */
  const runActor = async (actorId: string, input: unknown): Promise<{ items: ApifyReel[] | null; status: number }> => {
    try {
      const res = await fetch(
        `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${APIFY_API_KEY}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) },
      )
      if (!res.ok) return { items: null, status: res.status }
      const data = await res.json()
      return { items: Array.isArray(data) ? (data as ApifyReel[]) : null, status: res.status }
    } catch {
      return { items: null, status: 0 }
    }
  }

  // includeSharesCount is an explicit opt-in on this actor — without it the
  // shares field never appears at all.
  const reelRun = await runActor('apify~instagram-reel-scraper', {
    username: [handle],
    resultsLimit: RESULTS_LIMIT,
    includeSharesCount: true,
  })
  if (!reelRun.items) {
    return json({
      error: reelRun.status
        ? `Instagram lookup failed (${reelRun.status}). Check the handle and try again.`
        : 'Could not reach Instagram right now. Try again in a moment.',
    }, 502)
  }
  const items = reelRun.items
  if (items.length === 0) {
    return json({ fetched: 0, matchedClaims: 0, warning: 'No reels came back for this handle — it may be private or have none.' })
  }

  const str = (v: unknown) => (typeof v === 'string' && v ? v : null)

  const rows = items.map((r) => {
    const shortCode = str(r.shortCode) ?? str(r.code) ?? ''
    return {
      page_id: pageId,
      short_code: shortCode,
      reel_url: str(r.url) ?? (shortCode ? `https://www.instagram.com/reel/${shortCode}/` : ''),
      caption: str(r.caption),
      // -1 is a real Instagram value here, not missing data — a creator can
      // hide their like count and the API reports exactly -1 for that.
      views: findNumber(r, VIEW_PATTERNS),
      likes: findNumber(r, LIKE_PATTERNS),
      comments: findNumber(r, COMMENT_PATTERNS),
      shares: findNumber(r, SHARE_PATTERNS),
      thumbnail_url: str(r.displayUrl) ?? str(r.thumbnailUrl),
      posted_at: str(r.timestamp),
      fetched_at: new Date().toISOString(),
    }
  }).filter((r) => r.short_code && r.reel_url)

  /* The reel scraper returns no play counts AT ALL — proven on 25 real
   * reels (likes and comments on every one, views and shares on none) and
   * confirmed by its own input form, which offers transcript, downloads and
   * shares but nothing for views. Apify's flagship instagram-scraper DOES
   * carry them, so when the reel run comes back without a single view this
   * fetches the same profile's posts from that actor and merges the counts
   * in by shortCode — the one id both actors agree on.
   *
   * Only runs when it has to: a page whose reels already carry views never
   * pays for the second run. */
  let viewSource: 'reels' | 'posts' | null = rows.some((r) => r.views != null) ? 'reels' : null
  let postItems: ApifyReel[] | null = null
  if (!viewSource) {
    const postRun = await runActor('apify~instagram-scraper', {
      directUrls: [`https://www.instagram.com/${handle}/`],
      resultsType: 'posts',
      resultsLimit: RESULTS_LIMIT,
      addParentData: false,
    })
    postItems = postRun.items
    if (postItems?.length) {
      const viewsByCode = new Map<string, number>()
      for (const p of postItems) {
        const code = str(p.shortCode) ?? str(p.code) ?? ''
        const v = findNumber(p, VIEW_PATTERNS)
        if (code && v != null) viewsByCode.set(code, v)
      }
      for (const row of rows) {
        const v = viewsByCode.get(row.short_code)
        if (v != null) row.views = v
      }
      if (rows.some((r) => r.views != null)) viewSource = 'posts'
    }
  }

  const { error: upsertErr } = await admin.from('page_reels').upsert(rows, { onConflict: 'page_id,short_code' })
  if (upsertErr) return json({ error: upsertErr.message }, 500)

  // A refresh only ever touches the current RESULTS_LIMIT most recent
  // reels — a row from an OLDER, larger fetch (like the 25-reel run before
  // this fix existed) never gets revisited and sits there with stale/null
  // views forever, permanently showing "—" no matter how many times the
  // page is refreshed (Adarsh, 2026-09-22, live: 27 stored, only 10 ever
  // updated). The table should show exactly the current fetch, not an
  // ever-growing pile where old rows rot — so anything for this page NOT in
  // the batch just fetched is removed rather than left behind.
  const freshCodes = rows.map((r) => r.short_code)
  // Safe to join unescaped: an Instagram short_code is Apify's own id, never
  // user-typed, and never contains a comma or parenthesis — unlike a
  // caption, which is why only this field is built into the filter string.
  if (freshCodes.length > 0) {
    const { error: pruneErr } = await admin
      .from('page_reels').delete().eq('page_id', pageId).not('short_code', 'in', `(${freshCodes.join(',')})`)
    if (pruneErr) console.error('[fetch-page-reels] prune failed (non-fatal):', pruneErr.message)
  }

  // Fill in incentive_claims.views for any claim on this page whose
  // reel_url matches one just fetched — the trigger does the rest.
  let matchedClaims = 0
  const { data: claims } = await admin
    .from('incentive_claims').select('id, reel_url').eq('page_id', pageId).is('decided_at', null).eq('rejected', false)
  if (claims?.length) {
    for (const claim of claims) {
      const hit = rows.find((r) => claim.reel_url && r.reel_url && claim.reel_url.includes(r.short_code))
      if (hit?.views != null) {
        const { error: updErr } = await admin
          .from('incentive_claims').update({ views: hit.views, views_checked_at: new Date().toISOString() }).eq('id', claim.id)
        if (!updErr) matchedClaims++
      }
    }
  }

  // TEMPORARY, 2026-09-22: views keeps coming back null even after two
  // corrected field-name guesses, live, on a real account. Rather than
  // guess a third time, hand back the actual raw keys/values Apify sent for
  // one reel — visible right in the same popup — so the real field name can
  // be read off it directly instead of guessed at again. Remove this once
  // views are confirmed working.
  // Self-clearing: only returned when NOT ONE reel produced a view count,
  // which is the only case where the raw shape still needs looking at. Once
  // views come through, this stops being sent and the box stops appearing.
  const noViews = rows.length > 0 && rows.every((r) => r.views == null)
  // Shows whichever payload was tried LAST — if the posts fallback also came
  // back without views, its shape is the one worth looking at, not the reel
  // scraper's, which is already known not to carry them.
  const sampleSource = postItems?.[0] ?? items[0]
  const debugSample = noViews && sampleSource && typeof sampleSource === 'object'
    ? Object.fromEntries(
        Object.entries(sampleSource as Record<string, unknown>)
          .map(([k, v]) => [k, v && typeof v === 'object' ? JSON.stringify(v).slice(0, 120) : v])
          .slice(0, 40),
      )
    : null

  return json({ fetched: rows.length, matchedClaims, viewSource, debugSample })
})
