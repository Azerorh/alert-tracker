/**
 * Shared settlement gazetteer for WarSpotting place strings + TG sightings.
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const GEO_BOUNDS = { latMin: 44.0, latMax: 54.5, lonMin: 21.5, lonMax: 48.5 }

const PLACES_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'public',
  'geo',
  'ua-rf-places.json',
)

/** @type {Array<{ name: string, lat: number, lon: number }> | null} */
let placeIndex = null

export function inBounds(lat, lon) {
  return (
    lat >= GEO_BOUNDS.latMin &&
    lat <= GEO_BOUNDS.latMax &&
    lon >= GEO_BOUNDS.lonMin &&
    lon <= GEO_BOUNDS.lonMax
  )
}

export function normalizePlaceHaystack(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[''`´ʼ]/g, "'")
    .replace(/[ʼ’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

export async function loadPlaceIndex() {
  if (placeIndex) return placeIndex
  const raw = JSON.parse(await readFile(PLACES_PATH, 'utf8'))
  const entries = []
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
  return placeIndex
}

/** Match a place name mentioned in free text (longest first). */
export function extractPlaceFromText(text, index) {
  const all = extractPlacesFromText(text, index)
  return all[0] ?? null
}

/**
 * All place mentions in first-appearance order (longest names claim ranges first).
 * @returns {{ lat: number, lon: number, precision: 'place', place: string }[]}
 */
export function extractPlacesFromText(text, index) {
  if (!text || !index?.length) return []
  const hay = normalizePlaceHaystack(text)
  const hits = []
  const ranges = []
  for (const p of index) {
    const escaped = p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(
      `(?:^|[^\\p{L}\\p{N}])(${escaped})(?=[^\\p{L}\\p{N}]|$)`,
      'iu',
    )
    const m = re.exec(hay)
    if (!m || m.index == null) continue
    // group 1 may start after the boundary char
    const rawStart = m.index
    const matched = m[1] ?? m[0]
    const start = hay.indexOf(matched, rawStart)
    const end = start + matched.length
    if (ranges.some(([s, e]) => start < e && end > s)) continue
    ranges.push([start, end])
    hits.push({
      lat: p.lat,
      lon: p.lon,
      precision: 'place',
      place: p.name,
      index: start,
    })
  }
  hits.sort((a, b) => a.index - b.index)
  const out = []
  const seen = new Set()
  for (const h of hits) {
    const sig = `${h.lat.toFixed(3)},${h.lon.toFixed(3)}`
    if (seen.has(sig)) continue
    seen.add(sig)
    out.push({
      lat: h.lat,
      lon: h.lon,
      precision: 'place',
      place: h.place,
    })
  }
  return out
}

/**
 * WarSpotting `nearest_location` like "Hranitne, Volnovakha raion".
 * Try settlement first, then raion/oblast token.
 */
export function geocodeWarspottingPlace(location, index) {
  if (!location || !index?.length) return null
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
  // Partial: first segment contained in / contains a gazetteer name
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
