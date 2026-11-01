/** Build-time snapshot of active RU alert oblast keys (GitHub Pages has no BFF / CORS). */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RADAR = 'https://radar-map.ru/api/state'
const DSM = 'https://dronestrikemap.com/api/alerts'
const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'geo',
  'ru-alerts.json',
)

const RADAR_NAME_TO_KEY = {
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

const DSM_TO_KEY = {
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

function isRadarActive(r) {
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

function kindsFromRadar(r) {
  const out = []
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

function levelFromRadar(r) {
  if (
    r.attention &&
    !r.danger &&
    !r.bpla &&
    !r.rocket &&
    !r.uab &&
    !r.aviation &&
    !r.pvo
  ) {
    return 'attention'
  }
  return 'danger'
}

async function fromRadar() {
  const res = await fetch(RADAR, {
    headers: { Accept: 'application/json', 'User-Agent': 'alert-tracker-build/1.0' },
  })
  if (!res.ok) throw new Error(`radar HTTP ${res.status}`)
  const json = await res.json()
  const out = []
  for (const [name, raw] of Object.entries(json.regions ?? {})) {
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

async function fromDsm() {
  const res = await fetch(DSM, {
    headers: { Accept: 'application/json', 'User-Agent': 'alert-tracker-build/1.0' },
  })
  if (!res.ok) throw new Error(`dsm alerts HTTP ${res.status}`)
  const json = await res.json()
  const out = []
  for (const a of json.active ?? []) {
    if (a.country !== 'RU' || a.ended_at != null || a.occupied === true) continue
    const key = DSM_TO_KEY[String(a.region_key ?? '')]
    if (!key) continue
    out.push({
      key,
      name: String(a.region ?? a.region_key),
      level: 'danger',
      kinds: [String(a.kind ?? 'air_raid')],
    })
  }
  return out
}

function merge(a, b) {
  const map = new Map()
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

async function main() {
  const parts = await Promise.allSettled([fromRadar(), fromDsm()])
  const alerts = merge(
    parts[0].status === 'fulfilled' ? parts[0].value : [],
    parts[1].status === 'fulfilled' ? parts[1].value : [],
  )
  if (!alerts.length && parts.every((p) => p.status === 'rejected')) {
    throw new Error('both RU alert sources failed')
  }
  const payload = { fetchedAt: new Date().toISOString(), alerts }
  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload))
  console.log(`[ru-alerts] snapshot ${OUT}: ${alerts.length} regions`)
}

main().catch((err) => {
  console.error('[ru-alerts] refresh failed', err)
  process.exit(1)
})
