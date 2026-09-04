/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
}
interface ImportMeta { readonly env: ImportMetaEnv }

/** SheetJS arrives from a script tag, not from npm. */
declare const XLSX: any
