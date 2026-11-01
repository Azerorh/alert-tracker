import { apiUrl } from './api'
import type { DisplayThreat } from './threatDisplay'

/** Same public TG channels cited by map.nahr.uk (not their Cloudflare API). */
export const NAHR_MAP_URL = 'https://map.nahr.uk/'
export const NAHR_TG_CHANNELS = [
  { id: 'kupolrussia', label: 'КУПОЛ РОСІЇ', url: 'https://t.me/kupolrussia' },
  { id: 'locatorru', label: 'ЛОКАТОР РОСІЇ', url: 'https://t.me/locatorru' },
  { id: 'vrv_radar', label: 'ВРВ РАДАР', url: 'https://t.me/vrv_radar' },
  {
    id: 'lpr1_treugolnik',
    label: 'LPR 1 / Треугольник',
    url: 'https://t.me/lpr1_treugolnik',
  },
] as const

/** @deprecated alias — footer previously linked RadarMap */
export const RADAR_MAP_URL = NAHR_MAP_URL

export type RuAlertLevel = 'danger' | 'attention'

export type RuAlertZone = {
  key: string
  name: string
  level: RuAlertLevel
  kinds: string[]
  /** `ru` = russia-oblasts; `ua-tot` = occupied UA oblast in oblasts.geojson */
  layer?: 'ru' | 'ua-tot'
  /** Compass from TG text (degrees clockwise from north), if parsed. */
  bearingDeg?: number | null
  activatedAt?: string | null
}

export type RuTrajectoryPoint = {
  lat: number
  lon: number
  place?: string
}

/** Experimental corridor from TG — place waypoints and/or oblast keys (centroids on map). */
export type RuTrajectory = {
  id: string
  keys: string[]
  /** Geocoded fixes; empty → map falls back to oblast centroids for the line. */
  points?: RuTrajectoryPoint[]
  bearingDeg?: number | null
  source: 'message' | 'cascade' | 'place'
}

export type RuAlertsPayload = {
  alerts: RuAlertZone[]
  trajectories: RuTrajectory[]
}

/** Public raw file — CORS OK, refreshed by scheduled Actions. */
const GITHUB_RAW_RU_ALERTS =
  'https://raw.githubusercontent.com/Azerorh/alert-tracker/main/public/geo/ru-alerts.json'

function cacheBust(url: string): string {
  const t = Math.floor(Date.now() / 60_000)
  return `${url}${url.includes('?') ? '&' : '?'}t=${t}`
}

function parseAlertsPayload(json: unknown): RuAlertsPayload | null {
  const alerts = (json as { alerts?: RuAlertZone[] }).alerts
  if (!Array.isArray(alerts)) return null
  const trajectories = (json as { trajectories?: RuTrajectory[] }).trajectories
  return {
    alerts,
    trajectories: Array.isArray(trajectories) ? trajectories : [],
  }
}

export async function fetchRuAlertSnapshot(): Promise<RuAlertsPayload | null> {
  const base = import.meta.env.BASE_URL || '/'
  const urls = [
    cacheBust(`${base}geo/ru-alerts.json`),
    cacheBust(GITHUB_RAW_RU_ALERTS),
  ]
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: 'no-cache' })
      if (!res.ok) continue
      const parsed = parseAlertsPayload(await res.json())
      if (parsed) return parsed
    } catch {
      /* try next */
    }
  }
  return null
}

export async function fetchRuAlertZones(): Promise<RuAlertsPayload> {
  const byKey = new Map<string, RuAlertZone>()
  const byTraj = new Map<string, RuTrajectory>()

  const snap = await fetchRuAlertSnapshot()
  if (snap) {
    for (const a of snap.alerts) byKey.set(a.key, a)
    for (const t of snap.trajectories) byTraj.set(t.id, t)
  }

  try {
    const url = apiUrl('/api/ru-tg-alerts')
    if (url) {
      const res = await fetch(url)
      if (res.ok) {
        const live = parseAlertsPayload(await res.json())
        if (live) {
          for (const a of live.alerts) byKey.set(a.key, a)
          // Prefer live corridors when the BFF actually computed them;
          // empty live must not wipe a richer snapshot (stale BFF cache).
          if (live.trajectories.length > 0) {
            byTraj.clear()
            for (const t of live.trajectories) byTraj.set(t.id, t)
          }
        }
      }
    }
  } catch {
    /* snapshot-only ok */
  }

  if (byKey.size === 0) throw new Error('RU alerts unavailable')
  return {
    alerts: [...byKey.values()],
    trajectories: [...byTraj.values()],
  }
}

const KIND_UA: Record<string, string> = {
  bpla: 'БПЛА',
  ballistic: 'балістика',
  rocket: 'ракети',
  aviation: 'авіація',
  shelling: 'обстріл / FPV',
}

export function ruBplaMarkerId(
  kind: 'place' | 'oblast',
  lon: number,
  lat: number,
  ref: string,
): string {
  return `ru-bpla:${kind}:${lon.toFixed(3)}:${lat.toFixed(3)}:${encodeURIComponent(ref)}`
}

export function isRuBplaMarkerId(id: string): boolean {
  return id.startsWith('ru-bpla:')
}

/** Synthetic threat so RF TG markers reuse ThreatSheet like NEPTUN/DSM. */
export function findRuBplaDisplayThreat(
  id: string,
  alerts: RuAlertZone[],
  trajectories: RuTrajectory[],
): DisplayThreat | null {
  if (!isRuBplaMarkerId(id)) return null
  const parts = id.split(':')
  if (parts.length < 5) return null
  const kind = parts[1] as 'place' | 'oblast'
  const lon = Number(parts[2])
  const lat = Number(parts[3])
  const ref = decodeURIComponent(parts.slice(4).join(':'))
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null

  if (kind === 'place') {
    const traj = trajectories.find((t) =>
      (t.points ?? []).some(
        (p) =>
          p.place === ref ||
          (Math.abs(p.lat - lat) < 0.02 && Math.abs(p.lon - lon) < 0.02),
      ),
    )
    const alert =
      alerts.find((a) => traj?.keys.includes(a.key)) ??
      alerts.find((a) => a.kinds?.includes('bpla'))
    const kinds = alert?.kinds?.map((k) => KIND_UA[k] ?? k).join(', ') || 'БПЛА'
    const regionNames =
      traj?.keys
        .map((k) => alerts.find((a) => a.key === k)?.name ?? k)
        .filter(Boolean)
        .join(' · ') ||
      alert?.name ||
      'РФ'
    const bearing = traj?.bearingDeg ?? alert?.bearingDeg ?? null
    const course =
      bearing != null && Number.isFinite(bearing)
        ? ` Курс з тексту ~${Math.round(bearing)}°.`
        : ''
    return {
      id,
      type: 'uav',
      title: ref,
      region: regionNames,
      district: '',
      locality: ref,
      lat,
      lon,
      heading: bearing,
      confidenceLevel: 'medium',
      displayConfidence: 'medium',
      updatedAt: alert?.activatedAt ?? new Date().toISOString(),
      confirmedAt: alert?.activatedAt ?? undefined,
      explanationShort: `Тривога / фіксація БПЛА (TG): ${kinds}.${course} Не live-трек NEPTUN.`,
      status: 'active',
      positionQuality: 'approx',
      uncertaintyKm: 15,
      advisory: true,
    }
  }

  const alert = alerts.find((a) => a.key === ref)
  if (!alert) return null
  const kinds = alert.kinds.map((k) => KIND_UA[k] ?? k).join(', ')
  const course =
    alert.bearingDeg != null && Number.isFinite(alert.bearingDeg)
      ? ` Курс з тексту ~${Math.round(alert.bearingDeg)}°.`
      : ''
  return {
    id,
    type: 'uav',
    title: alert.name,
    region: alert.name,
    district: '',
    locality: undefined,
    lat,
    lon,
    heading: alert.bearingDeg ?? null,
    confidenceLevel: 'low',
    displayConfidence: 'low',
    updatedAt: alert.activatedAt ?? new Date().toISOString(),
    confirmedAt: alert.activatedAt ?? undefined,
    explanationShort: `Регіональна тривога РФ (TG / NAHR-джерела): ${kinds}.${course} Маркер у центрі області — не точна точка БПЛА.`,
    status: 'active',
    positionQuality: 'approx',
    uncertaintyKm: 40,
    advisory: true,
    areaOnly: true,
  }
}
