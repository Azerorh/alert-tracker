import { OBLASTS_GEOJSON_URL } from './neptun'
import type { Feature, FeatureCollection, Position } from 'geojson'

export type OblastMeta = {
  key: string
  name: string
}

function pointInRing(lon: number, lat: number, ring: Position[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0]!
    const yi = ring[i]![1]!
    const xj = ring[j]![0]!
    const yj = ring[j]![1]!
    const intersect =
      yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi + 0.0) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function pointInPolygonCoords(lon: number, lat: number, coords: Position[][]): boolean {
  if (!coords[0] || !pointInRing(lon, lat, coords[0])) return false
  // holes
  for (let h = 1; h < coords.length; h++) {
    if (coords[h] && pointInRing(lon, lat, coords[h]!)) return false
  }
  return true
}

export function pointInOblastFeature(lon: number, lat: number, feature: Feature): boolean {
  const g = feature.geometry
  if (!g) return false
  if (g.type === 'Polygon') return pointInPolygonCoords(lon, lat, g.coordinates)
  if (g.type === 'MultiPolygon') {
    return g.coordinates.some((poly) => pointInPolygonCoords(lon, lat, poly))
  }
  return false
}

export function findOblastKey(
  lon: number,
  lat: number,
  features: Feature[],
): string | null {
  for (const f of features) {
    const key = String(f.properties?.key ?? '')
    if (!key) continue
    if (pointInOblastFeature(lon, lat, f)) return key
  }
  return null
}

/**
 * City polygons are cut out of oblast polygons (e.g. Kyiv). Watching the oblast
 * should still cover the city, and vice-versa for alert UX.
 */
export const OBLAST_WATCH_GROUPS: readonly (readonly string[])[] = [
  ['київська', 'м. київ'],
  ['автономна республіка крим', 'севастополь'],
]

export function expandWatchedOblastKeys(watched: Iterable<string>): Set<string> {
  const set = new Set(watched)
  for (const group of OBLAST_WATCH_GROUPS) {
    if (group.some((k) => set.has(k))) {
      for (const k of group) set.add(k)
    }
  }
  return set
}

/** Prefer city keys when both city + oblast geometries match a watched set. */
export function matchWatchedOblastKey(
  lon: number,
  lat: number,
  watched: Set<string>,
  features: Feature[],
): string | null {
  if (!watched.size) return null
  const hits: string[] = []
  for (const f of features) {
    const key = String(f.properties?.key ?? '')
    if (!key || !watched.has(key)) continue
    if (pointInOblastFeature(lon, lat, f)) hits.push(key)
  }
  if (!hits.length) return null
  hits.sort((a, b) => {
    const score = (k: string) => (k.startsWith('м.') || k === 'севастополь' ? 0 : 1)
    return score(a) - score(b)
  })
  return hits[0] ?? null
}

export async function loadOblastCatalog(): Promise<{
  list: OblastMeta[]
  features: Feature[]
}> {
  const res = await fetch(OBLASTS_GEOJSON_URL)
  if (!res.ok) throw new Error(`oblasts ${res.status}`)
  const fc = (await res.json()) as FeatureCollection
  const features = (fc.features ?? []).filter((f) => f.properties?.key)
  const list = features
    .map((f) => ({
      key: String(f.properties!.key),
      // City features (e.g. Kyiv) use `name`; oblasts use `region`.
      name: String(f.properties!.region ?? f.properties!.name ?? f.properties!.key),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'uk'))
  return { list, features }
}
