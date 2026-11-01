/** Compact settlement gazetteer (bundled JSON) for place→coords. */

export const GEO_BOUNDS = { latMin: 44.0, latMax: 54.5, lonMin: 21.5, lonMax: 48.5 }

export type PlaceHit = {
  lat: number
  lon: number
  precision: 'place'
  place: string
}

type PlaceEntry = { name: string; lat: number; lon: number }

let placeIndex: PlaceEntry[] | null = null
let loadPromise: Promise<PlaceEntry[]> | null = null

function inBounds(lat: number, lon: number): boolean {
  return (
    lat >= GEO_BOUNDS.latMin &&
    lat <= GEO_BOUNDS.latMax &&
    lon >= GEO_BOUNDS.lonMin &&
    lon <= GEO_BOUNDS.lonMax
  )
}

export function normalizePlaceHaystack(text: string): string {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[''`´ʼ’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

async function loadPlaceIndex(): Promise<PlaceEntry[]> {
  if (placeIndex) return placeIndex
  if (loadPromise) return loadPromise
  loadPromise = (async () => {
    const base = import.meta.env.BASE_URL || '/'
    const res = await fetch(`${base}geo/ua-rf-places.json`, { cache: 'force-cache' })
    if (!res.ok) throw new Error(`places ${res.status}`)
    const raw = (await res.json()) as {
      places?: Array<{ names: string[]; lat: number; lon: number }>
    }
    const entries: PlaceEntry[] = []
    for (const p of raw.places ?? []) {
      if (!inBounds(p.lat, p.lon)) continue
      for (const name of p.names ?? []) {
        const n = normalizePlaceHaystack(name)
        if (n.length < 3) continue
        entries.push({ name: n, lat: p.lat, lon: p.lon })
      }
    }
    entries.sort((a, b) => b.name.length - a.name.length)
    placeIndex = entries
    return entries
  })()
  try {
    return await loadPromise
  } catch (err) {
    loadPromise = null
    throw err
  }
}

export async function ensurePlaceIndex(): Promise<PlaceEntry[]> {
  try {
    return await loadPlaceIndex()
  } catch {
    return []
  }
}

export function extractPlaceFromText(text: string, index: PlaceEntry[]): PlaceHit | null {
  if (!text || !index.length) return null
  const hay = normalizePlaceHaystack(text)
  for (const p of index) {
    const escaped = p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?=[^\\p{L}\\p{N}]|$)`, 'iu')
    if (re.test(hay)) {
      return { lat: p.lat, lon: p.lon, precision: 'place', place: p.name }
    }
  }
  return null
}

export function geocodeWarspottingPlace(
  location: string,
  index: PlaceEntry[],
): PlaceHit | null {
  if (!location || !index.length) return null
  const parts = String(location)
    .split(',')
    .map((p) =>
      normalizePlaceHaystack(p)
        .replace(/\b(raion|район|oblast|область|district)\b/gi, '')
        .trim(),
    )
    .filter((p) => p.length >= 3)

  for (const part of parts) {
    const exact = index.find((e) => e.name === part)
    if (exact) {
      return { lat: exact.lat, lon: exact.lon, precision: 'place', place: exact.name }
    }
  }
  for (const part of parts) {
    for (const e of index) {
      if (part === e.name || part.includes(e.name) || e.name.includes(part)) {
        if (Math.min(part.length, e.name.length) < 4) continue
        return { lat: e.lat, lon: e.lon, precision: 'place', place: e.name }
      }
    }
  }
  return extractPlaceFromText(location, index)
}
