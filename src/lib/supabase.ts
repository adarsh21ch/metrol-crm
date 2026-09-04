import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

/** The app should say so plainly rather than fail with a network error later. */
export const isConfigured = Boolean(url && anon)

// These fall back with || rather than ??, because an unset Vite variable arrives
// as an empty string, not undefined — and createClient throws on an empty key,
// which took the whole app down to a blank page instead of the login screen.
export const supabase = createClient(url || 'https://placeholder.supabase.co', anon || 'placeholder-anon-key', {
  auth: { persistSession: true, autoRefreshToken: true },
})
