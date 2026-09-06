import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { demoEmployeeDocuments, isDemo } from '@/data/demo'
import type { DocType, EmployeeDocument } from '@/lib/hr'

type Row = Record<string, unknown>

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v))

const toDoc = (r: Row): EmployeeDocument => ({
  id: str(r.id),
  employeeId: str(r.employee_id),
  docType: (r.doc_type as DocType) ?? 'other',
  fileName: str(r.file_name),
  filePath: str(r.file_path),
  uploadedBy: (r.uploaded_by as string | null) ?? null,
  uploadedAt: str(r.uploaded_at),
  notes: str(r.notes),
})

const BUCKET = 'employee-documents'

/**
 * Document metadata. Only HR/owner ever call upload/remove — RLS (0011)
 * refuses both from anybody else, so an employee's own screen uses this
 * read-only, same shape as salary and the onboarding checklist.
 *
 * The file itself lives in the private 'employee-documents' storage bucket,
 * never a public one — reading it back needs a signed URL, generated on
 * demand, never a permanent link.
 */
export function useEmployeeDocuments(enabled = true) {
  const [rows, setRows] = useState<EmployeeDocument[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!enabled) { setLoading(false); return }
    if (isDemo()) {
      setRows(demoEmployeeDocuments)
      setLoading(false)
      return
    }
    const { data, error: err } = await supabase
      .from('employee_documents')
      .select('*')
      .order('uploaded_at', { ascending: false })
    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }
    setRows((data ?? []).map((r) => toDoc(r as Row)))
    setLoading(false)
  }, [enabled])

  useEffect(() => { void load() }, [load])

  const upload = useCallback(async (employeeId: string, file: File, docType: DocType, uploadedBy: string): Promise<string | null> => {
    if (isDemo()) {
      setRows((p) => [{
        id: 'demo-doc-' + (p.length + 1), employeeId, docType, fileName: file.name,
        filePath: employeeId + '/' + file.name, uploadedBy, uploadedAt: new Date().toISOString(), notes: '',
      }, ...p])
      return null
    }
    const path = `${employeeId}/${Date.now()}-${file.name}`
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file)
    if (upErr) return upErr.message
    const { data, error: err } = await supabase
      .from('employee_documents')
      .insert({ employee_id: employeeId, doc_type: docType, file_name: file.name, file_path: path, uploaded_by: uploadedBy })
      .select('*').single()
    if (err) return err.message
    if (data) setRows((p) => [toDoc(data as Row), ...p])
    return null
  }, [])

  /** A short-lived link to actually view a file — never a permanent one. */
  const downloadUrl = useCallback(async (filePath: string): Promise<string | null> => {
    if (isDemo()) return null
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(filePath, 60)
    return data?.signedUrl ?? null
  }, [])

  const remove = useCallback(async (doc: EmployeeDocument): Promise<string | null> => {
    if (isDemo()) {
      setRows((p) => p.filter((d) => d.id !== doc.id))
      return null
    }
    const { error: delErr } = await supabase.from('employee_documents').delete().eq('id', doc.id)
    if (delErr) return delErr.message
    await supabase.storage.from(BUCKET).remove([doc.filePath])
    setRows((p) => p.filter((d) => d.id !== doc.id))
    return null
  }, [])

  return { rows, loading, error, reload: load, upload, downloadUrl, remove, clearError: () => setError(null) }
}

export type EmployeeDocuments = ReturnType<typeof useEmployeeDocuments>
