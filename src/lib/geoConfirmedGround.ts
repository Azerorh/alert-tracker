import { apiUrl } from './api'
import type { GroundCategory, GroundLoss } from './warspotting'
import type { RfSighting } from './rfSightings'

export const GEOCONFIRMED_URL = 'https://geoconfirmed.org/'

export type GcGroundKind = 'loss' | 'sighting'

export type GcGroundMarker = {
  id: string
  gcId?: string
  lat: number
  lon: number
  at: string
  category: GroundCategory
  kind: GcGroundKind
  summary: string
  title?: string
  iconName?: string | null
  unit?: string | null
  place?: string | null
  sources?: string[]
  postUrl: string
  channelId: string
  channelLabel: string
  precision: string
  side: 'rf'
  source: 'geoconfirmed'
}

const GITHUB_RAW =
  'https://raw.githubusercontent.com/Azerorh/alert-tracker/main/public/geo/geoconfirmed-ground.json'

const CATEGORIES = new Set<GroundCategory>([
  'tanks',
  'ifv',
  'apc',
  'trucks',
  'artillery',
  'airdef',
  'other',
])

function cacheBust(url: string): string {
  const t = Math.floor(Date.now() / 60_000)
  return `${url}${url.includes('?') ? '&' : '?'}t=${t}`
}

function normalizeCategory(raw: unknown): GroundCategory {
  const c = String(raw ?? 'other')
  return CATEGORIES.has(c as GroundCategory) ? (c as GroundCategory) : 'other'
}

function parsePayload(json: unknown): GcGroundMarker[] | null {
  const rows = (json as { markers?: unknown[] }).markers
  if (!Array.isArray(rows)) return null
  const out: GcGroundMarker[] = []
  for (const row of rows) {
    const m = row as Partial<GcGroundMarker>
    if (!m || typeof m.id !== 'string') continue
    if (!Number.isFinite(m.lat) || !Number.isFinite(m.lon)) continue
    if (m.side !== 'rf') continue
    const kind = m.kind === 'loss' ? 'loss' : 'sighting'
    out.push({
      id: m.id,
      gcId: m.gcId,
      lat: Number(m.lat),
      lon: Number(m.lon),
      at: String(m.at ?? ''),
      category: normalizeCategory(m.category),
      kind,
      summary: String(m.summary ?? ''),
      title: m.title,
      iconName: m.iconName,
      unit: m.unit ?? null,
      place: m.place ?? null,
      sources: Array.isArray(m.sources) ? m.sources.map(String) : [],
      postUrl: String(m.postUrl ?? GEOCONFIRMED_URL),
      channelId: String(m.channelId ?? 'geoconfirmed'),
      channelLabel: String(m.channelLabel ?? 'GeoConfirmed'),
      precision: String(m.precision ?? 'coords'),
      side: 'rf',
      source: 'geoconfirmed',
    })
  }
  return out
}

export async function fetchGeoConfirmedSnapshot(): Promise<GcGroundMarker[] | null> {
  const base = import.meta.env.BASE_URL || '/'
  for (const url of [
    cacheBust(`${base}geo/geoconfirmed-ground.json`),
    cacheBust(GITHUB_RAW),
  ]) {
    try {
      const res = await fetch(url, { cache: 'no-cache' })
      if (!res.ok) continue
      const parsed = parsePayload(await res.json())
      if (parsed) return parsed
    } catch {
      /* next */
    }
  }
  return null
}

export async function fetchGeoConfirmedGround(): Promise<GcGroundMarker[]> {
  const byId = new Map<string, GcGroundMarker>()

  const snap = await fetchGeoConfirmedSnapshot()
  if (snap) {
    for (const m of snap) byId.set(m.id, m)
  }

  try {
    const res = await fetch(apiUrl('/api/geoconfirmed-ground'), {
      headers: { Accept: 'application/json' },
    })
    if (res.ok) {
      const parsed = parsePayload(await res.json())
      if (parsed) {
        for (const m of parsed) byId.set(m.id, m)
      }
    }
  } catch {
    /* snapshot-only ok */
  }

  if (byId.size === 0) throw new Error('GeoConfirmed ground unavailable')
  return [...byId.values()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
}

export function gcMarkerToSighting(m: GcGroundMarker): RfSighting {
  return {
    id: m.id,
    lat: m.lat,
    lon: m.lon,
    at: m.at,
    category: m.category,
    summary: m.summary,
    channelId: m.channelId,
    channelLabel: m.channelLabel,
    postUrl: m.postUrl,
    precision: m.precision,
    place: m.place,
    side: 'rf',
    source: 'geoconfirmed',
  }
}

export function gcMarkerToLoss(m: GcGroundMarker): GroundLoss {
  return {
    id: m.id,
    wsId: null,
    type: m.iconName || m.title || 'Equipment',
    model: m.title || m.iconName || 'GeoConfirmed',
    status: 'destroyed/damaged',
    date: m.at,
    place: m.place || '',
    lat: m.lat,
    lon: m.lon,
    category: m.category,
    unit: m.unit,
    viewUrl: m.postUrl,
    geoPrecision: 'coords',
    sources: m.sources,
  }
}
