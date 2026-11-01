import type { FeatureCollection, Geometry } from 'geojson'

type Ring = [number, number][]

let hostileRings: Ring[] = []

function pushRing(coords: number[][]) {
  if (coords.length < 4) return
  hostileRings.push(coords.map((c) => [c[0], c[1]] as [number, number]))
}

function collectRings(geometry: Geometry | null | undefined) {
  if (!geometry) return
  if (geometry.type === 'Polygon') {
    for (const ring of geometry.coordinates) pushRing(ring)
    return
  }
  if (geometry.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates) {
      for (const ring of poly) pushRing(ring)
    }
  }
}

/** Cache Russia outline (+ optional occupied) for sync point checks. */
export function setHostileAirspace(layers: FeatureCollection[]) {
  hostileRings = []
  for (const fc of layers) {
    for (const f of fc.features ?? []) {
      collectRings(f.geometry)
    }
  }
}

export function hostileAirspaceReady(): boolean {
  return hostileRings.length > 0
}

/** Ray-cast point-in-polygon (lon/lat). */
export function isOverRussia(lat: number, lon: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !hostileRings.length) {
    return false
  }
  for (const ring of hostileRings) {
    if (pointInRing(lon, lat, ring)) return true
  }
  return false
}

function pointInRing(x: number, y: number, ring: Ring): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]
    const yi = ring[i][1]
    const xj = ring[j][0]
    const yj = ring[j][1]
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 0.0) + xi
    if (intersect) inside = !inside
  }
  return inside
}
