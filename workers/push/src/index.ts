import { buildPushPayload, type PushSubscription } from '@block65/webcrypto-web-push'
import {
  expandWatchedOblastKeys,
  matchWatchedOblastKey,
  oblastDisplayName,
  type OblastFeature,
} from './geo'

export interface Env {
  PUSH_SUBS: KVNamespace
  VAPID_PUBLIC_KEY: string
  VAPID_PRIVATE_KEY: string
  VAPID_SUBJECT: string
  OBLASTS_GEOJSON_URL: string
  ALLOWED_ORIGINS: string
}

type NotifyKinds = { threats: boolean; alerts: boolean }

type SubRecord = {
  endpoint: string
  keys: { p256dh: string; auth: string }
  watched: string[]
  kinds: NotifyKinds
  updatedAt: number
}

type SubState = {
  /** threatId → oblast key currently inside */
  inside: Record<string, string>
  /** threat ids already baselined / notified */
  seen: string[]
  /** watched key → alert level */
  alerts: Record<string, AlertLevelState>
  primed: boolean
  alertPrimed: boolean
}

type AlertLevelState = 'clear' | 'red' | 'yellow'

type ThreatRow = {
  id: string
  type?: string
  title?: string
  lat?: number
  lon?: number
  status?: string
  areaOnly?: boolean
}

type AlertZone = {
  key: string
  name?: string
  oblast?: string
  level?: 'red' | 'yellow'
}

const NEPTUN_THREATS = 'https://neptun.in.ua/api/v1/threats'
const NEPTUN_ALERTS = 'https://neptun.in.ua/api/v1/alerts'
const SUB_PREFIX = 'sub:'
const STATE_PREFIX = 'state:'
const INDEX_KEY = 'sub:index'

const TYPE_SHORT: Record<string, string> = {
  uav: 'БпЛА',
  fpv: 'FPV',
  missile: 'Ракета',
  ballistic: 'Балістика',
  kab: 'КАБ',
  mig31k: 'МіГ-31К',
  recon: 'Розвідка',
  unknown: 'Об’єкт',
}

let oblastsCache: { at: number; features: OblastFeature[] } | null = null

function corsHeaders(origin: string | null, env: Env): HeadersInit {
  const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
  const ok = origin && allowed.includes(origin) ? origin : allowed[0] ?? '*'
  return {
    'Access-Control-Allow-Origin': ok,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}

function json(data: unknown, init: ResponseInit = {}, origin: string | null = null, env?: Env) {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json; charset=utf-8')
  if (env) {
    for (const [k, v] of Object.entries(corsHeaders(origin, env))) headers.set(k, v)
  }
  return new Response(JSON.stringify(data), { ...init, headers })
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function subIdForEndpoint(endpoint: string): Promise<string> {
  return sha256Hex(endpoint)
}

function isActiveThreat(t: ThreatRow): boolean {
  if (t.areaOnly) return false
  if (typeof t.lat !== 'number' || typeof t.lon !== 'number') return false
  const s = t.status ?? 'active'
  if (s === 'resolved' || s === 'shot_down' || s === 'vanished') return false
  return true
}

function levelRank(level: AlertLevelState): number {
  if (level === 'red') return 2
  if (level === 'yellow') return 1
  return 0
}

function levelLabel(level: AlertLevelState): string {
  if (level === 'red') return 'повітряна тривога'
  if (level === 'yellow') return 'увага / жовтий рівень'
  return 'немає тривоги'
}

async function loadOblasts(env: Env): Promise<OblastFeature[]> {
  const now = Date.now()
  if (oblastsCache && now - oblastsCache.at < 6 * 60 * 60_000) return oblastsCache.features
  const res = await fetch(env.OBLASTS_GEOJSON_URL, {
    headers: { Accept: 'application/json', 'User-Agent': 'alert-tracker-push/1.0' },
  })
  if (!res.ok) throw new Error(`oblasts ${res.status}`)
  const fc = (await res.json()) as { features?: OblastFeature[] }
  const features = (fc.features ?? []).filter((f) => f.properties?.key)
  oblastsCache = { at: now, features }
  return features
}

async function readIndex(env: Env): Promise<string[]> {
  const raw = await env.PUSH_SUBS.get(INDEX_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

async function writeIndex(env: Env, ids: string[]) {
  await env.PUSH_SUBS.put(INDEX_KEY, JSON.stringify([...new Set(ids)]))
}

async function getSub(env: Env, id: string): Promise<SubRecord | null> {
  const raw = await env.PUSH_SUBS.get(SUB_PREFIX + id)
  if (!raw) return null
  try {
    return JSON.parse(raw) as SubRecord
  } catch {
    return null
  }
}

async function getState(env: Env, id: string): Promise<SubState> {
  const raw = await env.PUSH_SUBS.get(STATE_PREFIX + id)
  if (!raw) {
    return { inside: {}, seen: [], alerts: {}, primed: false, alertPrimed: false }
  }
  try {
    return JSON.parse(raw) as SubState
  } catch {
    return { inside: {}, seen: [], alerts: {}, primed: false, alertPrimed: false }
  }
}

async function putState(env: Env, id: string, state: SubState) {
  // Cap seen list growth
  if (state.seen.length > 400) state.seen = state.seen.slice(-300)
  await env.PUSH_SUBS.put(STATE_PREFIX + id, JSON.stringify(state))
}

function buildAlertStates(
  watched: string[],
  features: OblastFeature[],
  alertOblasts: AlertZone[],
  alerts: AlertZone[],
): Record<string, AlertLevelState> {
  const expanded = expandWatchedOblastKeys(watched)
  const nameToKey = new Map<string, string>()
  for (const f of features) {
    const key = String(f.properties?.key ?? '')
    const name = String(f.properties?.region ?? f.properties?.name ?? '')
    if (key && name) nameToKey.set(name, key)
  }
  const out: Record<string, AlertLevelState> = {}
  for (const key of watched) out[key] = 'clear'

  const raise = (geoKey: string, level: 'red' | 'yellow' | undefined) => {
    if (!expanded.has(geoKey)) return
    const next: AlertLevelState = level === 'yellow' ? 'yellow' : 'red'
    for (const selected of watched) {
      if (!expandWatchedOblastKeys([selected]).has(geoKey)) continue
      const prev = out[selected] ?? 'clear'
      if (levelRank(next) > levelRank(prev)) out[selected] = next
    }
  }

  for (const zone of alertOblasts) raise(zone.key, zone.level)
  for (const zone of alerts) {
    const key = zone.oblast ? nameToKey.get(zone.oblast) : undefined
    if (key) raise(key, zone.level)
  }
  return out
}

async function sendPush(
  env: Env,
  sub: SubRecord,
  title: string,
  body: string,
  tag: string,
): Promise<'ok' | 'gone' | 'error'> {
  const subscription: PushSubscription = {
    endpoint: sub.endpoint,
    expirationTime: null,
    keys: sub.keys,
  }
  try {
    const payload = await buildPushPayload(
      {
        data: JSON.stringify({ title, body, tag }),
        options: { ttl: 120, urgency: 'high' },
      },
      subscription,
      {
        subject: env.VAPID_SUBJECT,
        publicKey: env.VAPID_PUBLIC_KEY,
        privateKey: env.VAPID_PRIVATE_KEY,
      },
    )
    const res = await fetch(sub.endpoint, payload)
    if (res.status === 404 || res.status === 410) return 'gone'
    if (!res.ok) {
      console.warn('push failed', res.status, await res.text().catch(() => ''))
      return 'error'
    }
    return 'ok'
  } catch (err) {
    console.warn('push error', err)
    return 'error'
  }
}

async function removeSub(env: Env, id: string) {
  await env.PUSH_SUBS.delete(SUB_PREFIX + id)
  await env.PUSH_SUBS.delete(STATE_PREFIX + id)
  const index = await readIndex(env)
  await writeIndex(
    env,
    index.filter((x) => x !== id),
  )
}

async function processSubscription(
  env: Env,
  id: string,
  sub: SubRecord,
  threats: ThreatRow[],
  alertOblasts: AlertZone[],
  alerts: AlertZone[],
  features: OblastFeature[],
  nameByKey: Map<string, string>,
) {
  if (!sub.watched.length) return

  const state = await getState(env, id)
  const watchedSet = expandWatchedOblastKeys(sub.watched)
  const kinds = sub.kinds ?? { threats: true, alerts: true }
  let dirty = false

  // --- threats ---
  if (kinds.threats !== false) {
    if (!state.primed) {
      for (const t of threats) {
        if (!isActiveThreat(t)) continue
        state.seen.push(t.id)
        const key = matchWatchedOblastKey(t.lon!, t.lat!, watchedSet, features)
        if (key) state.inside[t.id] = key
      }
      state.primed = true
      dirty = true
    } else {
      const seenSet = new Set(state.seen)
      const liveIds = new Set(threats.filter(isActiveThreat).map((t) => t.id))

      for (const t of threats) {
        if (!isActiveThreat(t)) continue
        const key = matchWatchedOblastKey(t.lon!, t.lat!, watchedSet, features)
        const wasSeen = seenSet.has(t.id)
        const prev = state.inside[t.id]

        if (!wasSeen) {
          state.seen.push(t.id)
          seenSet.add(t.id)
          dirty = true
          if (!key) continue
          state.inside[t.id] = key
          const meta = TYPE_SHORT[t.type ?? ''] ?? 'Об’єкт'
          const oblastName = nameByKey.get(key) ?? key
          const result = await sendPush(
            env,
            sub,
            `${meta} · ${oblastName}`,
            t.title || `Загроза над «${oblastName}»`,
            `oblast-enter-${key}-${t.id}`,
          )
          if (result === 'gone') {
            await removeSub(env, id)
            return
          }
          continue
        }

        if (!key) {
          if (prev) {
            delete state.inside[t.id]
            dirty = true
          }
          continue
        }

        if (prev === key) continue

        state.inside[t.id] = key
        dirty = true
        const meta = TYPE_SHORT[t.type ?? ''] ?? 'Об’єкт'
        const oblastName = nameByKey.get(key) ?? key
        const result = await sendPush(
          env,
          sub,
          `${meta} · ${oblastName}`,
          t.title || `Загроза зайшла в «${oblastName}»`,
          `oblast-enter-${key}-${t.id}`,
        )
        if (result === 'gone') {
          await removeSub(env, id)
          return
        }
      }

      for (const tid of Object.keys(state.inside)) {
        if (!liveIds.has(tid)) {
          delete state.inside[tid]
          dirty = true
        }
      }
    }
  }

  // --- alerts ---
  if (kinds.alerts !== false) {
    const next = buildAlertStates(sub.watched, features, alertOblasts, alerts)
    if (!state.alertPrimed) {
      state.alerts = next
      state.alertPrimed = true
      dirty = true
    } else {
      for (const key of sub.watched) {
        if (!(key in state.alerts)) {
          state.alerts[key] = next[key] ?? 'clear'
          dirty = true
        }
      }
      for (const key of Object.keys(state.alerts)) {
        if (!sub.watched.includes(key)) {
          delete state.alerts[key]
          dirty = true
        }
      }

      for (const key of sub.watched) {
        const prev = state.alerts[key] ?? 'clear'
        const cur = next[key] ?? 'clear'
        if (prev === cur) continue
        state.alerts[key] = cur
        dirty = true
        const oblastName = nameByKey.get(key) ?? key
        let title: string
        let body: string
        if (prev === 'clear' && cur !== 'clear') {
          title = `Тривога · ${oblastName}`
          body = `Оголошено: ${levelLabel(cur)}`
        } else if (prev !== 'clear' && cur === 'clear') {
          title = `Відбій · ${oblastName}`
          body = 'Повітряну тривогу скасовано'
        } else {
          title = `Статус · ${oblastName}`
          body = `${levelLabel(prev)} → ${levelLabel(cur)}`
        }
        const result = await sendPush(env, sub, title, body, `oblast-alert-${key}`)
        if (result === 'gone') {
          await removeSub(env, id)
          return
        }
      }
    }
  }

  if (dirty) await putState(env, id, state)
}

async function runWatchCycle(env: Env) {
  const [threatsRes, alertsRes, features] = await Promise.all([
    fetch(NEPTUN_THREATS, {
      headers: { Accept: 'application/json', 'User-Agent': 'alert-tracker-push/1.0' },
    }),
    fetch(NEPTUN_ALERTS, {
      headers: { Accept: 'application/json', 'User-Agent': 'alert-tracker-push/1.0' },
    }),
    loadOblasts(env),
  ])

  if (!threatsRes.ok) throw new Error(`threats ${threatsRes.status}`)
  if (!alertsRes.ok) throw new Error(`alerts ${alertsRes.status}`)

  const threatsJson = (await threatsRes.json()) as { threats?: ThreatRow[] }
  const alertsJson = (await alertsRes.json()) as {
    alerts?: AlertZone[]
    alertOblasts?: AlertZone[]
  }

  const threats = threatsJson.threats ?? []
  const alerts = alertsJson.alerts ?? []
  const alertOblasts = alertsJson.alertOblasts ?? []

  const nameByKey = new Map<string, string>()
  for (const f of features) {
    const key = String(f.properties?.key ?? '')
    if (key) nameByKey.set(key, oblastDisplayName(f, key))
  }

  const index = await readIndex(env)
  for (const id of index) {
    const sub = await getSub(env, id)
    if (!sub) {
      await writeIndex(
        env,
        (await readIndex(env)).filter((x) => x !== id),
      )
      continue
    }
    try {
      await processSubscription(env, id, sub, threats, alertOblasts, alerts, features, nameByKey)
    } catch (err) {
      console.warn('sub process failed', id, err)
    }
  }

  return { subs: index.length, threats: threats.length }
}

async function handleSubscribe(request: Request, env: Env, origin: string | null) {
  const body = (await request.json()) as {
    subscription?: PushSubscription
    watched?: string[]
    kinds?: Partial<NotifyKinds>
  }
  const subscription = body.subscription
  if (!subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    return json({ error: 'invalid subscription' }, { status: 400 }, origin, env)
  }
  const watched = Array.isArray(body.watched)
    ? body.watched.filter((x) => typeof x === 'string').slice(0, 40)
    : []
  const kinds: NotifyKinds = {
    threats: body.kinds?.threats !== false,
    alerts: body.kinds?.alerts !== false,
  }
  if (!kinds.threats && !kinds.alerts) {
    kinds.threats = true
  }

  const id = await subIdForEndpoint(subscription.endpoint)
  const record: SubRecord = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    watched,
    kinds,
    updatedAt: Date.now(),
  }
  await env.PUSH_SUBS.put(SUB_PREFIX + id, JSON.stringify(record))
  const index = await readIndex(env)
  if (!index.includes(id)) {
    index.push(id)
    await writeIndex(env, index)
  }

  // Reset prime when watch list changes so we don't spam existing tracks.
  const state = await getState(env, id)
  state.primed = false
  state.alertPrimed = false
  state.inside = {}
  state.seen = []
  state.alerts = {}
  await putState(env, id, state)

  return json({ ok: true, id }, { status: 200 }, origin, env)
}

async function handleUnsubscribe(request: Request, env: Env, origin: string | null) {
  const body = (await request.json()) as { endpoint?: string }
  if (!body.endpoint) return json({ error: 'endpoint required' }, { status: 400 }, origin, env)
  const id = await subIdForEndpoint(body.endpoint)
  await removeSub(env, id)
  return json({ ok: true }, { status: 200 }, origin, env)
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    const origin = request.headers.get('Origin')

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin, env) })
    }

    if (url.pathname === '/vapid-public-key' && request.method === 'GET') {
      return json({ publicKey: env.VAPID_PUBLIC_KEY }, { status: 200 }, origin, env)
    }

    if (url.pathname === '/subscribe' && request.method === 'POST') {
      return handleSubscribe(request, env, origin)
    }

    if (url.pathname === '/unsubscribe' && request.method === 'POST') {
      return handleUnsubscribe(request, env, origin)
    }

    if (url.pathname === '/health' && request.method === 'GET') {
      return json({ ok: true, ts: new Date().toISOString() }, { status: 200 }, origin, env)
    }

    // Manual tick for debugging (same as cron).
    if (url.pathname === '/tick' && request.method === 'POST') {
      const result = await runWatchCycle(env)
      return json({ ok: true, ...result }, { status: 200 }, origin, env)
    }

    // Fire-and-forget test push to one endpoint (dev aid).
    if (url.pathname === '/test-push' && request.method === 'POST') {
      const body = (await request.json()) as { endpoint?: string }
      if (!body.endpoint) return json({ error: 'endpoint required' }, { status: 400 }, origin, env)
      const id = await subIdForEndpoint(body.endpoint)
      const sub = await getSub(env, id)
      if (!sub) return json({ error: 'not subscribed' }, { status: 404 }, origin, env)
      const result = await sendPush(
        env,
        sub,
        'Тривога.Карта',
        'Тестове фонове сповіщення',
        'test-push',
      )
      return json({ ok: result === 'ok', result }, { status: 200 }, origin, env)
    }

    return json({ error: 'not found' }, { status: 404 }, origin, env)
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      runWatchCycle(env).catch((err) => {
        console.error('cron watch failed', err)
      }),
    )
  },
}
