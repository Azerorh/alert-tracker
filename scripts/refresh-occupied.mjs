/**
 * Pull latest DeepStateMap snapshot and write:
 * - occupied + unknown/gray polygons
 * - RF attack-direction arrows
 * - RF unit approximate positions (current snapshot; no per-point dates)
 * Source: https://deepstatemap.live/api/history/last
 */
import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_OCCUPIED_PUBLIC = resolve(__dirname, '../public/geo/occupied.geojson')
const OUT_OCCUPIED_SRC = resolve(__dirname, '../src/data/occupied.geojson')
const OUT_ARROWS_PUBLIC = resolve(__dirname, '../public/geo/ds-attacks.geojson')
const OUT_ARROWS_SRC = resolve(__dirname, '../src/data/ds-attacks.geojson')
const OUT_UNITS_PUBLIC = resolve(__dirname, '../public/geo/ds-units.geojson')
const OUT_UNITS_SRC = resolve(__dirname, '../src/data/ds-units.geojson')
const URL = 'https://deepstatemap.live/api/history/last'

/** Same theater box as RF sightings. */
const GEO_BOUNDS = { latMin: 44.0, latMax: 54.5, lonMin: 21.5, lonMax: 48.5 }

function inBounds(lat, lon) {
  return (
    lat >= GEO_BOUNDS.latMin &&
    lat <= GEO_BOUNDS.latMax &&
    lon >= GEO_BOUNDS.lonMin &&
    lon <= GEO_BOUNDS.lonMax
  )
}

function classifyPoly(feature) {
  const name = feature.properties?.name || ''
  if (
    /geoJSON\.status\.occupied/i.test(name) ||
    /geoJSON\.territories\.(ordlo|crimea|tuzla)/i.test(name)
  ) {
    return 'occupied'
  }
  if (/geoJSON\.status\.unknown/i.test(name)) {
    return 'unknown'
  }
  return null
}

/** My Maps `{icon=arrow_N}` → degrees clockwise from north (16-way). */
export function bearingFromArrowDescription(description) {
  const m = String(description ?? '').match(/arrow_(\d+)/i)
  if (!m) return 0
  const n = Number(m[1])
  if (!Number.isFinite(n)) return 0
  return ((n % 16) * 22.5) % 360
}

function stripZ(coords) {
  if (typeof coords[0] === 'number') return coords.slice(0, 2)
  return coords.map(stripZ)
}

function cleanLabel(name) {
  return String(name || '')
    .split('///')[0]
    .trim()
    .replace(/\s+/g, ' ')
}

function unitRole(description) {
  const d = String(description ?? '').toLowerCase()
  if (d.includes('headquarter')) return 'hq'
  if (d.includes('storm')) return 'storm'
  return 'enemy'
}

function unitCategory(label) {
  const t = label.toLowerCase()
  if (/танков|танк\b/.test(t)) return 'tanks'
  if (/артилер|реактивн|сау|рсзв/.test(t)) return 'artillery'
  if (/ппо|зеніт|рлс|реб/.test(t)) return 'airdef'
  if (/бмп|мотостріл|мотострел|мсп\b|омсбр|мсд/.test(t)) return 'ifv'
  if (/бтр|мрап/.test(t)) return 'apc'
  if (/інженер|сапер|логіст|транспорт/.test(t)) return 'trucks'
  if (/десант|вдв|морськ|спецназ|гр[уy]|барс|шторм/.test(t)) return 'other'
  return 'other'
}

const res = await fetch(URL, {
  headers: { Accept: 'application/json', 'User-Agent': 'alert-tracker/1.0' },
})
if (!res.ok) throw new Error(`DeepState HTTP ${res.status}`)
const data = await res.json()

const polyCounts = { occupied: 0, unknown: 0 }
const polyFeatures = []
const arrowFeatures = []
const unitFeatures = []
let unitSkipBelarus = 0
let unitSkipBounds = 0

for (const f of data.map?.features || []) {
  const name = String(f.properties?.name || '')

  if (/geoJSON\.status\.attack_direction/i.test(name) && f.geometry?.type === 'Point') {
    const coords = stripZ(f.geometry.coordinates)
    if (!Array.isArray(coords) || coords.length < 2) continue
    const lon = Number(coords[0])
    const lat = Number(coords[1])
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    if (!inBounds(lat, lon)) continue
    const bearing = bearingFromArrowDescription(f.properties?.description)
    arrowFeatures.push({
      type: 'Feature',
      properties: {
        kind: 'attack',
        bearing,
        label: 'Напрямок удару РФ',
      },
      geometry: { type: 'Point', coordinates: [lon, lat] },
    })
    continue
  }

  if (/geoJSON\.units\./i.test(name) && f.geometry?.type === 'Point') {
    // Skip Belarus formation markers — not RF ground in UA theater.
    if (/geoJSON\.units\.belarus|\biblorussia\b|\beblorussia\b/i.test(name + String(f.properties?.description ?? ''))) {
      unitSkipBelarus++
      continue
    }
    const coords = stripZ(f.geometry.coordinates)
    if (!Array.isArray(coords) || coords.length < 2) continue
    const lon = Number(coords[0])
    const lat = Number(coords[1])
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    if (!inBounds(lat, lon)) {
      unitSkipBounds++
      continue
    }
    const label = cleanLabel(name)
    if (!label || label.length < 3) continue
    const role = unitRole(f.properties?.description)
    const category = unitCategory(label)
    const id = `dsu-${lat.toFixed(4)}-${lon.toFixed(4)}-${label.slice(0, 24)}`
    unitFeatures.push({
      type: 'Feature',
      properties: {
        id,
        kind: 'unit',
        role,
        category,
        title: label,
        label,
      },
      geometry: { type: 'Point', coordinates: [lon, lat] },
    })
    continue
  }

  const kind = classifyPoly(f)
  if (!kind) continue
  polyCounts[kind] += 1
  polyFeatures.push({
    type: 'Feature',
    properties: {
      kind,
      name: cleanLabel(name),
    },
    geometry: {
      type: f.geometry.type,
      coordinates: stripZ(f.geometry.coordinates),
    },
  })
}

const metaBase = {
  source: 'DeepStateMap.live',
  sourceUrl: 'https://deepstatemap.live/',
  datetime: data.datetime ?? null,
  id: data.id ?? null,
  extractedAt: new Date().toISOString(),
}

const occupiedOut = {
  type: 'FeatureCollection',
  features: polyFeatures,
  meta: { ...metaBase, kinds: polyCounts },
}

const arrowsOut = {
  type: 'FeatureCollection',
  features: arrowFeatures,
  meta: { ...metaBase, count: arrowFeatures.length },
}

const unitsOut = {
  type: 'FeatureCollection',
  features: unitFeatures,
  meta: {
    ...metaBase,
    count: unitFeatures.length,
    skippedBelarus: unitSkipBelarus,
    skippedOutOfBounds: unitSkipBounds,
    note: 'Approximate RF unit positions from current DeepState snapshot (not live tracks, no per-point dates).',
  },
}

writeFileSync(OUT_OCCUPIED_PUBLIC, JSON.stringify(occupiedOut))
writeFileSync(OUT_OCCUPIED_SRC, JSON.stringify(occupiedOut))
writeFileSync(OUT_ARROWS_PUBLIC, JSON.stringify(arrowsOut))
writeFileSync(OUT_ARROWS_SRC, JSON.stringify(arrowsOut))
writeFileSync(OUT_UNITS_PUBLIC, JSON.stringify(unitsOut))
writeFileSync(OUT_UNITS_SRC, JSON.stringify(unitsOut))

console.log(
  `Wrote ${polyFeatures.length} polys (occupied ${polyCounts.occupied}, unknown ${polyCounts.unknown}) → occupied.geojson`,
)
console.log(`Wrote ${arrowFeatures.length} attack arrows → ds-attacks.geojson`)
console.log(
  `Wrote ${unitFeatures.length} RF units → ds-units.geojson (skip belarus=${unitSkipBelarus}, OOB=${unitSkipBounds})`,
)
