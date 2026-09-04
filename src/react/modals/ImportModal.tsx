import { useRef, useState } from 'react'
import { Modal } from '@/components/Modal'
import { mapImport, readSheet, type ImportRow } from '@/lib/importLeads'
import type { Lead, Member } from '@/lib/types'

/** Adarsh runs Metrol's Meta ads, so leads arrive in bulk far more often than
 *  one at a time. This is the path that matters most. */
export function ImportModal({
  members, projectLeads, projectName, onClose, onImport,
}: {
  members: Member[]
  projectLeads: Lead[]
  projectName: string
  onClose: () => void
  onImport: (rows: ImportRow[], bulkOwner: string | null) => Promise<void>
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('Choose a file')
  const [hint, setHint] = useState('or drop it here — .xlsx or .csv')
  const [over, setOver] = useState(false)
  const [rows, setRows] = useState<ImportRow[] | null>(null)
  const [result, setResult] = useState<{ msg: string; kind: 'ok' | 'bad' } | null>(null)
  const [bulk, setBulk] = useState('')
  const [busy, setBusy] = useState(false)

  async function load(file: File | undefined | null) {
    if (!file) return
    setRows(null); setResult(null)
    setName(file.name); setHint('Reading…')
    try {
      const sheet = await readSheet(file)
      const m = mapImport(sheet, projectLeads.map((l) => l.phone), members)
      if ('error' in m) {
        setResult({ msg: m.error, kind: 'bad' })
        setHint('Pick another file')
        return
      }
      setRows(m.leads)
      setHint('Ready to import')
      const bits = [`${m.leads.length} lead${m.leads.length === 1 ? '' : 's'} found`]
      if (m.dupes) bits.push(`${m.dupes} skipped as duplicate phone numbers`)
      if (m.blanks) bits.push(`${m.blanks} blank rows ignored`)
      setResult({ msg: bits.join(' · '), kind: m.leads.length ? 'ok' : 'bad' })
    } catch (e) {
      setResult({ msg: (e as Error).message, kind: 'bad' })
      setHint('Pick another file')
    }
  }

  return (
    <Modal
      title="Import leads"
      sub="An Excel sheet (.xlsx) or a CSV, one lead per row."
      onClose={onClose}
      foot={
        <>
          <button className="btn btn--sm" onClick={onClose}>Cancel</button>
          <button className="btn btn--sm btn--primary" disabled={!rows?.length || busy}
                  onClick={async () => { setBusy(true); await onImport(rows!, bulk || null); setBusy(false) }}>
            {busy ? 'Importing…' : 'Import'}
          </button>
        </>
      }
    >
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,text/csv" hidden
             onChange={(e) => void load(e.target.files?.[0])} />

      <div
        className={'drop' + (rows ? ' has-file' : '') + (over ? ' is-over' : '')}
        role="button" tabIndex={0}
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click() } }}
        onDragEnter={(e) => { e.preventDefault(); setOver(true) }}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={(e) => { e.preventDefault(); setOver(false) }}
        onDrop={(e) => { e.preventDefault(); setOver(false); void load(e.dataTransfer.files?.[0]) }}
      >
        <b>{name}</b>
        <span>{hint}</span>
      </div>

      <p className="imp-note">
        The first row must be a header. It looks for <b>Name</b>, <b>Phone</b>, <b>Email</b> and
        optionally <b>Assign to</b> — any other columns are ignored. Leads already in {projectName} with
        the same phone number are skipped.
      </p>

      <div className="field">
        <label htmlFor="impAssign">Assign every imported lead to</label>
        <select className="input" id="impAssign" value={bulk} onChange={(e) => setBulk(e.target.value)}>
          <option value="">Leave unassigned</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>

      {result && <div className={'imp-result is-' + result.kind}>{result.msg}</div>}
    </Modal>
  )
}
