import { apiUrl } from './api'
import type { GroundCategory } from './warspotting'

export const RF_SIGHTING_CHANNELS = [
  { id: 'DeepStateUA', label: 'DeepState', url: 'https://t.me/DeepStateUA' },
  { id: 'WeebUnionWar', label: 'WeebUnion', url: 'https://t.me/WeebUnionWar' },
  { id: 'exilenova_plus', label: 'ExileNova+', url: 'https://t.me/exilenova_plus' },
  { id: 'supernova_plus', label: 'Supernova+', url: 'https://t.me/supernova_plus' },
  { id: 'militarylandnet', label: 'MilitaryLand', url: 'https://t.me/militarylandnet' },
  { id: 'geoconfirmed', label: 'GeoConfirmed', url: 'https://t.me/geoconfirmed' },
  { id: 'war_monitor', label: 'War Monitor', url: 'https://t.me/war_monitor' },
  { id: 'PlayfraOSINT', label: 'PlayfraOSINT', url: 'https://t.me/PlayfraOSINT' },
  { id: 'NOELreports', label: 'NOEL', url: 'https://t.me/NOELreports' },
  { id: 'osinttechnical', label: 'OSINTtechnical', url: 'https://t.me/osinttechnical' },
] as const

export type RfSightingPrecision = 'coords' | 'place'

export type RfSighting = {
  id: string
  lat: number
  lon: number
  at: string
  category: GroundCategory
  summary: string
  channelId: string
  channelLabel: string
  postUrl: string
  precision: RfSightingPrecision | string
  place?: string | null
  side: 'rf'
  /** geoconfirmed | telegram (omit = TG allowlist) */
  source?: string
}

const GITHUB_RAW =
  'https://raw.githubusercontent.com/Azerorh/alert-tracker/main/public/geo/rf-sightings.json'

function cacheBust(url: string): string {
  const t = Math.floor(Date.now() / 60_000)
  return `${url}${url.includes('?') ? '&' : '?'}t=${t}`
}

function parsePayload(json: unknown): RfSighting[] | null {
  const rows = (json as { sightings?: RfSighting[] }).sightings
  if (!Array.isArray(rows)) return null
  return rows.filter(
    (s) =>
      s &&
      s.side === 'rf' &&
      typeof s.id === 'string' &&
      Number.isFinite(s.lat) &&
      Number.isFinite(s.lon),
  )
}

export async function fetchRfSightingSnapshot(): Promise<RfSighting[] | null> {
  const base = import.meta.env.BASE_URL || '/'
  for (const url of [cacheBust(`${base}geo/rf-sightings.json`), cacheBust(GITHUB_RAW)]) {
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

export async function fetchRfSightings(): Promise<RfSighting[]> {
  const byId = new Map<string, RfSighting>()

  const snap = await fetchRfSightingSnapshot()
  if (snap) {
    for (const s of snap) byId.set(s.id, s)
  }

  try {
    const res = await fetch(apiUrl('/api/rf-sightings'), {
      headers: { Accept: 'application/json' },
    })
    if (res.ok) {
      const parsed = parsePayload(await res.json())
      if (parsed) {
        for (const s of parsed) byId.set(s.id, s)
      }
    }
  } catch {
    /* snapshot-only ok */
  }

  if (byId.size === 0) throw new Error('RF sightings unavailable')
  return [...byId.values()].sort(
    (a, b) => Date.parse(b.at) - Date.parse(a.at),
  )
}
