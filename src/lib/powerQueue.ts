import { apiUrl } from './api'
import {
  isPowerOffStatus,
  powerStatusLabel,
  type PowerGroup,
  type PowerOblast,
  type PowerOutagesPayload,
} from './powerOutages'

export const POWER_QUEUE_STORAGE_KEY = 'alert-tracker:my-power-queue:v1'
export const POWER_QUEUE_SELECT_ID = 'power-queue'

export type YasnoDsoOption = {
  id: number
  name: string
  /** Prefix for Kolysvitlo group ids when several DSOs share one oblast */
  groupPrefix?: string
}

export type YasnoRegionOption = {
  id: number
  value: string
  hasCities: boolean
  dsos: YasnoDsoOption[]
  /** Matching Kolysvitlo oblastKey */
  oblastKey: string
}

/** Yasno regions that still expose public address→group lookup. */
export const YASNO_QUEUE_REGIONS: YasnoRegionOption[] = [
  {
    id: 25,
    value: 'Київ',
    hasCities: false,
    dsos: [{ id: 902, name: 'ДТЕК Київські електромережі' }],
    oblastKey: 'м. київ',
  },
  {
    id: 3,
    value: 'Дніпро',
    hasCities: true,
    dsos: [
      { id: 301, name: 'ДнЕМ' },
      { id: 303, name: 'ЦЕК', groupPrefix: 'cek_dnipro:' },
    ],
    oblastKey: 'дніпропетровська',
  },
]

/** Approximate oblast centroids for the «моя черга» pin (no street-level truth). */
export const OBLAST_CENTROIDS: Record<string, { lat: number; lon: number }> = {
  вінницька: { lat: 49.2331, lon: 28.4682 },
  волинська: { lat: 50.7472, lon: 25.3254 },
  дніпропетровська: { lat: 48.4647, lon: 35.0462 },
  донецька: { lat: 48.0159, lon: 37.8028 },
  житомирська: { lat: 50.2547, lon: 28.6587 },
  закарпатська: { lat: 48.6208, lon: 22.2879 },
  запорізька: { lat: 47.8388, lon: 35.1396 },
  'івано-франківська': { lat: 48.9226, lon: 24.7111 },
  київська: { lat: 50.05, lon: 30.4 },
  кіровоградська: { lat: 48.5079, lon: 32.2623 },
  львівська: { lat: 49.8397, lon: 24.0297 },
  'м. київ': { lat: 50.4501, lon: 30.5234 },
  миколаївська: { lat: 46.975, lon: 31.9946 },
  одеська: { lat: 46.4825, lon: 30.7233 },
  полтавська: { lat: 49.5883, lon: 34.5514 },
  рівненська: { lat: 50.6199, lon: 26.2516 },
  сумська: { lat: 50.9077, lon: 34.7981 },
  тернопільська: { lat: 49.5535, lon: 25.5948 },
  харківська: { lat: 49.9935, lon: 36.2304 },
  хмельницька: { lat: 49.4229, lon: 26.9871 },
  черкаська: { lat: 49.4444, lon: 32.0598 },
  чернівецька: { lat: 48.2917, lon: 25.9352 },
  чернігівська: { lat: 51.4982, lon: 31.2893 },
}

export type SavedPowerQueue = {
  oblastKey: string
  groupId: string
  groupLabel: string
  source: 'manual' | 'yasno'
  addressLabel?: string | null
  yasno?: {
    regionId: number
    dsoId: number
    street?: string
    house?: string
    city?: string
  } | null
  savedAt: string
}

export type YasnoAddressItem = { id: number; value: string }

export type ResolvedPowerQueue = {
  saved: SavedPowerQueue
  oblast: PowerOblast
  group: PowerGroup
  groupId: string
  nowOff: boolean
  nowLabel: string
  lat: number
  lon: number
}

export function normalizeGroupToken(raw: string): string {
  return String(raw ?? '')
    .trim()
    .replace(/^GPV/i, '')
    .replace(/^cek_dnipro:/i, '')
    .replace(/\s+/g, '')
}

export function formatYasnoGroup(group: number, subgroup: number): string {
  return `${group}.${subgroup}`
}

export function yasnoGroupToKolysvitloId(
  queue: string,
  groupPrefix?: string,
): string {
  const token = normalizeGroupToken(queue)
  const bare = token.replace(/^GPV/i, '')
  return `${groupPrefix ?? ''}GPV${bare}`
}

export function findGroupInOblast(
  oblast: PowerOblast,
  groupId: string,
): { id: string; group: PowerGroup } | null {
  if (oblast.groups[groupId]) {
    return { id: groupId, group: oblast.groups[groupId] }
  }
  const want = normalizeGroupToken(groupId).toLowerCase()
  for (const [id, group] of Object.entries(oblast.groups)) {
    const bare = normalizeGroupToken(id).toLowerCase()
    if (bare === want || id.toLowerCase() === groupId.toLowerCase()) {
      return { id, group }
    }
    if (normalizeGroupToken(group.name).toLowerCase() === want) {
      return { id, group }
    }
  }
  return null
}

export function loadSavedPowerQueue(): SavedPowerQueue | null {
  try {
    const raw = localStorage.getItem(POWER_QUEUE_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SavedPowerQueue
    if (!parsed?.oblastKey || !parsed?.groupId) return null
    return parsed
  } catch {
    return null
  }
}

export function savePowerQueue(saved: SavedPowerQueue): void {
  localStorage.setItem(POWER_QUEUE_STORAGE_KEY, JSON.stringify(saved))
}

export function clearSavedPowerQueue(): void {
  localStorage.removeItem(POWER_QUEUE_STORAGE_KEY)
}

export function resolveSavedQueue(
  payload: PowerOutagesPayload | null,
  saved: SavedPowerQueue | null,
): ResolvedPowerQueue | null {
  if (!payload || !saved) return null
  const oblast = payload.oblasts.find((o) => o.oblastKey === saved.oblastKey)
  if (!oblast) return null
  const hit = findGroupInOblast(oblast, saved.groupId)
  if (!hit) return null
  const centroid = OBLAST_CENTROIDS[oblast.oblastKey] ?? {
    lat: 49.0,
    lon: 32.0,
  }
  return {
    saved,
    oblast,
    group: hit.group,
    groupId: hit.id,
    nowOff: isPowerOffStatus(hit.group.nowStatus),
    nowLabel: powerStatusLabel(hit.group.nowStatus),
    lat: centroid.lat,
    lon: centroid.lon,
  }
}

async function yasnoGet<T>(path: string, params: Record<string, string | number>): Promise<T> {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) q.set(k, String(v))
  const res = await fetch(apiUrl(`/api/power-queue/yasno/${path}?${q}`), {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(body || `Yasno ${path} HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export async function yasnoSearchStreets(args: {
  regionId: number
  dsoId: number
  query: string
  cityId?: number
}): Promise<YasnoAddressItem[]> {
  const params: Record<string, string | number> = {
    regionId: args.regionId,
    dsoId: args.dsoId,
    query: args.query.trim(),
  }
  if (args.cityId != null) params.cityId = args.cityId
  return yasnoGet<YasnoAddressItem[]>('streets', params)
}

export async function yasnoSearchCities(args: {
  regionId: number
  dsoId: number
  query: string
}): Promise<YasnoAddressItem[]> {
  return yasnoGet<YasnoAddressItem[]>('cities', {
    regionId: args.regionId,
    dsoId: args.dsoId,
    query: args.query.trim(),
  })
}

export async function yasnoSearchHouses(args: {
  regionId: number
  dsoId: number
  streetId: number
  query: string
  cityId?: number
}): Promise<YasnoAddressItem[]> {
  const params: Record<string, string | number> = {
    regionId: args.regionId,
    dsoId: args.dsoId,
    streetId: args.streetId,
    query: args.query.trim(),
  }
  if (args.cityId != null) params.cityId = args.cityId
  return yasnoGet<YasnoAddressItem[]>('houses', params)
}

export async function yasnoResolveGroup(args: {
  regionId: number
  dsoId: number
  streetId: number
  houseId: number
  cityId?: number
}): Promise<{ group: number; subgroup: number; queue: string }> {
  const params: Record<string, string | number> = {
    regionId: args.regionId,
    dsoId: args.dsoId,
    streetId: args.streetId,
    houseId: args.houseId,
  }
  if (args.cityId != null) params.cityId = args.cityId
  const raw = await yasnoGet<{ group: number; subgroup: number }>('group', params)
  return {
    group: raw.group,
    subgroup: raw.subgroup,
    queue: formatYasnoGroup(raw.group, raw.subgroup),
  }
}

export function dsoGroupPrefix(
  region: YasnoRegionOption,
  dsoId: number,
): string | undefined {
  return region.dsos.find((d) => d.id === dsoId)?.groupPrefix
}
