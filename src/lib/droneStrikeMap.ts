import { apiUrl } from './api'
import type { ConfidenceLevel, ThreatType } from './neptun'
import type { DisplayThreat } from './threatDisplay'

/** Drone Strike Map — reported strikes & named sites (CC BY 4.0). */
export const DSM_ATTRIBUTION_URL = 'https://dronestrikemap.com/'
export const DSM_DIRECT_BASE = 'https://dronestrikemap.com'

export type DsmStrike = {
  id: string
  date: string
  country: string
  place: string
  region: string
  lat: number
  lon: number
  summary: string
  confidence: string
  weapons: string[]
  sources?: number
}

export type DsmSite = {
  id: number
  name: string
  kind: string
  country: string
  region: string
  lat: number
  lon: number
  note?: string
  status?: string
  hits?: { last: string; n: number } | null
}

export type BurningRefinery = {
  id: string
  name: string
  lat: number
  lon: number
  region: string
  lastHit: string
  hitCount: number
  reason: string
}

/** All red markers (strikes + NPZ): keep only last ~24h (date granularity). */
const RED_MAX_AGE_DAYS = 1
/** Fetch today + yesterday so a rolling day isn’t cut at midnight UTC. */
const STRIKE_FETCH_DAYS = RED_MAX_AGE_DAYS + 1

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

async function fetchJson(urls: string[]): Promise<unknown> {
  let lastErr: unknown
  for (const url of urls) {
    if (!url) continue
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('DSM unavailable')
}

function parseDayStrikes(date: string, json: unknown): DsmStrike[] {
  const strikes = (json as { strikes?: Array<Record<string, unknown>> }).strikes ?? []
  const out: DsmStrike[] = []
  for (const raw of strikes) {
    const lat = Number(raw.lat)
    const lon = Number(raw.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    if (String(raw.country ?? '') !== 'RU') continue
    const weapons = Array.isArray(raw.weapons)
      ? (raw.weapons as unknown[]).map(String)
      : []
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

async function fetchDay(date: string): Promise<DsmStrike[]> {
  const json = await fetchJson([
    apiUrl(`/api/dsm/day/${date}`),
    `${DSM_DIRECT_BASE}/api/day/${date}`,
  ])
  return parseDayStrikes(date, json)
}

export async function fetchRecentRuStrikes(
  fetchDays = STRIKE_FETCH_DAYS,
): Promise<DsmStrike[]> {
  const today = todayIso()
  const dates: string[] = []
  for (let i = 0; i < fetchDays; i++) dates.push(isoDaysAgo(i))
  const batches = await Promise.all(
    dates.map((d) => fetchDay(d).catch(() => [] as DsmStrike[])),
  )
  const seen = new Set<string>()
  const out: DsmStrike[] = []
  for (const batch of batches) {
    for (const s of batch) {
      if (daysBetween(s.date, today) > RED_MAX_AGE_DAYS) continue
      if (seen.has(s.id)) continue
      seen.add(s.id)
      out.push(s)
    }
  }
  return out
}

export async function fetchRuRefinerySites(): Promise<DsmSite[]> {
  const json = await fetchJson([
    apiUrl('/api/dsm/sites'),
    `${DSM_DIRECT_BASE}/api/sites`,
  ])
  const sites = (json as { sites?: DsmSite[] }).sites ?? []
  return sites.filter(
    (s) =>
      s.country === 'RU' &&
      (s.kind === 'refinery' || s.kind === 'oil_depot') &&
      Number.isFinite(s.lat) &&
      Number.isFinite(s.lon),
  )
}

function daysBetween(aIso: string, bIso: string): number {
  const a = Date.parse(`${aIso}T00:00:00Z`)
  const b = Date.parse(`${bIso}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 999
  return Math.abs(b - a) / 86_400_000
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const R = 6371
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Refineries / fuel sites recently hit, especially with reported fire. */
export function pickBurningRefineries(
  sites: DsmSite[],
  recentStrikes: DsmStrike[],
  hitWithinDays = RED_MAX_AGE_DAYS,
): BurningRefinery[] {
  const today = todayIso()
  const fireStrikes = recentStrikes.filter((s) =>
    /fire|горить|пожар|ablaze|blaze/i.test(s.summary),
  )

  const out: BurningRefinery[] = []
  for (const site of sites) {
    const last = site.hits?.last
    const recentHit = last != null && daysBetween(last, today) <= hitWithinDays
    const nearbyFire = fireStrikes.find(
      (s) => haversineKm(site.lat, site.lon, s.lat, s.lon) <= 35,
    )
    if (!recentHit && !nearbyFire) continue

    if (site.kind !== 'refinery' && site.kind !== 'oil_depot') continue

    out.push({
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
  return out
}

export function strikeIconKind(weapons: string[]): 'uav' | 'missile' | 'unknown' {
  const w = weapons.map((x) => x.toLowerCase())
  if (w.some((x) => x.includes('missile') || x.includes('ballistic'))) return 'missile'
  if (w.some((x) => x.includes('drone') || x.includes('uav'))) return 'uav'
  return 'unknown'
}

function confidenceFromDsm(raw: string): ConfidenceLevel | undefined {
  const s = raw.toLowerCase()
  if (s.includes('confirm')) return 'high'
  if (s.includes('report')) return 'medium'
  if (s.includes('claim') || s.includes('unconfirm')) return 'low'
  return 'medium'
}

/** Synthetic threat so DSM/NPZ reuse the same ThreatSheet as NEPTUN/MAPA. */
export function dsmStrikeAsThreat(s: DsmStrike): DisplayThreat {
  const type = strikeIconKind(s.weapons) as ThreatType
  const iso = `${s.date}T12:00:00.000Z`
  return {
    id: s.id,
    type,
    title: s.place || s.region || 'Удар по РФ',
    region: s.region || 'Росія',
    district: '',
    locality: s.place || undefined,
    lat: s.lat,
    lon: s.lon,
    heading: null,
    confidenceLevel: confidenceFromDsm(s.confidence),
    displayConfidence: confidenceFromDsm(s.confidence),
    sourceCount: s.sources,
    updatedAt: iso,
    confirmedAt: iso,
    explanationShort: s.summary || 'Заявлений удар (Drone Strike Map)',
    status: 'active',
    positionQuality: 'approx',
    uncertaintyKm: 12,
    advisory: true,
  }
}

export function burningRefineryAsThreat(s: BurningRefinery): DisplayThreat {
  const iso = `${s.lastHit}T12:00:00.000Z`
  return {
    id: s.id,
    type: 'unknown',
    title: s.name,
    region: s.region || 'Росія',
    district: '',
    locality: s.name,
    lat: s.lat,
    lon: s.lon,
    heading: null,
    confidenceLevel: 'medium',
    displayConfidence: 'medium',
    sourceCount: s.hitCount || undefined,
    updatedAt: iso,
    confirmedAt: iso,
    explanationShort: s.reason,
    status: 'active',
    positionQuality: 'approx',
    uncertaintyKm: 8,
    advisory: true,
  }
}

export function findDsmDisplayThreat(
  id: string,
  strikes: DsmStrike[],
  burning: BurningRefinery[],
): DisplayThreat | null {
  const strike = strikes.find((s) => s.id === id)
  if (strike) return dsmStrikeAsThreat(strike)
  const site = burning.find((s) => s.id === id)
  if (site) return burningRefineryAsThreat(site)
  return null
}

type DsmSnapshot = {
  strikes?: DsmStrike[]
  burning?: BurningRefinery[]
}

/** Static snapshot baked at build (GitHub Pages has no BFF / CORS to DSM). */
export async function fetchDsmSnapshot(): Promise<{
  strikes: DsmStrike[]
  burning: BurningRefinery[]
} | null> {
  try {
    const base = import.meta.env.BASE_URL || '/'
    const res = await fetch(`${base}geo/dsm-ru.json`)
    if (!res.ok) return null
    const json = (await res.json()) as DsmSnapshot
    return {
      strikes: Array.isArray(json.strikes) ? json.strikes : [],
      burning: Array.isArray(json.burning) ? json.burning : [],
    }
  } catch {
    return null
  }
}
