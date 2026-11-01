/**
 * Pull latest DeepStateMap snapshot and write Ukraine control polygons:
 * occupied (dark red) + unknown/gray status zone.
 * Source: https://deepstatemap.live/api/history/last
 */
import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_PUBLIC = resolve(__dirname, '../public/geo/occupied.geojson')
const OUT_SRC = resolve(__dirname, '../src/data/occupied.geojson')
const URL = 'https://deepstatemap.live/api/history/last'

function classify(feature) {
  const name = feature.properties?.name || ''
  if (
    /geoJSON\.status\.occupied/i.test(name) ||
    /geoJSON\.territories\.(ordlo|crimea|tuzla)/i.test(name)
  ) {
    return 'occupied'
  }
  // DeepState «сіра» зона — статус невідомий / спірний контроль
  if (/geoJSON\.status\.unknown/i.test(name)) {
    return 'unknown'
  }
  return null
}

function stripZ(coords) {
  if (typeof coords[0] === 'number') return coords.slice(0, 2)
  return coords.map(stripZ)
}

const res = await fetch(URL, {
  headers: { Accept: 'application/json', 'User-Agent': 'alert-tracker/1.0' },
})
if (!res.ok) throw new Error(`DeepState HTTP ${res.status}`)
const data = await res.json()

const counts = { occupied: 0, unknown: 0 }
const features = []
for (const f of data.map?.features || []) {
  const kind = classify(f)
  if (!kind) continue
  counts[kind] += 1
  features.push({
    type: 'Feature',
    properties: {
      kind,
      name: String(f.properties?.name || '')
        .split('///')[0]
        .trim()
        .replace(/\s+/g, ' '),
    },
    geometry: {
      type: f.geometry.type,
      coordinates: stripZ(f.geometry.coordinates),
    },
  })
}

const out = {
  type: 'FeatureCollection',
  features,
  meta: {
    source: 'DeepStateMap.live',
    sourceUrl: 'https://deepstatemap.live/',
    datetime: data.datetime ?? null,
    id: data.id ?? null,
    extractedAt: new Date().toISOString(),
    kinds: counts,
  },
}

const payload = JSON.stringify(out)
writeFileSync(OUT_PUBLIC, payload)
writeFileSync(OUT_SRC, payload)
console.log(
  `Wrote ${features.length} features (occupied ${counts.occupied}, unknown/gray ${counts.unknown}) → ${OUT_PUBLIC} & ${OUT_SRC}`,
)
