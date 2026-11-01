import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'

type CacheEntry<T> = {
  ok: boolean
  fetchedAt: number | null
  lagMs: number | null
  error: string | null
  data: T | null
}

const NEPTUN = 'https://neptun.in.ua'
const MAPA = 'https://mapa.ua/api/v1/current'
const DSM = 'https://dronestrikemap.com'
const RADAR_MAP = 'https://radar-map.ru'
const PORT = Number(process.env.PORT || 8787)
const HIDE_TRACKS = process.env.HIDE_TRACKS === '1'
const DSM_CACHE_TTL_MS = 10 * 60_000
const RADAR_CACHE_TTL_MS = 30_000

const app = new Hono()
app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'OPTIONS'],
  }),
)

const neptunThreats: CacheEntry<unknown> = blank()
const neptunAlerts: CacheEntry<unknown> = blank()
const mapaCurrent: CacheEntry<unknown> = blank()
const dsmDayCache = new Map<string, CacheEntry<unknown>>()
const dsmSites: CacheEntry<unknown> = blank()
const dsmAlerts: CacheEntry<unknown> = blank()
const radarMapState: CacheEntry<unknown> = blank()

function blank<T>(): CacheEntry<T> {
  return { ok: false, fetchedAt: null, lagMs: null, error: null, data: null }
}

async function refresh<T>(
  entry: CacheEntry<T>,
  url: string,
  parse: (json: unknown) => T = (j) => j as T,
): Promise<void> {
  const started = Date.now()
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'alert-tracker-bff/1.0' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = parse(await res.json())
    entry.ok = true
    entry.data = json
    entry.fetchedAt = Date.now()
    entry.lagMs = Date.now() - started
    entry.error = null
  } catch (err) {
    entry.ok = false
    entry.error = err instanceof Error ? err.message : String(err)
    entry.lagMs = Date.now() - started
  }
}

async function tick() {
  await Promise.all([
    refresh(neptunThreats, `${NEPTUN}/api/v1/threats`),
    refresh(neptunAlerts, `${NEPTUN}/api/v1/alerts`),
    refresh(mapaCurrent, MAPA),
  ])
}

void tick()
setInterval(() => {
  void tick()
}, 8_000)

function sourceView(name: string, entry: CacheEntry<unknown>, extra?: Record<string, unknown>) {
  const ageSec =
    entry.fetchedAt != null ? Math.round((Date.now() - entry.fetchedAt) / 1000) : null
  return {
    name,
    ok: entry.ok,
    ageSec,
    lagMs: entry.lagMs,
    error: entry.error,
    stale: ageSec != null ? ageSec > 45 : true,
    ...extra,
  }
}

app.get('/api/health', (c) => c.json({ ok: true, ts: new Date().toISOString() }))

app.get('/api/status', (c) => {
  const threatCount =
    neptunThreats.data &&
    typeof neptunThreats.data === 'object' &&
    Array.isArray((neptunThreats.data as { threats?: unknown[] }).threats)
      ? (neptunThreats.data as { threats: unknown[] }).threats.length
      : null
  const mapaCount =
    mapaCurrent.data &&
    typeof mapaCurrent.data === 'object' &&
    Array.isArray((mapaCurrent.data as { objects?: unknown[] }).objects)
      ? (mapaCurrent.data as { objects: unknown[] }).objects.filter(
          (o) => (o as { status?: string }).status === 'active',
        ).length
      : null

  return c.json({
    serverTime: new Date().toISOString(),
    hideTracks: HIDE_TRACKS,
    sources: [
      sourceView('neptun', neptunThreats, { threatCount }),
      sourceView('neptun-alerts', neptunAlerts),
      sourceView('mapa', mapaCurrent, { activeObjects: mapaCount }),
    ],
  })
})

app.get('/api/neptun/threats', (c) => {
  if (HIDE_TRACKS) {
    return c.json({
      serverTime: new Date().toISOString(),
      threats: [],
      cached: true,
      hideTracks: true,
    })
  }
  if (!neptunThreats.data) {
    return c.json({ error: neptunThreats.error ?? 'not ready' }, 503)
  }
  return c.json({
    ...(neptunThreats.data as object),
    cachedAt: neptunThreats.fetchedAt
      ? new Date(neptunThreats.fetchedAt).toISOString()
      : null,
  })
})

app.get('/api/neptun/alerts', (c) => {
  if (!neptunAlerts.data) {
    return c.json({ error: neptunAlerts.error ?? 'not ready' }, 503)
  }
  return c.json({
    ...(neptunAlerts.data as object),
    cachedAt: neptunAlerts.fetchedAt
      ? new Date(neptunAlerts.fetchedAt).toISOString()
      : null,
  })
})

app.get('/api/mapa/current', (c) => {
  if (HIDE_TRACKS) {
    return c.json({ objects: [], attack: null, hideTracks: true })
  }
  if (!mapaCurrent.data) {
    return c.json({ error: mapaCurrent.error ?? 'not ready' }, 503)
  }
  return c.json({
    ...(mapaCurrent.data as object),
    cachedAt: mapaCurrent.fetchedAt
      ? new Date(mapaCurrent.fetchedAt).toISOString()
      : null,
  })
})

async function refreshDsmDay(date: string): Promise<CacheEntry<unknown>> {
  let entry = dsmDayCache.get(date)
  if (!entry) {
    entry = blank()
    dsmDayCache.set(date, entry)
  }
  const fresh =
    entry.ok &&
    entry.fetchedAt != null &&
    Date.now() - entry.fetchedAt < DSM_CACHE_TTL_MS
  if (!fresh) {
    await refresh(entry, `${DSM}/api/day/${date}`)
  }
  return entry
}

async function refreshDsmSites(): Promise<CacheEntry<unknown>> {
  const fresh =
    dsmSites.ok &&
    dsmSites.fetchedAt != null &&
    Date.now() - dsmSites.fetchedAt < DSM_CACHE_TTL_MS
  if (!fresh) {
    await refresh(dsmSites, `${DSM}/api/sites`)
  }
  return dsmSites
}

app.get('/api/dsm/day/:date', async (c) => {
  const date = c.req.param('date')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return c.json({ error: 'bad date' }, 400)
  }
  const entry = await refreshDsmDay(date)
  if (!entry.data) {
    return c.json({ error: entry.error ?? 'not ready' }, 503)
  }
  return c.json({
    ...(entry.data as object),
    cachedAt: entry.fetchedAt ? new Date(entry.fetchedAt).toISOString() : null,
  })
})

app.get('/api/dsm/sites', async (c) => {
  const entry = await refreshDsmSites()
  if (!entry.data) {
    return c.json({ error: entry.error ?? 'not ready' }, 503)
  }
  return c.json({
    ...(entry.data as object),
    cachedAt: entry.fetchedAt ? new Date(entry.fetchedAt).toISOString() : null,
  })
})

async function refreshDsmAlerts(): Promise<CacheEntry<unknown>> {
  const fresh =
    dsmAlerts.ok &&
    dsmAlerts.fetchedAt != null &&
    Date.now() - dsmAlerts.fetchedAt < DSM_CACHE_TTL_MS
  if (!fresh) {
    await refresh(dsmAlerts, `${DSM}/api/alerts`)
  }
  return dsmAlerts
}

async function refreshRadarMap(): Promise<CacheEntry<unknown>> {
  const fresh =
    radarMapState.ok &&
    radarMapState.fetchedAt != null &&
    Date.now() - radarMapState.fetchedAt < RADAR_CACHE_TTL_MS
  if (!fresh) {
    await refresh(radarMapState, `${RADAR_MAP}/api/state`)
  }
  return radarMapState
}

app.get('/api/dsm/alerts', async (c) => {
  const entry = await refreshDsmAlerts()
  if (!entry.data) {
    return c.json({ error: entry.error ?? 'not ready' }, 503)
  }
  return c.json({
    ...(entry.data as object),
    cachedAt: entry.fetchedAt ? new Date(entry.fetchedAt).toISOString() : null,
  })
})

app.get('/api/radar-map/state', async (c) => {
  const entry = await refreshRadarMap()
  if (!entry.data) {
    return c.json({ error: entry.error ?? 'not ready' }, 503)
  }
  return c.json({
    ...(entry.data as object),
    cachedAt: entry.fetchedAt ? new Date(entry.fetchedAt).toISOString() : null,
  })
})

console.log(`[bff] listening on http://127.0.0.1:${PORT}`)
serve({ fetch: app.fetch, port: PORT })
