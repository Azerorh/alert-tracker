import { distanceKm, type Threat, type ThreatType } from './neptun'
import { apiUrl } from './api'

const MAPA_DIRECT_URL = 'https://mapa.ua/api/v1/current'
const MAPA_ATTACKS_URL = 'https://mapa.ua/api/v1/attacks?limit=4'
export const MAPA_ATTRIBUTION_URL = 'https://mapa.ua/'

export type MapaObject = {
  id: string | number
  kind: string
  subkind?: string
  title: string
  status: string
  lat: number
  lon: number
  heading?: number | null
  speed_kmh?: number | null
  predicted_lat?: number | null
  predicted_lon?: number | null
  trail?: Array<[number, number, number] | [number, number, number, number]>
  last_seen?: number
  amount?: number
  group_id?: string | number
}

/** Compact attack rollup from /current or /attacks — HUD only, not map markers. */
export type MapaAttackSummary = {
  id: number
  status: string
  totalObjects: number
  totalDrones: number
  totalMissiles: number
  totalBombs: number
  startedAt: number | null
  endedAt: number | null
}

export type MapaMatch = {
  object: MapaObject
  distKm: number
  score: number
  sticky: boolean
}

type MapaCurrentResponse = {
  objects?: MapaObject[]
  attack?: {
    id?: number
    status?: string
    total_objects?: number
    total_drones?: number
    total_missiles?: number
    total_bombs?: number
    started_at?: number | null
    ended_at?: number | null
  } | null
  ts?: number
}

type MapaAttacksResponse = {
  attacks?: Array<{
    id?: number
    status?: string
    total_objects?: number
    total_drones?: number
    total_missiles?: number
    total_bombs?: number
    started_at?: number | null
    ended_at?: number | null
  }>
}

const KIND_BY_THREAT: Record<ThreatType, string[]> = {
  uav: ['drone_piston', 'drone_jet'],
  fpv: ['drone_fpv', 'drone_piston'],
  recon: ['drone_piston'],
  missile: ['missile_cruise'],
  ballistic: ['missile_ballistic'],
  kab: ['bomb'],
  mig31k: [],
  unknown: ['drone_piston', 'drone_jet', 'missile_cruise', 'missile_ballistic', 'bomb'],
}

/** Max association distance by threat type (tighter than the old flat 45 km). */
const MAX_ASSOC_KM: Record<ThreatType, number> = {
  uav: 28,
  fpv: 18,
  recon: 32,
  missile: 22,
  ballistic: 35,
  kab: 18,
  mig31k: 40,
  unknown: 24,
}

const MAX_HEADING_DELTA: Record<ThreatType, number> = {
  uav: 70,
  fpv: 80,
  recon: 75,
  missile: 45,
  ballistic: 55,
  kab: 60,
  mig31k: 50,
  unknown: 65,
}

/** If NEPTUN↔MAPA distance exceeds this fraction of maxAssoc, widen uncertainty. */
const DISAGREE_FRAC = 0.55

/** MAPA statuses that mean the object is no longer flying as an active track. */
export const MAPA_SHOT_DOWN = new Set(['eliminated'])
export const MAPA_TERMINAL = new Set(['eliminated', 'hit_target', 'lost'])

export type MapaSnapshot = {
  active: MapaObject[]
  terminal: MapaObject[]
  attack: MapaAttackSummary | null
  recentAttacks: MapaAttackSummary[]
}

function finiteCoords(o: MapaObject): boolean {
  return Number.isFinite(o.lat) && Number.isFinite(o.lon)
}

function parseAttackSummary(raw: {
  id?: number
  status?: string
  total_objects?: number
  total_drones?: number
  total_missiles?: number
  total_bombs?: number
  started_at?: number | null
  ended_at?: number | null
} | null | undefined): MapaAttackSummary | null {
  if (!raw || raw.id == null) return null
  return {
    id: Number(raw.id),
    status: String(raw.status ?? ''),
    totalObjects: Number(raw.total_objects ?? 0),
    totalDrones: Number(raw.total_drones ?? 0),
    totalMissiles: Number(raw.total_missiles ?? 0),
    totalBombs: Number(raw.total_bombs ?? 0),
    startedAt: raw.started_at != null ? Number(raw.started_at) : null,
    endedAt: raw.ended_at != null ? Number(raw.ended_at) : null,
  }
}

async function fetchMapaRecentAttacks(): Promise<MapaAttackSummary[]> {
  try {
    const res = await fetch(MAPA_ATTACKS_URL)
    if (!res.ok) return []
    const data = (await res.json()) as MapaAttacksResponse
    return (data.attacks ?? [])
      .map((a) => parseAttackSummary(a))
      .filter((a): a is MapaAttackSummary => !!a)
      .slice(0, 4)
  } catch {
    return []
  }
}

export async function fetchMapaSnapshot(): Promise<MapaSnapshot> {
  const urls = [apiUrl('/api/mapa/current'), MAPA_DIRECT_URL]
  let lastErr: unknown
  for (const url of urls) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`MAPA HTTP ${res.status}`)
      const data = (await res.json()) as MapaCurrentResponse
      const objects = (data.objects ?? []).filter(finiteCoords)
      const recentAttacks = await fetchMapaRecentAttacks()
      const attack =
        parseAttackSummary(data.attack) ??
        recentAttacks.find((a) => a.status === 'active') ??
        recentAttacks[0] ??
        null
      return {
        active: objects.filter((o) => o.status === 'active'),
        terminal: objects.filter((o) => MAPA_TERMINAL.has(o.status)),
        attack,
        recentAttacks,
      }
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('MAPA unavailable')
}

export async function fetchMapaActive(): Promise<MapaObject[]> {
  const snap = await fetchMapaSnapshot()
  return snap.active
}

function kindsFor(type: ThreatType): string[] {
  return KIND_BY_THREAT[type] ?? KIND_BY_THREAT.unknown
}

function mapaId(obj: MapaObject): string {
  return String(obj.id)
}

function headingDeltaDeg(a: number, b: number): number {
  let d = Math.abs(a - b) % 360
  if (d > 180) d = 360 - d
  return d
}

function threatHeading(threat: Threat): number | null {
  const h = threat.velocity?.bearingDeg ?? threat.heading
  return h != null && Number.isFinite(h) ? h : null
}

function threatSpeed(threat: Threat): number | null {
  const s = threat.velocity?.speedKmh
  return s != null && s > 0 ? s : null
}

/**
 * Lower score = better. Rejects incompatible kinematics.
 * Sticky previous MAPA id gets a strong bonus (can override a slightly nearer stranger).
 */
export function scoreMapaCandidate(
  threat: Threat,
  obj: MapaObject,
  stickyId: string | undefined,
): number | null {
  const kinds = new Set(kindsFor(threat.type))
  if (!kinds.size || !kinds.has(obj.kind)) return null

  const maxKm = MAX_ASSOC_KM[threat.type] ?? 25
  const dist = distanceKm(threat.lat, threat.lon, obj.lat, obj.lon)
  if (dist > maxKm) return null

  const th = threatHeading(threat)
  const oh = obj.heading != null && Number.isFinite(obj.heading) ? obj.heading : null
  if (th != null && oh != null) {
    const dH = headingDeltaDeg(th, oh)
    if (dH > (MAX_HEADING_DELTA[threat.type] ?? 65)) return null
  }

  const ts = threatSpeed(threat)
  const os = obj.speed_kmh != null && obj.speed_kmh > 0 ? obj.speed_kmh : null
  if (ts != null && os != null) {
    const ratio = Math.max(ts, os) / Math.max(1, Math.min(ts, os))
    if (ratio > 3.5) return null
  }

  let score = dist

  if (th != null && oh != null) {
    score += headingDeltaDeg(th, oh) / 18
  } else {
    score += 2.5 // unknown heading — slightly worse than aligned pair
  }

  if (ts != null && os != null) {
    score += Math.abs(Math.log((os + 1) / (ts + 1))) * 1.2
  }

  const sticky = stickyId != null && stickyId === mapaId(obj)
  if (sticky) score -= 12

  // Prefer denser trail (more trustworthy kinematics)
  if (obj.trail && obj.trail.length >= 4) score -= 1.5
  if (obj.predicted_lat != null && obj.predicted_lon != null) score -= 0.8

  return score
}

/** Greedy one-to-one assignment; prefers sticky links when still valid. */
export function assignMapaMatches(
  threats: Threat[],
  mapa: MapaObject[],
  stickyByThreat: Map<string, string> = new Map(),
): Map<string, MapaMatch> {
  type Edge = { threatId: string; obj: MapaObject; score: number; distKm: number; sticky: boolean }
  const edges: Edge[] = []

  for (const threat of threats) {
    if (threat.areaOnly || threat.status === 'resolved') continue
    const stickyId = stickyByThreat.get(threat.id)
    for (const obj of mapa) {
      const score = scoreMapaCandidate(threat, obj, stickyId)
      if (score == null) continue
      edges.push({
        threatId: threat.id,
        obj,
        score,
        distKm: distanceKm(threat.lat, threat.lon, obj.lat, obj.lon),
        sticky: stickyId === mapaId(obj),
      })
    }
  }

  edges.sort((a, b) => a.score - b.score || a.distKm - b.distKm)

  const usedThreats = new Set<string>()
  const usedMapa = new Set<string>()
  const out = new Map<string, MapaMatch>()

  for (const e of edges) {
    const mid = mapaId(e.obj)
    if (usedThreats.has(e.threatId) || usedMapa.has(mid)) continue
    usedThreats.add(e.threatId)
    usedMapa.add(mid)
    out.set(e.threatId, {
      object: e.obj,
      distKm: e.distKm,
      score: e.score,
      sticky: e.sticky,
    })
  }

  return out
}

/** Single-threat helper; prefer assignMapaMatches for batch 1:1 fusion. */
export function findMapaMatch(
  threat: Threat,
  mapa: MapaObject[],
  maxKm?: number,
): MapaObject | null {
  const assigned = assignMapaMatches([threat], mapa)
  const m = assigned.get(threat.id)
  if (!m) return null
  if (maxKm != null && m.distKm > maxKm) return null
  return m.object
}

export function mapaTrailToThreatTrail(
  trail: MapaObject['trail'],
): Array<{ lat: number; lon: number; t: string }> {
  if (!trail?.length) return []
  return trail.map((p) => {
    const [lon, lat, ts] = p
    return {
      lon,
      lat,
      t: new Date(ts > 1e12 ? ts : ts * 1000).toISOString(),
    }
  })
}

function lastSeenIso(match: MapaObject, fallback: string): string {
  if (match.last_seen == null) return fallback
  return new Date(
    match.last_seen > 1e12 ? match.last_seen : match.last_seen * 1000,
  ).toISOString()
}

/** Fallback cruise speeds when MAPA/NEPTUN omit speed — keeps local predict() moving. */
const DEFAULT_SPEED_KMH: Record<string, number> = {
  uav: 165,
  recon: 140,
  fpv: 110,
  missile: 750,
  kab: 350,
  ballistic: 1600,
  mig31k: 900,
  unknown: 150,
}

function asMatch(threat: Threat, match: MapaMatch | MapaObject): MapaMatch {
  if ('object' in match && (match as MapaMatch).object) return match as MapaMatch
  const obj = match as MapaObject
  return {
    object: obj,
    distKm: distanceKm(threat.lat, threat.lon, obj.lat, obj.lon),
    score: 0,
    sticky: false,
  }
}

function resolveVelocity(
  threat: Threat,
  speed: number | null | undefined,
  heading: number | null,
): Threat['velocity'] {
  if (heading == null || !Number.isFinite(heading)) return threat.velocity
  const kmh =
    speed != null && speed > 0
      ? speed
      : (threat.velocity?.speedKmh ?? DEFAULT_SPEED_KMH[threat.type] ?? 150)
  return { speedKmh: kmh, bearingDeg: heading }
}

/**
 * Anchor on MAPA last fix + last_seen so SDK predict() can dead-reckon forward
 * between polls. Do NOT snap to predicted_* with confirmedAt=now — that freezes
 * motion and makes markers jitter every refresh.
 */
export function enrichThreatWithMapa(threat: Threat, match: MapaMatch | MapaObject): Threat {
  const m = asMatch(threat, match)

  const obj = m.object
  const maxKm = MAX_ASSOC_KM[threat.type] ?? 25
  const disagree = m.distKm > maxKm * DISAGREE_FRAC

  const mapaTrail = mapaTrailToThreatTrail(obj.trail)
  // When linked, prefer MAPA trail only — do not mix NEPTUN breadcrumbs (wrong corridor snaps).
  const mergedTrail = mapaTrail.length ? mapaTrail : threat.trail

  const speed =
    obj.speed_kmh && obj.speed_kmh > 0 ? obj.speed_kmh : threat.velocity?.speedKmh
  const heading =
    obj.heading != null && Number.isFinite(obj.heading)
      ? obj.heading
      : (threat.heading ?? threat.velocity?.bearingDeg ?? null)

  const hasPredicted =
    obj.predicted_lat != null &&
    obj.predicted_lon != null &&
    Number.isFinite(obj.predicted_lat) &&
    Number.isFinite(obj.predicted_lon)

  const velocity = resolveVelocity(threat, speed, heading)

  // Strong disagreement: keep NEPTUN point, only borrow trail/kinematics lightly + widen CEP.
  if (disagree && threat.positionQuality === 'confirmed') {
    const baseUnc = threat.uncertaintyKm ?? 10
    return {
      ...threat,
      trail: mergedTrail?.length ? mergedTrail : threat.trail,
      heading: heading ?? threat.heading,
      velocity,
      // Keep a past confirmedAt so predict() still advances between NEPTUN ticks.
      confirmedAt: threat.confirmedAt ?? threat.updatedAt,
      status: threat.status === 'resolved' ? threat.status : 'active',
      uncertaintyKm: Math.max(baseUnc, Math.min(22, m.distKm * 0.45 + 6)),
      positionQuality: 'approx',
    }
  }

  // Last reported fix + when it was seen. Local RAF predict() extrapolates from here.
  const lat = obj.lat
  const lon = obj.lon
  const confirmedAt = lastSeenIso(obj, threat.confirmedAt ?? threat.updatedAt)

  const goodScore = m.score <= 10 || m.sticky
  const uncFromDist = Math.min(14, 3 + m.distKm * 0.35)
  // Slightly wider CEP when we DR past the last fix (MAPA predicted was a soft hint only).
  const uncBase = disagree ? Math.max(uncFromDist, 10) : Math.min(uncFromDist, goodScore ? 8 : 12)
  const unc = hasPredicted ? Math.max(uncBase, uncBase + 1.5) : uncBase

  const mapaCount =
    obj.amount != null && Number.isFinite(obj.amount) && obj.amount > 0
      ? Math.round(obj.amount)
      : undefined

  return {
    ...threat,
    lat,
    lon,
    heading,
    trail: mergedTrail?.length ? mergedTrail : threat.trail,
    velocity,
    confirmedAt,
    // predict() only flies when status === 'active'
    status: 'active',
    uncertaintyKm: unc,
    positionQuality: hasPredicted || goodScore ? 'mapa' : 'approx',
    count: Math.max(threat.count ?? 0, mapaCount ?? 0) || threat.count,
  }
}
