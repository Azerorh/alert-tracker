import type { FeatureCollection, Point } from 'geojson'
import { iconIdForType, threatIconDataUrl } from './threatIcons'

export type RfAviationKind = 'strategic' | 'mig31k' | 'fighter' | 'aviation'

export type RfAviationEvent = {
  id: string
  airbaseId: string
  airbase: string
  lat: number
  lon: number
  kind: RfAviationKind
  title: string
  /** From airbase toward Ukraine (inbound side). */
  bearingDeg: number
  channel: string
  postUrl?: string | null
  excerpt: string
  lastSeen: string
  expiresAt: string
}

export type RfAviationPayload = {
  fetchedAt: string | null
  events: RfAviationEvent[]
}

const GITHUB_RAW =
  'https://raw.githubusercontent.com/Azerorh/alert-tracker/main/public/geo/rf-aviation.json'

export const RF_AV_SELECT_PREFIX = 'rf-av:'

export function rfAvSelectId(id: string): string {
  return `${RF_AV_SELECT_PREFIX}${id}`
}

export function parseRfAvSelectId(selectedId: string | null): string | null {
  if (!selectedId?.startsWith(RF_AV_SELECT_PREFIX)) return null
  return selectedId.slice(RF_AV_SELECT_PREFIX.length)
}

export function rfAvById(
  events: RfAviationEvent[],
  selectedId: string | null,
): RfAviationEvent | null {
  const id = parseRfAvSelectId(selectedId)
  if (!id) return null
  return events.find((e) => e.id === id) ?? null
}

function cacheBust(url: string): string {
  const t = Math.floor(Date.now() / 60_000)
  return `${url}${url.includes('?') ? '&' : '?'}t=${t}`
}

function parsePayload(json: unknown): RfAviationPayload | null {
  if (!json || typeof json !== 'object') return null
  const raw = (json as { events?: unknown }).events
  if (!Array.isArray(raw)) return null
  const now = Date.now()
  const events: RfAviationEvent[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const e = item as Partial<RfAviationEvent>
    if (!Number.isFinite(e.lat) || !Number.isFinite(e.lon)) continue
    if (!e.id || !e.airbase) continue
    const expires = e.expiresAt ? Date.parse(e.expiresAt) : NaN
    if (Number.isFinite(expires) && expires < now) continue
    events.push({
      id: String(e.id),
      airbaseId: String(e.airbaseId ?? e.id),
      airbase: String(e.airbase),
      lat: Number(e.lat),
      lon: Number(e.lon),
      kind: (e.kind as RfAviationKind) || 'aviation',
      title: String(e.title ?? 'Авіація РФ'),
      bearingDeg: Number.isFinite(e.bearingDeg) ? Number(e.bearingDeg) : 0,
      channel: String(e.channel ?? ''),
      postUrl: e.postUrl ?? null,
      excerpt: String(e.excerpt ?? ''),
      lastSeen: String(e.lastSeen ?? ''),
      expiresAt: String(e.expiresAt ?? ''),
    })
  }
  return {
    fetchedAt: (json as { fetchedAt?: string | null }).fetchedAt ?? null,
    events,
  }
}

export async function fetchRfAviationSnapshot(): Promise<RfAviationPayload | null> {
  const base = import.meta.env.BASE_URL || '/'
  const urls = [cacheBust(`${base}geo/rf-aviation.json`), cacheBust(GITHUB_RAW)]
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: 'no-cache' })
      if (!res.ok) continue
      const parsed = parsePayload(await res.json())
      if (parsed) return parsed
    } catch {
      /* try next */
    }
  }
  return null
}

export function buildRfAviationFeatures(
  events: RfAviationEvent[],
  selectedId: string | null,
): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: events.map((e) => ({
      type: 'Feature' as const,
      id: e.id,
      properties: {
        id: rfAvSelectId(e.id),
        title: e.title,
        airbase: e.airbase,
        kind: e.kind,
        bearing: e.bearingDeg,
        selected: selectedId === rfAvSelectId(e.id) ? 1 : 0,
        icon: iconIdForType('mig31k', null, true),
      },
      geometry: { type: 'Point' as const, coordinates: [e.lon, e.lat] },
    })),
  }
}

/** Screen-edge cue when airbase is outside the viewport. */
export type RfAvEdgeCue = {
  id: string
  selectId: string
  title: string
  airbase: string
  /** CSS left/top in px within map container. */
  x: number
  y: number
  /** Rotation so arrows point toward the off-screen airbase (outbound). */
  rotateDeg: number
  /** Inbound threat side — arrows into the map. */
  inboundDeg: number
  selected: boolean
}

const EDGE_PAD = 28

/**
 * Project off-screen airbases onto the map viewport edge.
 * Arrow rotation: inboundDeg points into the map (threat coming from that side).
 */
export function computeRfAvEdgeCues(
  events: RfAviationEvent[],
  project: (lon: number, lat: number) => { x: number; y: number },
  width: number,
  height: number,
  selectedId: string | null,
): RfAvEdgeCue[] {
  if (width < 40 || height < 40) return []
  const cues: RfAvEdgeCue[] = []
  const minX = EDGE_PAD
  const maxX = width - EDGE_PAD
  const minY = EDGE_PAD
  const maxY = height - EDGE_PAD
  const cx = width / 2
  const cy = height / 2

  for (const e of events) {
    const p = project(e.lon, e.lat)
    const onScreen =
      p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height
    if (onScreen) continue

    // Ray from center toward airbase; clamp to padded rectangle.
    const dx = p.x - cx
    const dy = p.y - cy
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) continue

    const scaleX = dx > 0 ? (maxX - cx) / dx : dx < 0 ? (minX - cx) / dx : Infinity
    const scaleY = dy > 0 ? (maxY - cy) / dy : dy < 0 ? (minY - cy) / dy : Infinity
    const scale = Math.min(scaleX, scaleY)
    const x = cx + dx * scale
    const y = cy + dy * scale

    // Angle toward airbase (screen: 0 = east, CW… use atan2 for CSS rotate from up).
    const towardAirbase = (Math.atan2(dx, -dy) * 180) / Math.PI
    const inbound = towardAirbase + 180

    cues.push({
      id: e.id,
      selectId: rfAvSelectId(e.id),
      title: e.title,
      airbase: e.airbase,
      x,
      y,
      rotateDeg: towardAirbase,
      inboundDeg: inbound,
      selected: selectedId === rfAvSelectId(e.id),
    })
  }

  // Cluster: keep at most one cue per ~56px cell.
  const seen = new Set<string>()
  const deduped: RfAvEdgeCue[] = []
  for (const c of cues) {
    const key = `${Math.round(c.x / 56)},${Math.round(c.y / 56)}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(c)
  }
  return deduped.slice(0, 8)
}

export function rfAvIconUrl(): string {
  return threatIconDataUrl('mig31k', '#c4a0ff', true)
}

export function ttlLabel(kind: RfAviationKind): string {
  switch (kind) {
    case 'strategic':
      return '~2.5 год'
    case 'mig31k':
      return '~75 хв'
    case 'fighter':
      return '~60 хв'
    default:
      return '~90 хв'
  }
}
