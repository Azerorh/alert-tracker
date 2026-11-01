import { apiUrl } from './api'

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
}

/** Public raw file — CORS OK, refreshed by scheduled Actions. */
const GITHUB_RAW_RU_ALERTS =
  'https://raw.githubusercontent.com/Azerorh/alert-tracker/main/public/geo/ru-alerts.json'

function cacheBust(url: string): string {
  const t = Math.floor(Date.now() / 60_000)
  return `${url}${url.includes('?') ? '&' : '?'}t=${t}`
}

function parseAlertsPayload(json: unknown): RuAlertZone[] | null {
  const alerts = (json as { alerts?: RuAlertZone[] }).alerts
  return Array.isArray(alerts) ? alerts : null
}

export async function fetchRuAlertSnapshot(): Promise<RuAlertZone[] | null> {
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

export async function fetchRuAlertZones(): Promise<RuAlertZone[]> {
  const livePromise = (async () => {
    const url = apiUrl('/api/ru-tg-alerts')
    if (!url) return null
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return parseAlertsPayload(await res.json())
  })().catch(() => null)

  const [live, snap] = await Promise.all([livePromise, fetchRuAlertSnapshot()])
  if (live) return live
  if (snap) return snap
  throw new Error('RU alerts unavailable')
}
