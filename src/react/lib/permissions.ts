/**
 * The two permissions attendance needs, asked once instead of twice a day.
 *
 * Punching needs LOCATION. Scanning the poster needs LOCATION *and* the
 * CAMERA. They are two separate browser permissions and nothing in this app
 * can merge them — but what it can do is stop them arriving at two different
 * moments, one of them AFTER the person thinks they have finished scanning.
 *
 * What a browser will and will not remember, because the answer is not ours
 * to change and the app should say so rather than promise otherwise:
 *
 * - **Android Chrome** remembers "Allow" for an https site for good. "Allow
 *   this time" is the one that comes back tomorrow.
 * - **iPhone Safari** asks again on a new page load unless the person sets it
 *   per-site (the "aA" menu → Website Settings) or globally in iOS Settings →
 *   Safari → Camera / Location → Allow. That is Apple's rule, not a bug here.
 * - Adding the site to the Home Screen gives it its own permission state and
 *   generally stops the repeat asking on both platforms.
 */

export type PermState = 'granted' | 'prompt' | 'denied' | 'unknown'

/** What the browser already thinks, without asking the person anything.
 *  Safari does not implement the 'camera' name and throws, which is exactly
 *  why every path here returns 'unknown' rather than assuming the worst — an
 *  unknown permission must never be reported to somebody as a denied one. */
export async function permState(name: 'camera' | 'geolocation'): Promise<PermState> {
  try {
    const api = (navigator as unknown as { permissions?: { query: (d: { name: string }) => Promise<{ state: string }> } }).permissions
    if (!api?.query) return 'unknown'
    const r = await api.query({ name })
    return (r.state === 'granted' || r.state === 'denied' || r.state === 'prompt') ? r.state : 'unknown'
  } catch {
    return 'unknown'
  }
}

/** Opens the camera only long enough for the browser to ask, then lets it go.
 *  Holding the stream would keep the phone's camera light on while nobody is
 *  scanning, which is the kind of thing staff notice and distrust. */
export async function askCamera(): Promise<PermState> {
  try {
    if (!navigator.mediaDevices?.getUserMedia) return 'unknown'
    const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
    s.getTracks().forEach((t) => t.stop())
    return 'granted'
  } catch (e) {
    return e instanceof Error && e.name === 'NotAllowedError' ? 'denied' : 'unknown'
  }
}

export async function askLocation(): Promise<PermState> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) { resolve('unknown'); return }
    navigator.geolocation.getCurrentPosition(
      () => resolve('granted'),
      (err) => resolve(err.code === err.PERMISSION_DENIED ? 'denied' : 'unknown'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  })
}

/** Both, in one deliberate moment the person chose — rather than two surprises
 *  in the middle of punching in. Camera first: it is the one that opens a
 *  viewfinder-shaped dialog, and answering it puts the person in the right
 *  frame of mind for the second. */
export async function askBoth(): Promise<{ camera: PermState; location: PermState }> {
  const camera = await askCamera()
  const location = await askLocation()
  return { camera, location }
}

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

/** What this exact person has to tap, on the phone in their hand, so the
 *  browser stops asking. Generic advice ("check your browser settings") is
 *  what makes somebody give up at the office door. */
export function howToAllow(): string {
  return isIOS()
    ? 'On an iPhone: tap "aA" at the left of the address bar → Website Settings → set Camera and Location to Allow. '
      + 'If it still asks, open Settings → Safari → Camera (and Location) → Allow. '
      + 'Adding this page to your Home Screen also stops the repeat asking.'
    : 'On Android: tap the icon to the left of the address bar → Permissions → set Camera and Location to Allow. '
      + 'Choose "Allow", not "Allow this time" — that one asks again tomorrow. '
      + 'Adding this page to your Home Screen also stops the repeat asking.'
}
