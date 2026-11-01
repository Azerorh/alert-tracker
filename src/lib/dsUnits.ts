import type { GroundCategory } from './warspotting'

export type DsUnit = {
  id: string
  lat: number
  lon: number
  title: string
  role: 'enemy' | 'hq' | 'storm' | string
  category: GroundCategory | string
}

type UnitFeature = {
  geometry?: { type?: string; coordinates?: number[] }
  properties?: Record<string, unknown> | null
}

export function parseDsUnitsGeoJson(json: unknown): DsUnit[] {
  const feats = (json as { features?: UnitFeature[] }).features
  if (!Array.isArray(feats)) return []
  const out: DsUnit[] = []
  for (const f of feats) {
    if (f.geometry?.type !== 'Point') continue
    const coords = f.geometry.coordinates ?? []
    const lon = Number(coords[0])
    const lat = Number(coords[1])
    const p = f.properties ?? {}
    const id = typeof p.id === 'string' ? p.id : null
    const title =
      typeof p.title === 'string' ? p.title : typeof p.label === 'string' ? p.label : null
    if (!id || !title || !Number.isFinite(lat) || !Number.isFinite(lon)) continue
    out.push({
      id,
      lat,
      lon,
      title,
      role: typeof p.role === 'string' ? p.role : 'enemy',
      category: typeof p.category === 'string' ? p.category : 'other',
    })
  }
  return out
}
