export type PowerSlotStatus =
  | 'yes'
  | 'no'
  | 'first'
  | 'second'
  | 'maybe'
  | 'mfirst'
  | 'msecond'
  | 'unknown'
  | string

export type PowerSlot = {
  hour: number
  status: PowerSlotStatus
}

export type PowerGroup = {
  name: string
  slots: PowerSlot[]
  nowStatus: PowerSlotStatus
}

export type PowerOperator = {
  id: string
  name: string
}

export type PowerOblast = {
  oblastKey: string
  name: string
  updatedAt: string | null
  fetchedAt: string | null
  scheduleDate: string | null
  noOutages: boolean
  operators: PowerOperator[]
  groups: Record<string, PowerGroup>
  offNow: string[]
  groupCount: number
  offNowCount: number
  intensity: number
  sourceUrl?: string
}

export type PowerOutagesPayload = {
  fetchedAt: string
  source: string
  attribution: string
  kyivHour: number
  oblastCount: number
  errors?: string[]
  oblasts: PowerOblast[]
}

const GITHUB_RAW =
  'https://raw.githubusercontent.com/Azerorh/alert-tracker/main/public/geo/power-outages.json'

export const POWER_ATTRIBUTION_URL = 'https://kolysvitlo.com/'

function cacheBust(url: string): string {
  const t = Math.floor(Date.now() / 60_000)
  return `${url}${url.includes('?') ? '&' : '?'}t=${t}`
}

export function isPowerOffStatus(status: string | undefined): boolean {
  const s = String(status ?? '').toLowerCase()
  return s === 'no' || s === 'first' || s === 'second' || s === 'mfirst' || s === 'msecond'
}

export function powerStatusLabel(status: string | undefined): string {
  switch (String(status ?? '').toLowerCase()) {
    case 'yes':
      return 'світло є'
    case 'no':
      return 'немає світла'
    case 'first':
      return 'відкл. 1-ша пол. години'
    case 'second':
      return 'відкл. 2-га пол. години'
    case 'maybe':
      return 'можливе відкл.'
    default:
      return 'невідомо'
  }
}

/** Recompute "now" fields for the current Kyiv hour (snapshot hour may be stale). */
export function refreshPowerNow(
  payload: PowerOutagesPayload,
  now = Date.now(),
): PowerOutagesPayload {
  const hour = kyivHour(now)
  const oblasts = payload.oblasts.map((o) => {
    const offNow: string[] = []
    const groups: Record<string, PowerGroup> = {}
    for (const [gid, g] of Object.entries(o.groups ?? {})) {
      const slot = g.slots?.find((s) => s.hour === hour)
      const nowStatus = slot?.status ?? 'unknown'
      groups[gid] = { ...g, nowStatus }
      if (isPowerOffStatus(nowStatus)) offNow.push(gid.replace(/^GPV/i, ''))
    }
    const groupCount = Object.keys(groups).length
    const offNowCount = offNow.length
    return {
      ...o,
      groups,
      offNow,
      groupCount,
      offNowCount,
      intensity: groupCount > 0 ? offNowCount / groupCount : 0,
    }
  })
  return { ...payload, kyivHour: hour, oblasts, oblastCount: oblasts.length }
}

export function kyivHour(now = Date.now()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Kyiv',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date(now))
  return Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
}

function parsePayload(json: unknown): PowerOutagesPayload | null {
  if (!json || typeof json !== 'object') return null
  const raw = json as Partial<PowerOutagesPayload>
  if (!Array.isArray(raw.oblasts)) return null
  return {
    fetchedAt: String(raw.fetchedAt ?? ''),
    source: String(raw.source ?? 'kolysvitlo'),
    attribution: String(raw.attribution ?? POWER_ATTRIBUTION_URL),
    kyivHour: Number(raw.kyivHour ?? 0),
    oblastCount: Number(raw.oblastCount ?? raw.oblasts.length),
    errors: Array.isArray(raw.errors) ? raw.errors.map(String) : [],
    oblasts: raw.oblasts as PowerOblast[],
  }
}

export async function fetchPowerOutagesSnapshot(): Promise<PowerOutagesPayload | null> {
  const base = import.meta.env.BASE_URL || '/'
  const urls = [cacheBust(`${base}geo/power-outages.json`), cacheBust(GITHUB_RAW)]
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: 'no-cache' })
      if (!res.ok) continue
      const parsed = parsePayload(await res.json())
      if (parsed) return refreshPowerNow(parsed)
    } catch {
      /* next */
    }
  }
  return null
}

export function powerOblastByKey(
  payload: PowerOutagesPayload | null,
  key: string | null,
): PowerOblast | null {
  if (!payload || !key) return null
  return payload.oblasts.find((o) => o.oblastKey === key) ?? null
}

export function powerSelectId(oblastKey: string): string {
  return `power:${oblastKey}`
}

export function parsePowerSelectId(id: string | null): string | null {
  if (!id?.startsWith('power:')) return null
  return id.slice('power:'.length)
}
