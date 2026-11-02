/**
 * eRadar public JSON (no key). CORS is closed for browsers — snapshot for Pages.
 * Keeps TG-derived danger zones; skips pure official-alert mirrors (NEPTUN already paints those).
 */

export const ERADAR_BASE = 'https://eradar.app'
export const ERADAR_ATTRIBUTION_URL = 'https://eradar.app/'

/** Keep zones a while after eRadar's short TTL so 15‑min Actions still useful. */
export const ERADAR_KEEP_MS = 45 * 60_000
export const ERADAR_MAX_ZONES = 18
/** Skip oblast-scale blobs that would flood the map. */
export const ERADAR_MAX_RADIUS_KM = 55
/** Draw cap — even if source radius is larger. */
export const ERADAR_DRAW_RADIUS_KM = 28

const UA = 'alert-tracker/1.0 (+https://github.com/Azerorh/alert-tracker)'

function finite(n) {
  return Number.isFinite(n)
}

/** Official alert-status posts duplicate NEPTUN raion fills — drop them. */
export function isEradarMapWorthy(raw) {
  if (!raw || typeof raw !== 'object') return false
  const lat = Number(raw.lat)
  const lng = Number(raw.lng ?? raw.lon)
  if (!finite(lat) || !finite(lng)) return false
  const threat = String(raw.threat_type ?? '')
  const eventKind = String(raw.event_kind ?? raw.metadata?.event_kind ?? '')
  const channel = String(raw.channel ?? '')
  if (
    (threat === 'air_alert' || eventKind === 'alert_status') &&
    (/ukrainealarmsignal/i.test(channel) || eventKind === 'alert_status')
  ) {
    return false
  }
  const radius = Number(raw.radius_km)
  if (finite(radius) && radius > ERADAR_MAX_RADIUS_KM) return false
  return true
}

export function normalizeEradarDanger(raw, now = Date.now()) {
  if (!isEradarMapWorthy(raw)) return null
  const lastSeen = Date.parse(String(raw.last_seen ?? raw.observed_at ?? ''))
  const expiresAt = Date.parse(String(raw.expires_at ?? ''))
  const anchor = Number.isFinite(lastSeen)
    ? lastSeen
    : Number.isFinite(expiresAt)
      ? expiresAt
      : now
  if (now - anchor > ERADAR_KEEP_MS) return null

  const lat = Number(raw.lat)
  const lon = Number(raw.lng ?? raw.lon)
  const srcRadius = Number(raw.radius_km)
  const radiusKm = Math.min(
    finite(srcRadius) && srcRadius > 0 ? srcRadius : 12,
    ERADAR_DRAW_RADIUS_KM,
  )

  return {
    id: `eradar-${raw.id ?? `${lat.toFixed(3)}-${lon.toFixed(3)}`}`,
    sourceId: raw.id ?? null,
    lat,
    lon,
    radiusKm,
    name: String(raw.canonical_name ?? raw.name ?? ''),
    kind: String(raw.kind ?? ''),
    threatType: String(raw.threat_type ?? 'unknown'),
    channel: String(raw.channel ?? ''),
    excerpt: String(raw.message_excerpt ?? raw.segment_text ?? '').slice(0, 280),
    lastSeen: Number.isFinite(lastSeen) ? new Date(lastSeen).toISOString() : null,
    expiresAt: Number.isFinite(expiresAt) ? new Date(expiresAt).toISOString() : null,
    confidence: typeof raw.confidence === 'number' ? raw.confidence : null,
  }
}

export async function fetchEradarPayload() {
  const headers = { Accept: 'application/json', 'User-Agent': UA }
  const [dangersRes, statusRes] = await Promise.all([
    fetch(`${ERADAR_BASE}/api/dangers`, { headers }),
    fetch(`${ERADAR_BASE}/api/status`, { headers }),
  ])
  if (!dangersRes.ok) throw new Error(`eRadar dangers HTTP ${dangersRes.status}`)
  if (!statusRes.ok) throw new Error(`eRadar status HTTP ${statusRes.status}`)

  const dangersJson = await dangersRes.json()
  const statusJson = await statusRes.json()
  const now = Date.now()

  const zones = []
  const seen = new Set()
  for (const raw of dangersJson.dangers ?? []) {
    const z = normalizeEradarDanger(raw, now)
    if (!z || seen.has(z.id)) continue
    seen.add(z.id)
    zones.push(z)
  }

  // Soft fill from short-lived TG reports with coords (rare).
  for (const raw of statusJson.reports?.items ?? []) {
    const lat = Number(raw.lat)
    const lon = Number(raw.lng ?? raw.lon)
    if (!finite(lat) || !finite(lon)) continue
    const id = `eradar-report-${raw.geo_key ?? `${lat.toFixed(3)}-${lon.toFixed(3)}`}`
    if (seen.has(id)) continue
    const lastSeen = Date.parse(String(raw.last_seen ?? ''))
    if (Number.isFinite(lastSeen) && now - lastSeen > ERADAR_KEEP_MS) continue
    seen.add(id)
    zones.push({
      id,
      sourceId: null,
      lat,
      lon,
      radiusKm: 14,
      name: String(raw.name ?? ''),
      kind: String(raw.kind ?? 'report'),
      threatType: String(raw.threat_type ?? 'report'),
      channel: 'report',
      excerpt: '',
      lastSeen: Number.isFinite(lastSeen) ? new Date(lastSeen).toISOString() : null,
      expiresAt: raw.expires_at ? String(raw.expires_at) : null,
      confidence: null,
    })
  }

  zones.sort((a, b) => Date.parse(b.lastSeen ?? 0) - Date.parse(a.lastSeen ?? 0))
  const clipped = zones.slice(0, ERADAR_MAX_ZONES)

  return {
    fetchedAt: new Date().toISOString(),
    source: 'eradar',
    ttlSeconds: Number(dangersJson.ttl_seconds ?? 180),
    keepMinutes: ERADAR_KEEP_MS / 60_000,
    alertAreaCount: Array.isArray(statusJson.alerts?.areas)
      ? statusJson.alerts.areas.length
      : 0,
    alertsStatus: statusJson.alerts?.status ?? null,
    reportCount: Array.isArray(statusJson.reports?.items)
      ? statusJson.reports.items.length
      : 0,
    zones: clipped,
  }
}
