import { useEffect, useState } from 'react'
import { buildPosterCanvas, downloadPoster, printPoster } from '@/lib/qrPoster'

/**
 * The thing HR prints and tapes to the attendance desk.
 *
 * What is on screen is the poster itself, not a bare square: HR asked to be
 * able to print a sheet that says which branch it belongs to, so the preview
 * has to be the sheet — a preview that leaves out the name and address is how
 * two branches end up with posters nobody can tell apart.
 *
 * The printed square encodes only the branch's token — never a name, an
 * address or anything about a person. Somebody who photographs the poster
 * learns the branch's id and nothing else, and it does them no good off-site
 * because punch_by_qr() still measures their phone against that branch.
 */
export function QrPoster({
  token, officeName, address, radiusMeters, issuedAt,
}: {
  token: string
  officeName: string
  address?: string
  radiusMeters?: number
  issuedAt?: string | null
}) {
  const [preview, setPreview] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<null | 'save' | 'print'>(null)

  const opts = { token, officeName, address, radiusMeters, issuedAt: issuedAt ?? undefined }

  useEffect(() => {
    let dead = false
    setErr(null)
    buildPosterCanvas({ token, officeName, address, radiusMeters, issuedAt: issuedAt ?? undefined })
      .then((c) => { if (!dead) setPreview(c.toDataURL('image/png')) })
      .catch(() => { if (!dead) setErr('Could not draw the code.') })
    return () => { dead = true }
  }, [token, officeName, address, radiusMeters, issuedAt])

  async function run(kind: 'save' | 'print') {
    setBusy(kind)
    setErr(null)
    try {
      if (kind === 'save') await downloadPoster(opts)
      else await printPoster(opts)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not make the poster.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="qr-poster">
      {preview
        ? <img className="qr-sheet" src={preview} alt={`Attendance poster for ${officeName}`} />
        : <div className="qr-wait" style={{ position: 'static', padding: 24 }}>Drawing the poster…</div>}
      {err && <p className="punch-err">{err}</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button className="btn btn--sm btn--primary" disabled={busy !== null} onClick={() => void run('save')}>
          {busy === 'save' ? 'Saving…' : 'Download poster (PNG)'}
        </button>
        <button className="btn btn--sm" disabled={busy !== null} onClick={() => void run('print')}>
          {busy === 'print' ? 'Opening…' : 'Print this poster'}
        </button>
      </div>
    </div>
  )
}
