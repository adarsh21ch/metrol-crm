import { supabase } from '@/lib/supabase'

/**
 * The public half of the VAPID keypair generated for this app — safe to ship
 * in the bundle, that's what "public" means here. Its private twin lives
 * only as the VAPID_PRIVATE_KEY secret the send-push Edge Function reads;
 * see CLAUDE.md for the one-time setup command.
 */
const VAPID_PUBLIC_KEY = 'BHUJ78d5VEud5WybcQLKH_AcNHPQATWknciEoMyFycAh82kyIiy0EhhboyvizcR3SJE3WZn5av6dNGBpuaE4lSQ'

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const base64Safe = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64Safe)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
}

/** Whether THIS browser already has an active subscription — read straight
 *  from the Push API, not from our own table, since that's the thing that
 *  actually decides whether a push would arrive. */
export async function pushIsEnabled(): Promise<boolean> {
  if (!pushSupported()) return false
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return !!sub
}

/** Asks for permission (the browser's own prompt — never call this on load,
 *  only from an explicit "Enable notifications" tap, same lesson CLAUDE.md's
 *  2026-09-18 entry already drew about the camera permission popup), then
 *  registers the subscription both with the browser and with our own table
 *  so send-push knows where to deliver. */
export async function enablePush(): Promise<string | null> {
  if (!pushSupported()) return 'This browser does not support push notifications.'
  try {
    const reg = await navigator.serviceWorker.register('/sw.js')
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return 'Notifications were not allowed.'
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    })
    const json = sub.toJSON()
    const { error } = await supabase.from('push_subscriptions').insert({
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
    })
    // A re-enable on a device already subscribed hits the endpoint's unique
    // constraint — that is success, not a failure, so it is not surfaced.
    if (error && !error.message.includes('duplicate')) return error.message
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'Could not enable notifications.'
  }
}

export async function disablePush(): Promise<string | null> {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return null
  const endpoint = sub.endpoint
  await sub.unsubscribe()
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
  return error?.message ?? null
}
