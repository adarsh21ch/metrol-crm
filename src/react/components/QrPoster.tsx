import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'

/**
 * The thing HR prints and tapes to the attendance desk.
 *
 * The printed square encodes only the branch's token — never a name, an
 * address or anything about a person. Somebody who photographs the poster
 * learns the branch's id and nothing else, and it does them no good off-site
 * because punch_by_qr() still measures their phone against that branch.
 *
 * Rendered at 640px so it survives being printed at A5 and read across a desk.
 */
export function QrPoster({ token, officeName, address }: { token: string; officeName: string; address?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    const c = ref.current
    if (!c) return
    QRCode.toCanvas(c, token, { width: 640, margin: 2, errorCorrectionLevel: 'M' })
      .catch(() => setErr('Could not draw the code.'))
  }, [token])

  function print() {
    const data = ref.current?.toDataURL('image/png')
    if (!data) return
    // A print window rather than window.print() on the page: printing the app
    // would put the sidebar and the toolbar on the poster.
    const w = window.open('', '_blank', 'width=720,height=900')
    if (!w) return
    w.document.write(`<!doctype html><html><head><title>${officeName} — attendance code</title>
      <style>
        body{font-family:system-ui,sans-serif;text-align:center;padding:40px 24px;margin:0}
        h1{font-size:26px;margin:0 0 4px}
        p{color:#555;margin:0 0 24px;font-size:15px}
        img{width:min(72vw,460px);height:auto}
        .cap{margin-top:22px;font-size:14px;color:#333;line-height:1.6}
        @media print{ .cap{page-break-inside:avoid} }
      </style></head><body>
      <h1>${officeName}</h1>
      <p>${address ?? ''}</p>
      <img src="${data}" alt="Attendance QR code" />
      <div class="cap"><strong>Scan to punch in.</strong> Scan again when you leave.<br/>
      Open the Metrol app &rarr; Attendance &rarr; Scan code.</div>
      <script>window.onload=()=>{window.print()}<\/script>
      </body></html>`)
    w.document.close()
  }

  return (
    <div className="qr-poster">
      <canvas ref={ref} className="qr-canvas" />
      {err && <p className="punch-err">{err}</p>}
      <button className="btn btn--sm" onClick={print}>Print this poster</button>
    </div>
  )
}
