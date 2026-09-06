import { useRef, useState } from 'react'
import { Modal } from '@/components/Modal'
import { DOC_TYPE, type DocType } from '@/lib/hr'

/** HR uploading one document for one employee. There is no self-service
 *  version of this modal — 0011's RLS refuses the insert from anybody but
 *  HR or the owner, so this only ever opens from HrPage. */
export function DocumentUploadModal({
  onClose, onUpload,
}: {
  onClose: () => void
  onUpload: (file: File, docType: DocType) => Promise<string | null>
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [docType, setDocType] = useState<DocType>('other')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const save = async () => {
    if (!file) return
    setBusy(true)
    setErr(null)
    const message = await onUpload(file, docType)
    setBusy(false)
    if (message) { setErr(message); return }
    onClose()
  }

  return (
    <Modal
      title="Upload document"
      onClose={onClose}
      foot={
        <>
          <button className="btn btn--sm" onClick={onClose}>Cancel</button>
          <button className="btn btn--sm btn--primary" disabled={!file || busy} onClick={() => void save()}>
            {busy ? 'Uploading…' : 'Upload'}
          </button>
        </>
      }
    >
      {err && <div className="auth-err" style={{ marginBottom: 12 }}>{err}</div>}
      <div className="auth-form">
        <div className="field">
          <label htmlFor="docType">Document type</label>
          <select className="input" id="docType" value={docType} onChange={(e) => setDocType(e.target.value as DocType)}>
            {Object.entries(DOC_TYPE).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="docFile">File</label>
          <input ref={fileRef} className="input" id="docFile" type="file"
                 onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
      </div>
    </Modal>
  )
}
