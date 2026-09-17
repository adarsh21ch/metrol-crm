import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { Modal } from '@/components/Modal'

/**
 * The camera, pointed at the poster on the attendance desk.
 *
 * jsQR rather than the browser's own BarcodeDetector: that API is Chrome-only,
 * and half the office is on an iPhone. One code path that works everywhere
 * beats a fast path plus a fallback nobody tests.
 *
 * `facingMode: environment` asks for the back camera — a front camera pointed
 * at a wall-mounted poster is the phone held backwards.
 *
 * Nothing here decides anything. It reads a string off a printed square and
 * hands it up; whether that string means a punch is the database's answer.
 */
export function QrScanner({ onClose, onCode, sharedStream }: {
  onClose: () => void
  onCode: (code: string) => void
  /** An already-open camera stream, warmed by PunchCard before this component
   *  ever mounted. When given, no getUserMedia call happens here at all — the
   *  viewfinder appears the instant this renders, because the camera's own
   *  hardware negotiation already happened, possibly minutes ago. The stream
   *  is borrowed, not owned: its tracks are never stopped on close, since
   *  PunchCard keeps it alive for the NEXT scan too. Null falls back to
   *  opening (and, on close, properly closing) one here, same as before. */
  sharedStream?: MediaStream | null
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const frameRef = useRef<number | null>(null)
  const doneRef = useRef(false)
  const [err, setErr] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  /* The camera is opened ONCE, and the callback is read through a ref.
     This effect used to depend on [onCode] — and every caller passes an inline
     arrow, so `onCode` is a new function on every render of the parent. The
     cleanup therefore stopped the camera track and the effect reopened it on
     every parent render: on the punch screen, whose clock re-renders every 30
     seconds while somebody is punched in, scanning to punch OUT meant the
     camera cutting out and restarting mid-aim. A ref keeps the latest callback
     without the effect ever having a reason to re-run. */
  const codeRef = useRef(onCode)
  useEffect(() => { codeRef.current = onCode }, [onCode])

  const owned = useRef(false)

  useEffect(() => {
    let cancelled = false

    async function start() {
      try {
        let stream: MediaStream
        if (sharedStream) {
          // Borrowed — already open, already negotiated. The viewfinder can
          // appear this same tick instead of waiting on the camera again.
          stream = sharedStream
          owned.current = false
        } else {
          stream = await navigator.mediaDevices.getUserMedia({
            // A smaller request lets the camera settle faster — jsQR reads a
            // 480px-wide frame anyway (see tick() below), so nothing here is
            // lost by not asking for 1080p in the first place.
            video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 } },
            audio: false,
          })
          owned.current = true
        }
        if (cancelled) { if (owned.current) stream.getTracks().forEach((t) => t.stop()); return }
        streamRef.current = stream
        const v = videoRef.current
        if (!v) return
        v.srcObject = stream
        // playsInline matters on iOS: without it Safari takes the video
        // fullscreen and the modal disappears behind it.
        v.setAttribute('playsinline', 'true')
        await v.play()
        setReady(true)
        tick()
      } catch (e) {
        const name = e instanceof Error ? e.name : ''
        if (name === 'NotAllowedError') setErr('Camera permission is blocked. Allow the camera for this site, then try again.')
        else if (name === 'NotFoundError') setErr('No camera on this device. Use the Punch in button instead.')
        else setErr('Could not open the camera. Use the Punch in button instead.')
      }
    }

    function tick() {
      if (cancelled || doneRef.current) return
      const v = videoRef.current
      const c = canvasRef.current
      if (v && c && v.readyState === v.HAVE_ENOUGH_DATA) {
        // Downscale before decoding: a 1080p frame costs far more to scan than
        // it gains, and this runs on every animation frame on a mid phone.
        const w = 480
        const h = Math.round((v.videoHeight / v.videoWidth) * w) || 480
        c.width = w; c.height = h
        const ctx = c.getContext('2d', { willReadFrequently: true })
        if (ctx) {
          ctx.drawImage(v, 0, 0, w, h)
          const img = ctx.getImageData(0, 0, w, h)
          const found = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })
          if (found?.data) {
            doneRef.current = true
            codeRef.current(found.data.trim())
            return
          }
        }
      }
      frameRef.current = requestAnimationFrame(tick)
    }

    void start()
    return () => {
      cancelled = true
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      // Only stop tracks this component opened itself. A borrowed stream is
      // PunchCard's to keep alive for the next scan — stopping it here would
      // undo the entire point of warming it in the first place.
      if (owned.current) streamRef.current?.getTracks().forEach((t) => t.stop())
    }
    // sharedStream is read once per mount, same as onCode via codeRef above —
    // a new inline value each render must not tear the camera down mid-scan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Modal title="Scan the office code" sub="Point the camera at the poster on the attendance desk" onClose={onClose}
           foot={<button className="btn btn--block" onClick={onClose}>Cancel</button>}>
      {err ? (
        <p className="punch-err">{err}</p>
      ) : (
        <div className="qr-view">
          <video ref={videoRef} className="qr-video" muted playsInline />
          <div className="qr-frame" />
          {!ready && <div className="qr-wait">Opening the camera…</div>}
        </div>
      )}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <p className="punch-note">
        Scanning still checks where you are. A photo of the code, scanned from somewhere else, will not record anything.
      </p>
    </Modal>
  )
}
