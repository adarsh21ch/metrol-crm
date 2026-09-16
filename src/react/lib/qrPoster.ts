import QRCode from 'qrcode'

/**
 * The branch's attendance poster, drawn once and used by both buttons.
 *
 * Print and Download used to be two different sheets — Print built an HTML
 * page, and there was no Download at all. One drawing function means what HR
 * downloads is byte-for-byte what HR prints, so a poster taped to the wall can
 * never differ from the file somebody mailed to the other branch.
 *
 * A4 at 150 dpi (1240 x 1754). The code itself is drawn at 760px, which comes
 * out about 13 cm across on A4 — readable from arm's length by a mid-range
 * phone, which is the whole job.
 *
 * The square encodes ONLY the branch token. The name, the address and the
 * radius are printed AROUND it as ink for the human being, never inside it:
 * somebody who photographs the poster still learns nothing about anybody, and
 * punch_by_qr() measures their phone against this branch regardless.
 */
export interface PosterOpts {
  token: string
  officeName: string
  address?: string
  radiusMeters?: number
  /** Printed small at the foot so HR can tell two generations of poster apart
   *  after rotating a code. */
  issuedAt?: string
}

const W = 1240
const H = 1754
const INK = '#111111'
const MUTE = '#5A5A5A'
const BRAND = '#F5C518'
const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif'

function centre(ctx: CanvasRenderingContext2D, text: string, y: number, font: string, colour: string) {
  ctx.font = font
  ctx.fillStyle = colour
  ctx.textAlign = 'center'
  ctx.fillText(text, W / 2, y)
}

/** Wraps on words and returns the y the next line would start at, so a two-line
 *  address pushes everything below it down instead of printing on top of it. */
function wrap(
  ctx: CanvasRenderingContext2D, text: string, y: number,
  font: string, colour: string, maxWidth: number, lineHeight: number, maxLines = 3,
): number {
  ctx.font = font
  ctx.fillStyle = colour
  ctx.textAlign = 'center'
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const next = line ? line + ' ' + w : w
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line)
      line = w
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  const shown = lines.slice(0, maxLines)
  // An address that runs past the last line is cut with an ellipsis rather
  // than silently losing its tail — a truncated address still looks wrong,
  // which is the point.
  if (lines.length > maxLines && shown.length) shown[shown.length - 1] = shown[shown.length - 1].replace(/[,\s]+$/, '') + '…'
  shown.forEach((l, i) => ctx.fillText(l, W / 2, y + i * lineHeight))
  return y + shown.length * lineHeight
}

/** The QR square on its own transparent canvas, at the size it will be drawn. */
async function codeCanvas(token: string, size: number): Promise<HTMLCanvasElement> {
  const c = document.createElement('canvas')
  // errorCorrectionLevel 'M' is deliberately the same level QrScanner was
  // round-trip tested against. A printed poster that scuffs would like 'Q',
  // but changing it changes the module count, and this pair is proven.
  await QRCode.toCanvas(c, token, { width: size, margin: 1, errorCorrectionLevel: 'M' })
  return c
}

export async function buildPosterCanvas(o: PosterOpts): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not draw the poster on this browser.')

  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, W, H)
  ctx.textBaseline = 'alphabetic'

  // One brand band at the top. Everything else is black on white, because a
  // poster is printed on whatever printer the office has and colour is the
  // first thing to come out wrong.
  ctx.fillStyle = BRAND
  ctx.fillRect(0, 0, W, 18)

  centre(ctx, 'METROL MEDIA', 120, `600 30px ${FONT}`, MUTE)
  centre(ctx, 'ATTENDANCE', 168, `700 30px ${FONT}`, MUTE)

  let y = wrap(ctx, o.officeName || 'Branch', 268, `700 68px ${FONT}`, INK, W - 160, 78, 2)

  if (o.address?.trim()) {
    y = wrap(ctx, o.address.trim(), y + 46, `400 30px ${FONT}`, MUTE, W - 200, 42, 3)
  }

  // The code is anchored to a fixed band rather than to the text above it, so
  // a long branch name cannot push it off the page.
  const size = 760
  const code = await codeCanvas(o.token, size)
  const codeY = Math.max(y + 60, 560)
  ctx.drawImage(code, (W - size) / 2, codeY, size, size)

  let below = codeY + size + 92
  centre(ctx, 'Scan to punch in.', below, `700 44px ${FONT}`, INK)
  below += 56
  centre(ctx, 'Scan again when you leave.', below, `400 38px ${FONT}`, INK)

  below += 76
  centre(ctx, 'Open the Metrol app  →  Attendance  →  Scan office code', below, `400 28px ${FONT}`, MUTE)

  below += 54
  centre(
    ctx,
    o.radiusMeters
      ? `You have to be standing within ${o.radiusMeters} m of this office.`
      : 'You have to be standing at this office.',
    below, `400 28px ${FONT}`, MUTE,
  )
  below += 42
  centre(ctx, 'Your phone location is checked. A photo of this code will not work from home.', below, `400 26px ${FONT}`, MUTE)

  // Foot: enough to tell one printing from the next after HR rotates a code,
  // and nothing that identifies a person.
  const ref = (o.token || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase()
  const issued = o.issuedAt ? new Date(o.issuedAt) : null
  const stamp = issued && !Number.isNaN(issued.getTime())
    ? issued.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : null
  centre(ctx, `Code ${ref}${stamp ? '  ·  issued ' + stamp : ''}`, H - 64, `400 22px ${FONT}`, '#9A9A9A')

  return canvas
}

const slug = (s: string) => (s || 'branch').trim().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'branch'

/** Saves the poster as a PNG. A PNG rather than a PDF on purpose: every phone,
 *  every printer and WhatsApp all take a PNG, and a PDF here would mean adding
 *  a library to the bundle for a single sheet of paper. */
export async function downloadPoster(o: PosterOpts): Promise<void> {
  const canvas = await buildPosterCanvas(o)
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
  if (!blob) throw new Error('Could not save the poster.')
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Metrol-attendance-QR-${slug(o.officeName)}.png`
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoked late: Safari has been known to abort a download whose object URL
  // is released in the same tick as the click.
  window.setTimeout(() => URL.revokeObjectURL(url), 30000)
}

/** Prints the same sheet. A new window rather than window.print() on the page,
 *  which would put the app's sidebar and toolbar on the poster. */
export async function printPoster(o: PosterOpts): Promise<void> {
  const canvas = await buildPosterCanvas(o)
  const data = canvas.toDataURL('image/png')
  const w = window.open('', '_blank', 'width=760,height=960')
  if (!w) throw new Error('Your browser blocked the print window. Allow pop-ups for this site, or use Download instead.')
  w.document.write(`<!doctype html><html><head><meta charset="utf-8">
    <title>${slug(o.officeName)} — attendance code</title>
    <style>
      @page{size:A4;margin:0}
      html,body{margin:0;padding:0;background:#fff}
      img{display:block;width:100%;height:auto}
      @media print{ img{width:100%;page-break-inside:avoid} }
    </style></head><body>
    <img src="${data}" alt="Attendance QR poster" />
    <script>window.onload=function(){setTimeout(function(){window.print()},120)}<\/script>
    </body></html>`)
  w.document.close()
}
