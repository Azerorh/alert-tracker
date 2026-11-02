export type PowerTgMarker = {
  id: string
  lat: number
  lon: number
  place: string | null
  precision: string
  at: string
  channelId: string
  channelLabel: string
  channelUrl: string
  postUrl: string | null
  summary: string
}

export type PowerTgPayload = {
  fetchedAt: string
  source: string
  windowHours: number
  markers: PowerTgMarker[]
  errors?: string[]
}

const GITHUB_RAW =
  'https://raw.githubusercontent.com/Azerorh/alert-tracker/main/public/geo/power-tg-outages.json'

function cacheBust(url: string): string {
  const t = Math.floor(Date.now() / 60_000)
  return `${url}${url.includes('?') ? '&' : '?'}t=${t}`
}

function parsePayload(json: unknown): PowerTgPayload | null {
  if (!json || typeof json !== 'object') return null
  const raw = json as Partial<PowerTgPayload>
  if (!Array.isArray(raw.markers)) return null
  const markers = raw.markers.filter(
    (m): m is PowerTgMarker =>
      !!m &&
      typeof m.id === 'string' &&
      Number.isFinite(m.lat) &&
      Number.isFinite(m.lon),
  )
  return {
    fetchedAt: String(raw.fetchedAt ?? ''),
    source: String(raw.source ?? 'power-tg-outages'),
    windowHours: Number(raw.windowHours ?? 36),
    markers,
    errors: Array.isArray(raw.errors) ? raw.errors.map(String) : [],
  }
}

export async function fetchPowerTgOutagesSnapshot(): Promise<PowerTgPayload | null> {
  const base = import.meta.env.BASE_URL || '/'
  const urls = [cacheBust(`${base}geo/power-tg-outages.json`), cacheBust(GITHUB_RAW)]
  for (const url of urls) {
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

export function powerTgSelectId(id: string): string {
  return `power-tg:${id}`
}

export function parsePowerTgSelectId(id: string | null): string | null {
  if (!id?.startsWith('power-tg:')) return null
  return id.slice('power-tg:'.length)
}

export function powerTgById(
  markers: PowerTgMarker[],
  id: string | null,
): PowerTgMarker | null {
  if (!id) return null
  return markers.find((m) => m.id === id) ?? null
}
