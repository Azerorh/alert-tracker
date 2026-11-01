import { apiUrl } from './api'

/** RadarMap — regional BPLA / air alerts across RF (OSINT, not official). */
export const RADAR_MAP_URL = 'https://radar-map.ru/'
export const RADAR_MAP_STATE_URL = 'https://radar-map.ru/api/state'

export type RuAlertLevel = 'danger' | 'attention'

export type RuAlertZone = {
  key: string
  name: string
  level: RuAlertLevel
  kinds: string[]
}

/** RadarMap Russian labels → feature `key` in russia-oblasts.geojson */
const RADAR_NAME_TO_KEY: Record<string, string> = {
  'Адыгея': 'ru-adygea',
  'Алтайский край': 'ru-altai-krai',
  'Амурская область': 'ru-amur-oblast',
  'Архангельская область': 'ru-arkhangelsk-oblast',
  'Астраханская область': 'ru-astrakhan-oblast',
  'Башкортостан': 'ru-bashkortostan',
  'Республика Башкортостан': 'ru-bashkortostan',
  'Белгородская область': 'ru-belgorod-oblast',
  'Брянская область': 'ru-bryansk-oblast',
  'Бурятия': 'ru-buryatia',
  'Владимирская область': 'ru-vladimir-oblast',
  'Волгоградская область': 'ru-volgograd-oblast',
  'Вологодская область': 'ru-vologda-oblast',
  'Воронежская область': 'ru-voronezh-oblast',
  'Дагестан': 'ru-dagestan',
  'Еврейская автономная область': 'ru-jewish-autonomous-oblast',
  'Забайкальский край': 'ru-zabaykalsky-krai',
  'Ивановская область': 'ru-ivanovo-oblast',
  'Ингушетия': 'ru-ingushetia',
  'Иркутская область': 'ru-irkutsk-oblast',
  'Кабардино-Балкария': 'ru-kabardino-balkaria',
  'Калининградская область': 'ru-kaliningrad',
  'Калининград': 'ru-kaliningrad',
  'Калмыкия': 'ru-kalmykia',
  'Калужская область': 'ru-kaluga-oblast',
  'Камчатский край': 'ru-kamchatka-krai',
  'Карачаево-Черкесия': 'ru-karachay-cherkessia',
  'Карелия': 'ru-republic-of-karelia',
  'Республика Карелия': 'ru-republic-of-karelia',
  'Кемеровская область': 'ru-kemerovo-oblast',
  'Кировская область': 'ru-kirov-oblast',
  'Коми': 'ru-komi-republic',
  'Республика Коми': 'ru-komi-republic',
  'Костромская область': 'ru-kostroma-oblast',
  'Краснодарский край': 'ru-krasnodar-krai',
  'Красноярский край': 'ru-krasnoyarsk-krai',
  'Курганская область': 'ru-kurgan-oblast',
  'Курская область': 'ru-kursk-oblast',
  'Ленинградская область': 'ru-leningrad-oblast',
  'Липецкая область': 'ru-lipetsk-oblast',
  'Магаданская область': 'ru-magadan-oblast',
  'Марий Эл': 'ru-mari-el',
  'Мордовия': 'ru-republic-of-mordovia',
  'Республика Мордовия': 'ru-republic-of-mordovia',
  'Москва': 'ru-moscow',
  'Московская область': 'ru-moscow-oblast',
  'Мурманская область': 'ru-murmansk-oblast',
  'Нижегородская область': 'ru-nizhny-novgorod-oblast',
  'Новгородская область': 'ru-novgorod-oblast',
  'Новосибирская область': 'ru-novosibirsk-oblast',
  'Омская область': 'ru-omsk-oblast',
  'Оренбургская область': 'ru-orenburg-oblast',
  'Орловская область': 'ru-oryol-oblast',
  'Пензенская область': 'ru-penza-oblast',
  'Пермский край': 'ru-perm-krai',
  'Приморский край': 'ru-primorsky-krai',
  'Псковская область': 'ru-pskov-oblast',
  'Ростовская область': 'ru-rostov-oblast',
  'Рязанская область': 'ru-ryazan-oblast',
  'Самарская область': 'ru-samara-oblast',
  'Санкт-Петербург': 'ru-saint-petersburg',
  'Саратовская область': 'ru-saratov-oblast',
  'Саха (Якутия)': 'ru-sakha-republic',
  'Якутия': 'ru-sakha-republic',
  'Сахалинская область': 'ru-sakhalin-oblast',
  'Свердловская область': 'ru-sverdlovsk-oblast',
  'Смоленская область': 'ru-smolensk-oblast',
  'Ставропольский край': 'ru-stavropol-krai',
  'Тамбовская область': 'ru-tambov-oblast',
  'Татарстан': 'ru-tatarstan',
  'Республика Татарстан': 'ru-tatarstan',
  'Тверская область': 'ru-tver-oblast',
  'Томская область': 'ru-tomsk-oblast',
  'Тульская область': 'ru-tula-oblast',
  'Тыва': 'ru-tuva',
  'Тюменская область': 'ru-tyumen-oblast',
  'Удмуртия': 'ru-udmurtia',
  'Ульяновская область': 'ru-ulyanovsk-oblast',
  'Хабаровский край': 'ru-khabarovsk-krai',
  'Хакасия': 'ru-khakassia',
  'ХМАО': 'ru-khanty-mansiysk-autonomous-okrug-ugra',
  'Ханты-Мансийский автономный округ': 'ru-khanty-mansiysk-autonomous-okrug-ugra',
  'Челябинская область': 'ru-chelyabinsk-oblast',
  'Чечня': 'ru-chechnya',
  'Чувашия': 'ru-chuvashia',
  'Чукотка': 'ru-chukotka-autonomous-okrug',
  'Ямало-Ненецкий автономный округ': 'ru-yamalo-nenets-autonomous-okrug',
  'Ярославская область': 'ru-yaroslavl-oblast',
  'Алтай': 'ru-altai-republic',
  'Республика Алтай': 'ru-altai-republic',
  'Северная Осетия': 'ru-north-ossetia-alania',
  'Северная Осетия — Алания': 'ru-north-ossetia-alania',
  'Ненецкий автономный округ': 'ru-nenets-autonomous-okrug',
}

/** DSM English region labels / keys → feature key */
const DSM_TO_KEY: Record<string, string> = {
  'ru-belgorod': 'ru-belgorod-oblast',
  'ru-bryansk': 'ru-bryansk-oblast',
  'ru-kursk': 'ru-kursk-oblast',
  'ru-voronezh': 'ru-voronezh-oblast',
  'ru-rostov': 'ru-rostov-oblast',
  'ru-krasnodar': 'ru-krasnodar-krai',
  'ru-lipetsk': 'ru-lipetsk-oblast',
  'ru-tambov': 'ru-tambov-oblast',
  'ru-oryol': 'ru-oryol-oblast',
  'ru-kaluga': 'ru-kaluga-oblast',
  'ru-tula': 'ru-tula-oblast',
  'ru-smolensk': 'ru-smolensk-oblast',
  'ru-kalmykia': 'ru-kalmykia',
  'ru-adygea': 'ru-adygea',
  'ru-stavropol': 'ru-stavropol-krai',
  'ru-moscow': 'ru-moscow',
  'ru-moscow-oblast': 'ru-moscow-oblast',
  'ru-ryazan': 'ru-ryazan-oblast',
  'ru-saratov': 'ru-saratov-oblast',
  'ru-volgograd': 'ru-volgograd-oblast',
  'ru-astrakhan': 'ru-astrakhan-oblast',
  'ru-penza': 'ru-penza-oblast',
  'ru-samara': 'ru-samara-oblast',
  'ru-ulyanovsk': 'ru-ulyanovsk-oblast',
  'ru-nizhny-novgorod': 'ru-nizhny-novgorod-oblast',
  'ru-vladimir': 'ru-vladimir-oblast',
  'ru-yaroslavl': 'ru-yaroslavl-oblast',
  'ru-tver': 'ru-tver-oblast',
  'ru-leningrad': 'ru-leningrad-oblast',
  'ru-saint-petersburg': 'ru-saint-petersburg',
  'ru-pskov': 'ru-pskov-oblast',
  'ru-novgorod': 'ru-novgorod-oblast',
  'ru-kaliningrad': 'ru-kaliningrad',
  'ru-tatarstan': 'ru-tatarstan',
  'ru-bashkortostan': 'ru-bashkortostan',
  'ru-orenburg': 'ru-orenburg-oblast',
  'ru-mordovia': 'ru-republic-of-mordovia',
  'ru-chuvashia': 'ru-chuvashia',
  'ru-kirov': 'ru-kirov-oblast',
  'ru-perm': 'ru-perm-krai',
  'ru-sverdlovsk': 'ru-sverdlovsk-oblast',
  'ru-chelyabinsk': 'ru-chelyabinsk-oblast',
  'ru-tyumen': 'ru-tyumen-oblast',
  'ru-novosibirsk': 'ru-novosibirsk-oblast',
}

type RadarRegion = {
  bpla?: boolean
  bplaDim?: boolean
  attention?: boolean
  danger?: boolean
  uab?: boolean
  fpv?: boolean
  rocket?: boolean
  rocket_level?: boolean
  aviation?: boolean
  pvo?: boolean
  explosionOnRegion?: boolean
  rocketOnRegion?: boolean
  fill?: string
}

function kindsFromRadar(r: RadarRegion): string[] {
  const out: string[] = []
  if (r.bpla || r.bplaDim) out.push('bpla')
  if (r.uab) out.push('uab')
  if (r.fpv) out.push('fpv')
  if (r.rocket || r.rocket_level || r.rocketOnRegion) out.push('rocket')
  if (r.aviation) out.push('aviation')
  if (r.pvo || r.explosionOnRegion) out.push('pvo')
  if (r.danger) out.push('danger')
  if (r.attention) out.push('attention')
  return out
}

function isRadarActive(r: RadarRegion): boolean {
  return Boolean(
    r.bpla ||
      r.bplaDim ||
      r.attention ||
      r.danger ||
      r.uab ||
      r.fpv ||
      r.rocket ||
      r.rocket_level ||
      r.aviation ||
      r.pvo ||
      r.explosionOnRegion ||
      r.rocketOnRegion,
  )
}

function levelFromRadar(r: RadarRegion): RuAlertLevel {
  if (r.attention && !r.danger && !r.bpla && !r.rocket && !r.uab && !r.aviation && !r.pvo) {
    return 'attention'
  }
  return 'danger'
}

export function parseRadarMapState(json: unknown): RuAlertZone[] {
  const regions = (json as { regions?: Record<string, RadarRegion> }).regions ?? {}
  const out: RuAlertZone[] = []
  for (const [name, raw] of Object.entries(regions)) {
    if (!isRadarActive(raw)) continue
    const key = RADAR_NAME_TO_KEY[name]
    if (!key) continue
    out.push({
      key,
      name,
      level: levelFromRadar(raw),
      kinds: kindsFromRadar(raw),
    })
  }
  return out
}

export function parseDsmRuAlerts(json: unknown): RuAlertZone[] {
  const active = (json as { active?: Array<Record<string, unknown>> }).active ?? []
  const out: RuAlertZone[] = []
  for (const a of active) {
    if (String(a.country ?? '') !== 'RU') continue
    if (a.ended_at != null) continue
    if (a.occupied === true) continue
    const regionKey = String(a.region_key ?? '')
    const key = DSM_TO_KEY[regionKey]
    if (!key) continue
    out.push({
      key,
      name: String(a.region ?? regionKey),
      level: 'danger',
      kinds: [String(a.kind ?? 'air_raid')],
    })
  }
  return out
}

function mergeAlerts(a: RuAlertZone[], b: RuAlertZone[]): RuAlertZone[] {
  const map = new Map<string, RuAlertZone>()
  for (const z of [...a, ...b]) {
    const prev = map.get(z.key)
    if (!prev) {
      map.set(z.key, z)
      continue
    }
    map.set(z.key, {
      ...prev,
      level: prev.level === 'danger' || z.level === 'danger' ? 'danger' : 'attention',
      kinds: [...new Set([...prev.kinds, ...z.kinds])],
    })
  }
  return [...map.values()]
}

async function fetchJson(urls: string[]): Promise<unknown> {
  let lastErr: unknown
  for (const url of urls) {
    if (!url) continue
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('RU alerts unavailable')
}

export async function fetchRuAlertSnapshot(): Promise<RuAlertZone[] | null> {
  try {
    const base = import.meta.env.BASE_URL || '/'
    const res = await fetch(`${base}geo/ru-alerts.json`)
    if (!res.ok) return null
    const json = (await res.json()) as { alerts?: RuAlertZone[] }
    return Array.isArray(json.alerts) ? json.alerts : []
  } catch {
    return null
  }
}

export async function fetchRuAlertZones(): Promise<RuAlertZone[]> {
  const batches = await Promise.allSettled([
    fetchJson([apiUrl('/api/radar-map/state'), RADAR_MAP_STATE_URL]).then(parseRadarMapState),
    fetchJson([
      apiUrl('/api/dsm/alerts'),
      'https://dronestrikemap.com/api/alerts',
    ]).then(parseDsmRuAlerts),
  ])
  const parts: RuAlertZone[][] = []
  for (const b of batches) {
    if (b.status === 'fulfilled') parts.push(b.value)
  }
  if (parts.length) return mergeAlerts(parts[0] ?? [], parts[1] ?? [])

  const snap = await fetchRuAlertSnapshot()
  if (snap && snap.length > 0) return snap
  throw new Error('RU alerts unavailable')
}
