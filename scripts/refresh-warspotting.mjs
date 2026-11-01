/** Snapshot of RF equipment losses from the last 7 days (WarSpotting) for GitHub Pages. */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { geocodeWarspottingPlace, loadPlaceIndex } from './lib/placeGazetteer.mjs'
import { enrichEvidence, fetchEvidenceForId } from './lib/warspottingEvidence.mjs'

const ORIGIN = 'https://ukr.warspotting.net'
const WINDOW_HOURS = 24 * 21
const WINDOW_MS = WINDOW_HOURS * 60 * 60_000
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'geo')
const OUT = join(ROOT, 'warspotting.json')
const EVIDENCE_OUT = join(ROOT, 'warspotting-evidence.json')
const UA = {
  Accept: 'application/json',
  'User-Agent': 'alert-tracker-build/1.0',
}

const AIR = new Set(['Airplanes', 'Helicopters', 'Drones', 'Vessels'])

function category(type) {
  if (AIR.has(type)) return null
  switch (type) {
    case 'Tanks':
      return 'tanks'
    case 'Infantry fighting vehicles':
      return 'ifv'
    case 'Infantry mobility vehicles':
      return 'apc'
    case 'Transport':
    case 'Ambulances, medical vehicles':
    case 'Engineering':
      return 'trucks'
    case 'Towed artillery':
    case 'Self-propelled artillery':
    case 'Rocket and missile artillery':
    case 'Anti-tank systems':
      return 'artillery'
    case 'Anti-aircraft systems':
    case 'Radars, jammers':
      return 'airdef'
    default:
      return 'other'
  }
}

function parseGeo(raw) {
  if (typeof raw !== 'string') return null
  const parts = raw.split(',').map((x) => Number(x.trim()))
  if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null
  return { lat: parts[0], lon: parts[1] }
}

function withinWindow(dateStr, now = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false
  const dayStart = Date.parse(`${dateStr}T00:00:00.000Z`)
  const dayEnd = Date.parse(`${dateStr}T23:59:59.999Z`)
  if (!Number.isFinite(dayStart) || !Number.isFinite(dayEnd)) return false
  const windowStart = now - WINDOW_MS
  return dayEnd >= windowStart && dayStart <= now
}

function isoDay(d) {
  return d.toISOString().slice(0, 10)
}

function daysInWindow(now = Date.now()) {
  const days = []
  const start = now - WINDOW_MS
  for (let t = start; t <= now + 86400_000; t += 86400_000) {
    days.push(isoDay(new Date(t)))
  }
  // unique sorted
  return [...new Set(days)]
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: UA })
  if (!res.ok) throw new Error(`WarSpotting HTTP ${res.status} ${url}`)
  return res.json()
}

async function fetchAllRaw() {
  const byId = new Map()
  // Seed from previous snapshot so rate-limits don't wipe the map.
  try {
    const prev = JSON.parse(await readFile(OUT, 'utf8'))
    for (const loss of prev.losses ?? []) {
      if (loss?.wsId == null) continue
      byId.set(loss.wsId, {
        id: loss.wsId,
        type: loss.type,
        model: loss.model,
        status: loss.status,
        date: loss.date,
        nearest_location: loss.place,
        geo: `${loss.lat},${loss.lon}`,
        unit: loss.unit,
        _fromSnapshot: true,
        _geoPrecision: loss.geoPrecision,
      })
    }
  } catch {
    /* first run */
  }

  const mergeRow = (row) => {
    if (row?.id == null) return
    const prev = byId.get(row.id)
    if (!prev) {
      byId.set(row.id, row)
      return
    }
    // Keep snapshot geo when live row omits coordinates.
    const next = { ...prev, ...row }
    if (!parseGeo(row.geo) && parseGeo(prev.geo)) {
      next.geo = prev.geo
      next._geoPrecision = prev._geoPrecision
    }
    if (!next.nearest_location && prev.nearest_location) {
      next.nearest_location = prev.nearest_location
    }
    byId.set(row.id, next)
  }

  const recent = await fetchJson(`${ORIGIN}/api/losses/russia/recent/`)
  for (const row of recent.losses ?? []) mergeRow(row)
  // WarSpotting cap: ~10 req / 10s — stay well under; retry 429 without dropping seed.
  for (const day of daysInWindow()) {
    let ok = false
    for (let attempt = 0; attempt < 3 && !ok; attempt++) {
      try {
        await new Promise((r) => setTimeout(r, attempt === 0 ? 1500 : 4000))
        const json = await fetchJson(`${ORIGIN}/api/losses/russia/${day}`)
        for (const row of json.losses ?? []) mergeRow(row)
        ok = true
      } catch (err) {
        console.warn(
          `[warspotting] day ${day} attempt ${attempt + 1}:`,
          err.message ?? err,
        )
        await new Promise((r) => setTimeout(r, 5000))
      }
    }
  }
  return [...byId.values()]
}

async function main() {
  const places = await loadPlaceIndex()
  const now = Date.now()
  const rawRows = await fetchAllRaw()
  const losses = []
  let placeGeo = 0
  for (const raw of rawRows) {
    const cat = category(String(raw.type ?? ''))
    if (!cat) continue
    const date = String(raw.date ?? '')
    if (!withinWindow(date, now)) continue
    const place = String(raw.nearest_location ?? '')
    const parsed = parseGeo(raw.geo)
    const approx = parsed ? null : geocodeWarspottingPlace(place, places)
    const geo = parsed ?? (approx ? { lat: approx.lat, lon: approx.lon } : null)
    if (!geo) continue
    if (!parsed) placeGeo++
    losses.push({
      id: `ws-${raw.id}`,
      wsId: raw.id,
      type: String(raw.type ?? ''),
      model: String(raw.model ?? raw.type ?? ''),
      status: String(raw.status ?? ''),
      date,
      place,
      lat: geo.lat,
      lon: geo.lon,
      category: cat,
      unit: raw.unit == null ? null : String(raw.unit),
      viewUrl: `${ORIGIN}/view/${raw.id}/`,
      geoPrecision: parsed ? 'coords' : 'place',
    })
  }

  losses.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.wsId - a.wsId))

  let evidence = {}
  try {
    const prev = JSON.parse(await readFile(EVIDENCE_OUT, 'utf8'))
    if (prev?.evidence && typeof prev.evidence === 'object') evidence = prev.evidence
  } catch {
    /* fresh */
  }

  // Cap evidence scrape to keep refresh bounded
  const forEvidence = losses.slice(0, 40)
  for (const loss of forEvidence) {
    const id = String(loss.wsId)
    try {
      const live = await fetchEvidenceForId(loss.wsId)
      evidence[id] = {
        viewUrl: live.viewUrl,
        sources: live.sources ?? [],
        photos: live.photos ?? [],
        confirmPhotos: live.confirmPhotos ?? [],
      }
      await new Promise((r) => setTimeout(r, 350))
    } catch {
      if (!evidence[id]) {
        evidence[id] = {
          viewUrl: loss.viewUrl,
          sources: [],
          photos: [],
          confirmPhotos: [],
        }
      } else {
        try {
          evidence[id] = await enrichEvidence(evidence[id])
        } catch {
          /* keep */
        }
      }
    }
  }

  const payload = {
    fetchedAt: new Date().toISOString(),
    source: 'warspotting',
    windowHours: WINDOW_HOURS,
    losses,
  }
  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload))
  await writeFile(
    EVIDENCE_OUT,
    JSON.stringify({ fetchedAt: new Date().toISOString(), evidence }),
  )
  const withPhotos = Object.values(evidence).filter(
    (e) => (e.confirmPhotos?.length || 0) + (e.photos?.length || 0) > 0,
  ).length
  console.log(
    `[warspotting] snapshot ${OUT}: ${losses.length} losses ≤${WINDOW_HOURS}h` +
      ` (place-geocoded ${placeGeo}); evidence photos for ${withPhotos} ids`,
  )
}

main().catch((err) => {
  console.error('[warspotting] refresh failed', err)
  process.exit(1)
})
