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
