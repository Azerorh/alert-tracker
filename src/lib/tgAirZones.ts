import type { FeatureCollection, Polygon } from 'geojson'
import {
  buildEradarFeatures,
  eradarSelectId,
  eradarZoneById,
  fetchEradarSnapshot,
  type EradarZone,
  parseEradarSelectId,
} from './eradar'

export type { EradarZone as TgAirZone }
export {
  buildEradarFeatures as buildTgAirFeatures,
  eradarSelectId as tgAirSelectId,
  eradarZoneById as tgAirZoneById,
  parseEradarSelectId as parseTgAirSelectId,
}

const UA_TG_RAW =
  'https://raw.githubusercontent.com/Azerorh/alert-tracker/main/public/geo/ua-air-tg.json'

const MERGED_MAX = 18

function cacheBust(url: string): string {
  const t = Math.floor(Date.now() / 60_000)
  return `${url}${url.includes('?') ? '&' : '?'}t=${t}`
}

function gridKey(lat: number, lon: number): string {
  return `${lat.toFixed(2)},${lon.toFixed(2)}`
}

function parseUaZones(json: unknown): EradarZone[] {
  if (!json || typeof json !== 'object') return []
  const zones = (json as { zones?: unknown }).zones
  if (!Array.isArray(zones)) return []
  const out: EradarZone[] = []
  for (const raw of zones) {
    if (!raw || typeof raw !== 'object') continue
    const z = raw as Partial<EradarZone> & { origin?: string }
    if (!Number.isFinite(z.lat) || !Number.isFinite(z.lon)) continue
    out.push({
      id: String(z.id ?? `ua-tg-${z.lat},${z.lon}`),
      sourceId: z.sourceId ?? null,
      lat: Number(z.lat),
      lon: Number(z.lon),
      radiusKm: Number(z.radiusKm ?? 14),
      name: String(z.name ?? ''),
      kind: String(z.kind ?? 'place'),
      threatType: String(z.threatType ?? 'drone'),
      channel: String(z.channel ?? ''),
      excerpt: String(z.excerpt ?? ''),
      lastSeen: z.lastSeen ?? null,
      expiresAt: z.expiresAt ?? null,
      confidence: typeof z.confidence === 'number' ? z.confidence : null,
    })
  }
  return out
}

export async function fetchUaAirTgSnapshot(): Promise<EradarZone[]> {
  const base = import.meta.env.BASE_URL || '/'
  const urls = [cacheBust(`${base}geo/ua-air-tg.json`), cacheBust(UA_TG_RAW)]
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: 'no-cache' })
      if (!res.ok) continue
      return parseUaZones(await res.json())
    } catch {
      /* try next */
    }
  }
  return []
}

/** Merge eRadar + UA TG place buffers; one zone per ~grid cell, newest wins. */
export function mergeTgAirZones(
  eradarZones: EradarZone[],
  uaZones: EradarZone[],
  max = MERGED_MAX,
): EradarZone[] {
  const byGrid = new Map<string, EradarZone>()
  const consider = (z: EradarZone) => {
    const key = gridKey(z.lat, z.lon)
    const prev = byGrid.get(key)
    const ts = Date.parse(z.lastSeen ?? '') || 0
    const prevTs = Date.parse(prev?.lastSeen ?? '') || 0
    if (!prev || ts >= prevTs) byGrid.set(key, z)
  }
  // Prefer longer-lived UA TG first, then fill gaps with eRadar.
  for (const z of uaZones) consider(z)
  for (const z of eradarZones) consider(z)
  return [...byGrid.values()]
    .sort((a, b) => Date.parse(b.lastSeen ?? '') - Date.parse(a.lastSeen ?? ''))
    .slice(0, max)
}

export async function fetchMergedTgAirZones(): Promise<{
  zones: EradarZone[]
  eradarCount: number
  uaTgCount: number
  ok: boolean
}> {
  const [eradar, uaZones] = await Promise.all([
    fetchEradarSnapshot(),
    fetchUaAirTgSnapshot(),
  ])
  const eradarZones = eradar?.zones ?? []
  const ok = !!eradar || uaZones.length > 0
  return {
    zones: mergeTgAirZones(eradarZones, uaZones),
    eradarCount: eradarZones.length,
    uaTgCount: uaZones.length,
    ok,
  }
}

export function buildMergedTgAirFeatures(
  zones: EradarZone[],
  selectedId: string | null = null,
): FeatureCollection<Polygon> {
  return buildEradarFeatures(zones, selectedId)
}

export { eradarSelectId, eradarZoneById }
