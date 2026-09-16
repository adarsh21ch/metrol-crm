import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isConfigured = Boolean(url && anon)

// || rather than ??: an unset Vite variable arrives as an empty string, and
// createClient throws on an empty key — which took the whole app to a blank page.
export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  anon || 'placeholder-anon-key',
  { auth: { persistSession: true, autoRefreshToken: true } },
)

/**
 * Sign out, and actually mean it.
 *
 * `supabase.auth.signOut()` defaults to `scope: 'global'`, which POSTs to
 * /auth/v1/logout — and when that POST fails (an expired or already-revoked
 * refresh token is the ordinary case, not an exotic one) supabase-js RETURNS
 * the error and leaves the stored session exactly where it was. Every call
 * site in this app was `void supabase.auth.signOut()`, so the error went
 * nowhere, `onAuthStateChange` never fired, and the button did nothing at all
 * — no spinner, no message, no sign-out. That is what Adarsh hit.
 *
 * There is no state in which pressing Sign out should leave somebody signed
 * in, so this degrades rather than gives up: try the server, fall back to a
 * local-only sign-out, and failing even that, drop the stored token by hand
 * and reload. `void`-ing the result is what hid this for months; nothing here
 * swallows an error without doing something about it.
 */
export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut()
  if (!error) return
  console.warn('[signOut] global sign-out failed, falling back to local:', error.message)

  const { error: localErr } = await supabase.auth.signOut({ scope: 'local' })
  if (!localErr) return
  console.warn('[signOut] local sign-out failed too, clearing the token by hand:', localErr.message)

  try {
    // supabase-js stores the session under `sb-<project-ref>-auth-token`.
    // Matched by shape rather than by building the key from the URL, so it
    // still works if the client is ever pointed somewhere else.
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('sb-') && k.includes('-auth-token')) localStorage.removeItem(k)
    }
  } catch { /* private mode can throw on access; the reload is the real fallback */ }
  location.reload()
}
