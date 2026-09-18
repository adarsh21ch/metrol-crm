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
/* This component owns the camera outright: it opens one when it mounts and
   stops it when it closes, every time. It used to accept a stream borrowed
   from PunchCard, warmed in advance so the viewfinder could appear instantly —
   which also meant the camera stayed powered while nobody was scanning, and a
   phone showing a live camera indicator on an attendance screen is not a
   trade worth one second. The camera is on exactly while this window is. */
export function QrScanner({ onClose, onCode }: {
  onClose: () => void
  onCode: (code: string) => void
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

  useEffect(() => {
    let cancelled = false

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          // A smaller request lets the camera settle faster — jsQR reads a
          // 480px-wide frame anyway (see tick() below), so nothing here is
          // lost by not asking for 1080p in the first place.
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        })
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return }
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
      // Every track, every time — this window closing is what turns the
      // camera light back off.
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
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
