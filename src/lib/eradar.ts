import type { Feature, FeatureCollection, Polygon } from 'geojson'

/** eRadar — independent TG danger zones (Pages snapshot; no API key). */
export const ERADAR_ATTRIBUTION_URL = 'https://eradar.app/'
export const ERADAR_SELECT_PREFIX = 'eradar:'

const GITHUB_RAW =
  'https://raw.githubusercontent.com/Azerorh/alert-tracker/main/public/geo/eradar.json'

export type EradarZone = {
  id: string
  sourceId: number | string | null
  lat: number
  lon: number
  radiusKm: number
  name: string
  kind: string
  threatType: string
  channel: string
  excerpt: string
  lastSeen: string | null
  expiresAt: string | null
  confidence: number | null
}

export type EradarPayload = {
  fetchedAt: string
  source: string
  ttlSeconds: number
  keepMinutes: number
  alertAreaCount: number
  alertsStatus: string | null
  reportCount: number
  zones: EradarZone[]
}

function cacheBust(url: string): string {
  const t = Math.floor(Date.now() / 60_000)
  return `${url}${url.includes('?') ? '&' : '?'}t=${t}`
}

function parsePayload(json: unknown): EradarPayload | null {
  if (!json || typeof json !== 'object') return null
  const raw = json as Partial<EradarPayload>
  if (!Array.isArray(raw.zones)) return null
  return {
    fetchedAt: String(raw.fetchedAt ?? ''),
    source: String(raw.source ?? 'eradar'),
    ttlSeconds: Number(raw.ttlSeconds ?? 180),
    keepMinutes: Number(raw.keepMinutes ?? 45),
    alertAreaCount: Number(raw.alertAreaCount ?? 0),
    alertsStatus: raw.alertsStatus ?? null,
    reportCount: Number(raw.reportCount ?? 0),
    zones: raw.zones.filter(
      (z): z is EradarZone =>
        !!z &&
        Number.isFinite(z.lat) &&
        Number.isFinite(z.lon) &&
        Number.isFinite(z.radiusKm),
    ),
  }
}

export async function fetchEradarSnapshot(): Promise<EradarPayload | null> {
  const base = import.meta.env.BASE_URL || '/'
  const urls = [cacheBust(`${base}geo/eradar.json`), cacheBust(GITHUB_RAW)]
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: 'no-cache' })
      if (!res.ok) continue
      const parsed = parsePayload(await res.json())
      if (parsed) return parsed
    } catch {
      /* try next */
    }
  }
  return null
}

export function eradarSelectId(id: string): string {
  return id.startsWith(ERADAR_SELECT_PREFIX) ? id : `${ERADAR_SELECT_PREFIX}${id}`
}

export function parseEradarSelectId(id: string | null): string | null {
  if (!id?.startsWith(ERADAR_SELECT_PREFIX)) return null
  return id.slice(ERADAR_SELECT_PREFIX.length)
}

export function eradarZoneById(
  zones: EradarZone[],
  id: string | null,
): EradarZone | null {
  if (!id) return null
  const bare = parseEradarSelectId(id) ?? id
  return zones.find((z) => z.id === bare || eradarSelectId(z.id) === id) ?? null
}

function circleRing(lon: number, lat: number, radiusKm: number, steps = 40): [number, number][] {
  const coords: [number, number][] = []
  const R = 6371
  const lat1 = (lat * Math.PI) / 180
  const lon1 = (lon * Math.PI) / 180
  const angDist = radiusKm / R
  for (let i = 0; i <= steps; i++) {
    const bearing = (i / steps) * 2 * Math.PI
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(angDist) +
        Math.cos(lat1) * Math.sin(angDist) * Math.cos(bearing),
    )
    const lon2 =
      lon1 +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angDist) * Math.cos(lat1),
        Math.cos(angDist) - Math.sin(lat1) * Math.sin(lat2),
      )
    coords.push([(lon2 * 180) / Math.PI, (lat2 * 180) / Math.PI])
  }
  return coords
}

export function buildEradarFeatures(
  zones: EradarZone[],
  selectedId: string | null = null,
): FeatureCollection<Polygon> {
  const features: Feature<Polygon>[] = []
  for (const z of zones) {
    const sid = eradarSelectId(z.id)
    features.push({
      type: 'Feature',
      // id only via properties + promoteId (avoid clashing string Feature.id)
      properties: {
        id: sid,
        name: z.name,
        threatType: z.threatType,
        channel: z.channel,
        excerpt: z.excerpt,
        selected: selectedId === sid ? 1 : 0,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [circleRing(z.lon, z.lat, Math.max(4, Math.min(z.radiusKm, 28)))],
      },
    })
  }
  return { type: 'FeatureCollection', features }
}
