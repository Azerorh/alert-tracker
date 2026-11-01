import type { OblastNotifyKinds } from '../hooks/useOblastWatch'

const DEFAULT_PUSH_API = 'https://alert-tracker-push.azerorh.workers.dev'
const PUSH_API_BASE = (
  (import.meta.env.VITE_PUSH_API_BASE as string | undefined) || DEFAULT_PUSH_API
).replace(/\/$/, '')

export type PushSyncStatus =
  | 'disabled'
  | 'unsupported'
  | 'needs_permission'
  | 'needs_install'
  | 'syncing'
  | 'active'
  | 'error'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/** Safari iOS is picky: needs a clean ArrayBuffer, not a Uint8Array view. */
function vapidKeyBuffer(base64String: string): ArrayBuffer {
  const bytes = urlBase64ToUint8Array(base64String)
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}

export function isPushConfigured(): boolean {
  return Boolean(PUSH_API_BASE)
}

export function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const iOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const webkit = /WebKit/.test(ua)
  return iOS && webkit
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false
  const mq = window.matchMedia?.('(display-mode: standalone)')?.matches
  const iosStandalone =
    'standalone' in navigator &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  return Boolean(mq || iosStandalone)
}

export async function registerPushServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null
  const base = import.meta.env.BASE_URL || '/'
  const swUrl = `${base}sw.js`.replace(/\/{2,}/g, '/').replace(':/', '://')
  try {
    const reg = await navigator.serviceWorker.register(swUrl, { scope: base })
    await navigator.serviceWorker.ready
    return reg
  } catch (err) {
    console.warn('SW register failed', err)
    return null
  }
}

async function fetchVapidPublicKey(): Promise<string | null> {
  if (!PUSH_API_BASE) return null
  const res = await fetch(`${PUSH_API_BASE}/vapid-public-key`)
  if (!res.ok) return null
  const data = (await res.json()) as { publicKey?: string }
  return data.publicKey ?? null
}

function serializeSubscription(sub: PushSubscription) {
  const json = sub.toJSON()
  return {
    endpoint: json.endpoint!,
    expirationTime: json.expirationTime ?? null,
    keys: {
      p256dh: json.keys!.p256dh!,
      auth: json.keys!.auth!,
    },
  }
}

/**
 * Ensure SW + PushSubscription exist and sync watched oblasts to the Worker.
 * Returns a coarse UI status.
 */
export async function syncPushSubscription(opts: {
  watched: string[]
  kinds: OblastNotifyKinds
  permission: NotificationPermission | 'unsupported'
}): Promise<PushSyncStatus> {
  if (!PUSH_API_BASE) return 'disabled'
  if (typeof window === 'undefined') return 'unsupported'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'unsupported'
  }
  if (opts.permission === 'unsupported') return 'unsupported'
  if (opts.permission === 'denied') return 'needs_permission'
  if (opts.permission !== 'granted') return 'needs_permission'

  // iOS/iPadOS: Web Push only in a Home Screen web app (not Safari tab).
  if (isIosSafari() && !isStandalonePwa()) return 'needs_install'

  if (!opts.watched.length) {
    try {
      const reg = await navigator.serviceWorker.ready
      const existing = await reg.pushManager.getSubscription()
      if (existing) {
        await fetch(`${PUSH_API_BASE}/unsubscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: existing.endpoint }),
        }).catch(() => undefined)
        await existing.unsubscribe().catch(() => undefined)
      }
    } catch {
      /* ignore */
    }
    return 'disabled'
  }

  try {
    const reg = (await registerPushServiceWorker()) ?? (await navigator.serviceWorker.ready)
    const vapidKey = await fetchVapidPublicKey()
    if (!vapidKey) return 'error'

    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKeyBuffer(vapidKey),
      })
    }

    const res = await fetch(`${PUSH_API_BASE}/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: serializeSubscription(sub),
        watched: opts.watched,
        kinds: opts.kinds,
      }),
    })
    if (!res.ok) return 'error'
    return 'active'
  } catch (err) {
    console.warn('push sync failed', err)
    return 'error'
  }
}

export function pushStatusLabel(status: PushSyncStatus): string | null {
  switch (status) {
    case 'active':
      return 'Фон: увімкнено на цьому пристрої'
    case 'needs_permission':
      return 'Фон: натисніть «Дозволити сповіщення» нижче'
    case 'needs_install':
      return 'Фон на iPhone: Поділитися → На екран «Додому» → відкрити з іконки (не з Safari) → дозволити сповіщення'
    case 'syncing':
      return 'Фон: підключення…'
    case 'error':
      return 'Фон: помилка підписки (мережа / workers.dev). Спробуйте ще раз на Wi‑Fi або LTE'
    case 'unsupported':
      return 'Фон: цей браузер не підтримує Web Push (потрібен iOS 16.4+)'
    case 'disabled':
    default:
      return null
  }
}
