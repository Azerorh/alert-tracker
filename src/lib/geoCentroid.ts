/** Approximate polygon centroid (average of exterior ring vertices). */
export function polygonCentroid(
  geometry: { type: string; coordinates: unknown },
): [number, number] | null {
  const ring = exteriorRing(geometry)
  if (!ring || ring.length < 3) return null
  let sx = 0
  let sy = 0
  let n = 0
  const limit = ring.length - 1
  for (let i = 0; i < limit; i++) {
    const c = ring[i]
    if (!Array.isArray(c) || c.length < 2) continue
    const x = Number(c[0])
    const y = Number(c[1])
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    sx += x
    sy += y
    n++
  }
  if (n < 1) return null
  return [sx / n, sy / n]
}

function exteriorRing(geometry: { type: string; coordinates: unknown }): unknown[] | null {
  const c = geometry.coordinates
  if (geometry.type === 'Polygon' && Array.isArray(c) && Array.isArray(c[0])) {
    return c[0] as unknown[]
  }
  if (geometry.type === 'MultiPolygon' && Array.isArray(c)) {
    let best: unknown[] | null = null
    let bestLen = 0
    for (const poly of c) {
      if (!Array.isArray(poly) || !Array.isArray(poly[0])) continue
      const ring = poly[0] as unknown[]
      if (ring.length > bestLen) {
        best = ring
        bestLen = ring.length
      }
    }
    return best
  }
  return null
}

export function indexCentroidsByKey(
  fc: {
    features?: Array<{
      geometry?: { type: string; coordinates?: unknown } | null
      properties?: { key?: string } | null
      id?: string | number
    }>
  },
): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>()
  for (const f of fc.features ?? []) {
    const key = f.properties?.key ?? (typeof f.id === 'string' ? f.id : null)
    if (!key || !f.geometry || f.geometry.coordinates == null) continue
    const c = polygonCentroid(
      f.geometry as { type: string; coordinates: unknown },
    )
    if (c) out.set(key, c)
  }
  return out
}
