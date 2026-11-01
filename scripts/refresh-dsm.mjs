/** Build-time snapshot of RU strikes + burning NPZ for GitHub Pages (no CORS). */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DSM = 'https://dronestrikemap.com'
/** Same 24h window as the client (date granularity). */
const RED_MAX_AGE_DAYS = 1
const LOOKBACK = RED_MAX_AGE_DAYS + 1
const HIT_DAYS = RED_MAX_AGE_DAYS
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'geo', 'dsm-ru.json')

function isoDaysAgo(days) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function daysBetween(aIso, bIso) {
  const a = Date.parse(`${aIso}T00:00:00Z`)
  const b = Date.parse(`${bIso}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 999
  return Math.abs(b - a) / 86_400_000
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180
  const R = 6371
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

async function fetchDay(date) {
  const res = await fetch(`${DSM}/api/day/${date}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'alert-tracker-build/1.0' },
  })
  if (!res.ok) throw new Error(`day ${date} HTTP ${res.status}`)
  const json = await res.json()
  const out = []
  for (const raw of json.strikes ?? []) {
    const lat = Number(raw.lat)
    const lon = Number(raw.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    if (String(raw.country ?? '') !== 'RU') continue
    const weapons = Array.isArray(raw.weapons) ? raw.weapons.map(String) : []
    out.push({
      id: `dsm-${date}-${lat.toFixed(3)}-${lon.toFixed(3)}-${String(raw.place ?? '')}`,
      date,
      country: 'RU',
      place: String(raw.place ?? ''),
      region: String(raw.region ?? ''),
      lat,
      lon,
      summary: String(raw.summary ?? ''),
      confidence: String(raw.confidence ?? 'reported'),
      weapons,
      sources: typeof raw.sources === 'number' ? raw.sources : undefined,
    })
  }
  return out
}

async function main() {
  const today = todayIso()
  const dates = Array.from({ length: LOOKBACK }, (_, i) => isoDaysAgo(i))
  const batches = await Promise.all(dates.map((d) => fetchDay(d).catch(() => [])))
  const seen = new Set()
  const strikes = []
  for (const batch of batches) {
    for (const s of batch) {
      if (daysBetween(s.date, today) > RED_MAX_AGE_DAYS) continue
      if (seen.has(s.id)) continue
      seen.add(s.id)
      strikes.push(s)
    }
  }

  const sitesRes = await fetch(`${DSM}/api/sites`, {
    headers: { Accept: 'application/json', 'User-Agent': 'alert-tracker-build/1.0' },
  })
  if (!sitesRes.ok) throw new Error(`sites HTTP ${sitesRes.status}`)
  const sitesJson = await sitesRes.json()
  const sites = (sitesJson.sites ?? []).filter(
    (s) =>
      s.country === 'RU' &&
      (s.kind === 'refinery' || s.kind === 'oil_depot') &&
      Number.isFinite(s.lat) &&
      Number.isFinite(s.lon),
  )

  const fireStrikes = strikes.filter((s) =>
    /fire|горить|пожар|ablaze|blaze/i.test(s.summary),
  )
  const burning = []
  for (const site of sites) {
    const last = site.hits?.last
    const recentHit = last != null && daysBetween(last, today) <= HIT_DAYS
    const nearbyFire = fireStrikes.find(
      (s) => haversineKm(site.lat, site.lon, s.lat, s.lon) <= 35,
    )
    if (!recentHit && !nearbyFire) continue
    burning.push({
      id: `npz-${site.id}`,
      name: site.name,
      lat: site.lat,
      lon: site.lon,
      region: site.region,
      lastHit: last ?? nearbyFire?.date ?? today,
      hitCount: site.hits?.n ?? 0,
      reason: nearbyFire
        ? `Пожежа/удар: ${nearbyFire.summary}`
        : `Нещодавній удар (останній ${last})`,
    })
  }

  const payload = {
    fetchedAt: new Date().toISOString(),
    strikes,
    burning,
  }
  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload))
  console.log(
    `[dsm] snapshot ${OUT}: strikes=${strikes.length} burning=${burning.length}`,
  )
}

main().catch((err) => {
  console.error('[dsm] refresh failed', err)
  process.exit(1)
})
