import { apiUrl } from './api'
import { ensurePlaceIndex, geocodeWarspottingPlace } from './placeGazetteer'

/** Documented RF equipment losses — WarSpotting (OSINT photos, not live tracks). */
export const WARSPOTTING_URL = 'https://ukr.warspotting.net/'
export const WARSPOTTING_RECENT_URL = 'https://ukr.warspotting.net/api/losses/russia/recent/'

/** API / snapshots keep losses from the last ~21 days (slider max). */
export const GROUND_WINDOW_HOURS = 24 * 21
export const GROUND_WINDOW_MS = GROUND_WINDOW_HOURS * 60 * 60_000
export const GROUND_DAYS_MIN = 1
export const GROUND_DAYS_MAX = 21
export const GROUND_DAYS_DEFAULT = 7
export const GROUND_DAYS_STORAGE_KEY = 'alert-tracker:ground-days'

export type GroundCategory =
  | 'tanks'
  | 'ifv'
  | 'apc'
  | 'trucks'
  | 'artillery'
  | 'airdef'
  | 'other'

export type GroundFilterKey = 'all' | 'sightings' | GroundCategory

export type GroundLoss = {
  id: string
  /** Numeric WarSpotting id when known */
  wsId?: number | null
  type: string
  model: string
  status: string
  date: string
  place: string
  lat: number
  lon: number
  category: GroundCategory
  unit?: string | null
  viewUrl?: string | null
  /** coords = WarSpotting geo; place = gazetteer from nearest_location */
  geoPrecision?: 'coords' | 'place'
  /** Confirmation photos from original Source (often Telegram CDN). */
  photos?: string[]
  sources?: string[]
}

export type GroundEvidence = {
  viewUrl: string
  sources: string[]
  photos: string[]
  confirmPhotos: string[]
}

export function numericWarspottingId(lossId: string): number | null {
  const m = /^ws-(\d+)$/.exec(lossId)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

export function warspottingViewUrl(wsId: number): string {
  return `${WARSPOTTING_URL.replace(/\/$/, '')}/view/${wsId}/`
}

export const GROUND_FILTERS: Array<{
  key: GroundFilterKey
  label: string
  categories?: GroundCategory[]
}> = [
  { key: 'all', label: 'Усі' },
  { key: 'sightings', label: 'Сайтінги' },
  { key: 'tanks', label: 'Танки', categories: ['tanks'] },
  { key: 'ifv', label: 'БМП', categories: ['ifv'] },
  { key: 'apc', label: 'БТР / MRAP', categories: ['apc'] },
  { key: 'trucks', label: 'Вантажівки', categories: ['trucks'] },
  { key: 'artillery', label: 'Артилерія', categories: ['artillery'] },
  { key: 'airdef', label: 'ППО', categories: ['airdef'] },
  { key: 'other', label: 'Інше', categories: ['other'] },
]

export const GROUND_CATEGORY_COLOR: Record<GroundCategory, string> = {
  tanks: '#e85d4c',
  ifv: '#f0b429',
  apc: '#7dd3c0',
  trucks: '#93a0b5',
  artillery: '#c084fc',
  airdef: '#60a5fa',
  other: '#a8b3c4',
}

const AIR_TYPES = new Set(['Airplanes', 'Helicopters', 'Drones', 'Vessels'])

export function categoryFromWarType(type: string): GroundCategory | null {
  if (AIR_TYPES.has(type)) return null
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

function parseGeo(raw: unknown): { lat: number; lon: number } | null {
  if (typeof raw !== 'string') return null
  const parts = raw.split(',').map((x) => Number(x.trim()))
  if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null
  return { lat: parts[0], lon: parts[1] }
}

/** WarSpotting `date` is YYYY-MM-DD only — keep if that day intersects the snapshot max window. */
export function isWithinGroundWindow(dateStr: string, now = Date.now()): boolean {
  return isWithinLastDays(dateStr, GROUND_DAYS_MAX, now)
}

/** YYYY-MM-DD or ISO timestamp — true if event falls within the last `days` days. */
export function isWithinLastDays(
  isoOrDay: string,
  days: number,
  now = Date.now(),
): boolean {
  const d = Math.max(GROUND_DAYS_MIN, Math.min(GROUND_DAYS_MAX, Math.round(days)))
  const windowMs = d * 24 * 60 * 60_000
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoOrDay)) {
    const dayStart = Date.parse(`${isoOrDay}T00:00:00.000Z`)
    const dayEnd = Date.parse(`${isoOrDay}T23:59:59.999Z`)
    if (!Number.isFinite(dayStart) || !Number.isFinite(dayEnd)) return false
    const windowStart = now - windowMs
    return dayEnd >= windowStart && dayStart <= now
  }
  const ts = Date.parse(isoOrDay)
  if (!Number.isFinite(ts)) return false
  return ts >= now - windowMs && ts <= now + 60_000
}

export function filterGroundLossesByWindow(
  losses: GroundLoss[],
  now = Date.now(),
): GroundLoss[] {
  return losses.filter((l) => isWithinGroundWindow(l.date, now))
}

export function filterGroundLossesByDays(
  losses: GroundLoss[],
  days: number,
  now = Date.now(),
): GroundLoss[] {
  return losses.filter((l) => isWithinLastDays(l.date, days, now))
}

export function readStoredGroundDays(): number {
  try {
    const raw = localStorage.getItem(GROUND_DAYS_STORAGE_KEY)
    const n = Number(raw)
    if (Number.isFinite(n)) {
      return Math.max(GROUND_DAYS_MIN, Math.min(GROUND_DAYS_MAX, Math.round(n)))
    }
  } catch {
    /* private mode */
  }
  return GROUND_DAYS_DEFAULT
}

export function writeStoredGroundDays(days: number): void {
  try {
    localStorage.setItem(GROUND_DAYS_STORAGE_KEY, String(days))
  } catch {
    /* ignore */
  }
}

export async function parseWarspottingLosses(
  json: unknown,
  now = Date.now(),
): Promise<GroundLoss[]> {
  const rows = (json as { losses?: Array<Record<string, unknown>> }).losses ?? []
  const places = await ensurePlaceIndex()
  const out: GroundLoss[] = []
  for (const raw of rows) {
    const type = String(raw.type ?? 'Other')
    const category = categoryFromWarType(type)
    if (!category) continue
    const date = String(raw.date ?? '')
    if (!isWithinGroundWindow(date, now)) continue
    const place = String(raw.nearest_location ?? '')
    const parsed = parseGeo(raw.geo)
    const approx = parsed ? null : geocodeWarspottingPlace(place, places)
    const geo = parsed ?? (approx ? { lat: approx.lat, lon: approx.lon } : null)
    if (!geo) continue
    const idNum = typeof raw.id === 'number' ? raw.id : Number(raw.id)
    const wsId = Number.isFinite(idNum) ? idNum : null
    out.push({
      id: `ws-${wsId ?? `${geo.lat}-${geo.lon}-${raw.date}`}`,
      wsId,
      type,
      model: String(raw.model ?? type),
      status: String(raw.status ?? ''),
      date,
      place,
      lat: geo.lat,
      lon: geo.lon,
      category,
      unit: raw.unit == null ? null : String(raw.unit),
      viewUrl: wsId != null ? warspottingViewUrl(wsId) : null,
      geoPrecision: parsed ? 'coords' : 'place',
      photos: [],
      sources: [],
    })
  }
  return out
}

export function matchesGroundFilter(loss: GroundLoss, filter: GroundFilterKey): boolean {
  if (filter === 'all') return true
  if (filter === 'sightings') return false
  return loss.category === filter
}

const GITHUB_RAW =
  'https://raw.githubusercontent.com/Azerorh/alert-tracker/main/public/geo/warspotting.json'
const GITHUB_EVIDENCE_RAW =
  'https://raw.githubusercontent.com/Azerorh/alert-tracker/main/public/geo/warspotting-evidence.json'

function cacheBust(url: string): string {
  const t = Math.floor(Date.now() / 60_000)
  return `${url}${url.includes('?') ? '&' : '?'}t=${t}`
}

let evidenceCache: Record<string, GroundEvidence> | null = null

export async function loadGroundEvidenceMap(): Promise<Record<string, GroundEvidence>> {
  if (evidenceCache) return evidenceCache
  const base = import.meta.env.BASE_URL || '/'
  for (const url of [
    cacheBust(`${base}geo/warspotting-evidence.json`),
    cacheBust(GITHUB_EVIDENCE_RAW),
  ]) {
    try {
      const res = await fetch(url, { cache: 'no-cache' })
      if (!res.ok) continue
      const json = (await res.json()) as { evidence?: Record<string, GroundEvidence> }
      if (json.evidence && typeof json.evidence === 'object') {
        evidenceCache = json.evidence
        return evidenceCache
      }
    } catch {
      /* next */
    }
  }
  evidenceCache = {}
  return evidenceCache
}

/** Resolve local hosted thumbs (`/geo/ws-photos/…`) against Vite base. */
export function resolvePhotoUrl(url: string): string {
  if (!url) return url
  if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url
  const base = import.meta.env.BASE_URL || '/'
  const path = url.replace(/^\//, '')
  return `${base}${path}`
}

/** Confirm/source first, then WarSpotting thumbs — skip empties / dupes. */
export function pickEvidencePhotos(
  ev: Pick<GroundEvidence, 'confirmPhotos' | 'photos'> | null | undefined,
  fallback: string[] = [],
): string[] {
  const out: string[] = []
  for (const u of [...(ev?.confirmPhotos ?? []), ...(ev?.photos ?? []), ...fallback]) {
    const resolved = resolvePhotoUrl(u)
    if (resolved && !out.includes(resolved)) out.push(resolved)
  }
  return out.slice(0, 6)
}

export function attachEvidence(loss: GroundLoss, map: Record<string, GroundEvidence>): GroundLoss {
  const wsId = loss.wsId ?? numericWarspottingId(loss.id)
  if (wsId == null) return loss
  const ev = map[String(wsId)]
  const viewUrl = loss.viewUrl ?? warspottingViewUrl(wsId)
  if (!ev) return { ...loss, wsId, viewUrl }
  return {
    ...loss,
    wsId,
    viewUrl: ev.viewUrl || viewUrl,
    sources: ev.sources ?? [],
    photos: pickEvidencePhotos(ev, loss.photos ?? []),
  }
}

/** Live evidence for one loss (BFF scrape + source OG images). */
export async function fetchGroundEvidence(wsId: number): Promise<GroundEvidence | null> {
  try {
    const res = await fetch(apiUrl(`/api/warspotting/evidence/${wsId}`), {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    return (await res.json()) as GroundEvidence
  } catch {
    return null
  }
}

async function fetchJson(urls: string[]): Promise<unknown> {
  let lastErr: unknown
  for (const url of urls) {
    if (!url) continue
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'alert-tracker/1.0' },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('WarSpotting unavailable')
}

export async function fetchGroundLossSnapshot(): Promise<GroundLoss[] | null> {
  const base = import.meta.env.BASE_URL || '/'
  for (const url of [cacheBust(`${base}geo/warspotting.json`), cacheBust(GITHUB_RAW)]) {
    try {
      const res = await fetch(url, { cache: 'no-cache' })
      if (!res.ok) continue
      const json = (await res.json()) as { losses?: GroundLoss[] }
      if (Array.isArray(json.losses)) return filterGroundLossesByWindow(json.losses)
    } catch {
      /* next */
    }
  }
  return null
}

/** Live via BFF/API merged with snapshot (Pages). Always ≤~7 days. */
export async function fetchGroundLosses(): Promise<GroundLoss[]> {
  const evidence = await loadGroundEvidenceMap()
  const byId = new Map<string, GroundLoss>()

  const snap = await fetchGroundLossSnapshot()
  if (snap) {
    for (const l of snap) byId.set(l.id, attachEvidence(l, evidence))
  }

  try {
    const json = await fetchJson([
      apiUrl('/api/warspotting/recent'),
      WARSPOTTING_RECENT_URL,
    ])
    const parsed = await parseWarspottingLosses(json)
    for (const l of parsed) byId.set(l.id, attachEvidence(l, evidence))
  } catch {
    /* snapshot-only ok */
  }

  if (byId.size === 0) throw new Error('Ground losses unavailable')
  return [...byId.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}
