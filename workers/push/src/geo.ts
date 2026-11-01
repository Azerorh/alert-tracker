type Position = number[]

export type OblastFeature = {
  type: 'Feature'
  properties?: { key?: string; region?: string; name?: string } | null
  geometry:
    | { type: 'Polygon'; coordinates: Position[][] }
    | { type: 'MultiPolygon'; coordinates: Position[][][] }
    | { type: string; coordinates: unknown }
}

const OBLAST_WATCH_GROUPS: readonly (readonly string[])[] = [
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
  for (let h = 1; h < coords.length; h++) {
    if (coords[h] && pointInRing(lon, lat, coords[h]!)) return false
  }
  return true
}

function pointInFeature(lon: number, lat: number, feature: OblastFeature): boolean {
  const g = feature.geometry
  if (!g) return false
  if (g.type === 'Polygon') return pointInPolygonCoords(lon, lat, g.coordinates)
  if (g.type === 'MultiPolygon') {
    return g.coordinates.some((poly) => pointInPolygonCoords(lon, lat, poly))
  }
  return false
}

/** Prefer city keys when both city + oblast geometries match. */
export function matchWatchedOblastKey(
  lon: number,
  lat: number,
  watched: Set<string>,
  features: OblastFeature[],
): string | null {
  if (!watched.size) return null
  const hits: string[] = []
  for (const f of features) {
    const key = String(f.properties?.key ?? '')
    if (!key || !watched.has(key)) continue
    if (pointInFeature(lon, lat, f)) hits.push(key)
  }
  if (!hits.length) return null
  hits.sort((a, b) => {
    const score = (k: string) => (k.startsWith('м.') || k === 'севастополь' ? 0 : 1)
    return score(a) - score(b)
  })
  return hits[0] ?? null
}

export function oblastDisplayName(feature: OblastFeature | undefined, key: string): string {
  if (!feature?.properties) return key
  return String(feature.properties.region ?? feature.properties.name ?? key)
}
