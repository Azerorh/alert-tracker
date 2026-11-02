/**
 * RU oblast alerts from the same public Telegram channels that map.nahr.uk cites
 * (Купол / Локатор / ВРВ / Треугольник). Not their API (Cloudflare-protected).
 */

import {
  extractPlacesFromText,
  loadPlaceIndex,
} from './placeGazetteer.mjs'

export const NAHR_TG_CHANNELS = [
  { id: 'kupolrussia', label: 'КУПОЛ РОСІЇ' },
  { id: 'locatorru', label: 'ЛОКАТОР РОСІЇ' },
  { id: 'vrv_radar', label: 'ВРВ РАДАР' },
  { id: 'lpr1_treugolnik', label: 'LPR 1 / Треугольник' },
  /** Extra RU radar-style channels — still collapsed to oblast keys (no map flood). */
  { id: 'radarrussiia', label: 'Радар по РФ' },
  { id: 'Radarrussia_bpla', label: 'Радар БПЛА РФ' },
  { id: 'radarru2', label: 'Локатор RU' },
]

export const NAHR_MAP_URL = 'https://map.nahr.uk/'

/** Official-ish Russian labels → russia-oblasts.geojson keys */
const NAME_TO_KEY = {
  Адыгея: 'ru-adygea',
  'Республика Адыгея': 'ru-adygea',
  'Алтайский край': 'ru-altai-krai',
  'Амурская область': 'ru-amur-oblast',
  'Архангельская область': 'ru-arkhangelsk-oblast',
  'Астраханская область': 'ru-astrakhan-oblast',
  Башкортостан: 'ru-bashkortostan',
  'Республика Башкортостан': 'ru-bashkortostan',
  'Белгородская область': 'ru-belgorod-oblast',
  'Брянская область': 'ru-bryansk-oblast',
  Бурятия: 'ru-buryatia',
  'Республика Бурятия': 'ru-buryatia',
  'Владимирская область': 'ru-vladimir-oblast',
  'Волгоградская область': 'ru-volgograd-oblast',
  'Вологодская область': 'ru-vologda-oblast',
  'Воронежская область': 'ru-voronezh-oblast',
  Дагестан: 'ru-dagestan',
  'Республика Дагестан': 'ru-dagestan',
  'Еврейская автономная область': 'ru-jewish-autonomous-oblast',
  'Забайкальский край': 'ru-zabaykalsky-krai',
  'Ивановская область': 'ru-ivanovo-oblast',
  Ингушетия: 'ru-ingushetia',
  'Республика Ингушетия': 'ru-ingushetia',
  'Иркутская область': 'ru-irkutsk-oblast',
  'Кабардино-Балкария': 'ru-kabardino-balkaria',
  'Кабардино-Балкарская Республика': 'ru-kabardino-balkaria',
  'Калининградская область': 'ru-kaliningrad',
  Калининград: 'ru-kaliningrad',
  Калмыкия: 'ru-kalmykia',
  'Республика Калмыкия': 'ru-kalmykia',
  'Калужская область': 'ru-kaluga-oblast',
  'Камчатский край': 'ru-kamchatka-krai',
  'Карачаево-Черкесия': 'ru-karachay-cherkessia',
  Карелия: 'ru-republic-of-karelia',
  'Республика Карелия': 'ru-republic-of-karelia',
  'Кемеровская область': 'ru-kemerovo-oblast',
  Кузбасс: 'ru-kemerovo-oblast',
  'Кировская область': 'ru-kirov-oblast',
  Коми: 'ru-komi-republic',
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
  'Республика Марий Эл': 'ru-mari-el',
  Мордовия: 'ru-republic-of-mordovia',
  'Республика Мордовия': 'ru-republic-of-mordovia',
  Москва: 'ru-moscow',
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
  Якутия: 'ru-sakha-republic',
  'Сахалинская область': 'ru-sakhalin-oblast',
  'Свердловская область': 'ru-sverdlovsk-oblast',
  'Смоленская область': 'ru-smolensk-oblast',
  'Ставропольский край': 'ru-stavropol-krai',
  'Тамбовская область': 'ru-tambov-oblast',
  Татарстан: 'ru-tatarstan',
  'Республика Татарстан': 'ru-tatarstan',
  'Тверская область': 'ru-tver-oblast',
  'Томская область': 'ru-tomsk-oblast',
  'Тульская область': 'ru-tula-oblast',
  Тыва: 'ru-tuva',
  'Республика Тыва': 'ru-tuva',
  'Тюменская область': 'ru-tyumen-oblast',
  Удмуртия: 'ru-udmurtia',
  'Удмуртская Республика': 'ru-udmurtia',
  'Ульяновская область': 'ru-ulyanovsk-oblast',
  'Хабаровский край': 'ru-khabarovsk-krai',
  Хакасия: 'ru-khakassia',
  'Республика Хакасия': 'ru-khakassia',
  ХМАО: 'ru-khanty-mansiysk-autonomous-okrug-ugra',
  'Ханты-Мансийский автономный округ': 'ru-khanty-mansiysk-autonomous-okrug-ugra',
  'Челябинская область': 'ru-chelyabinsk-oblast',
  Чечня: 'ru-chechnya',
  'Чеченская Республика': 'ru-chechnya',
  Чувашия: 'ru-chuvashia',
  'Чувашская Республика': 'ru-chuvashia',
  Чукотка: 'ru-chukotka-autonomous-okrug',
  'Ямало-Ненецкий автономный округ': 'ru-yamalo-nenets-autonomous-okrug',
  'Ярославская область': 'ru-yaroslavl-oblast',
  Алтай: 'ru-altai-republic',
  'Республика Алтай': 'ru-altai-republic',
  'Северная Осетия': 'ru-north-ossetia-alania',
  'Северная Осетия — Алания': 'ru-north-ossetia-alania',
  'Ненецкий автономный округ': 'ru-nenets-autonomous-okrug',
}

const EXTRA_ALIASES = {
  Белгородская: 'ru-belgorod-oblast',
  Брянская: 'ru-bryansk-oblast',
  Владимирская: 'ru-vladimir-oblast',
  Волгоградская: 'ru-volgograd-oblast',
  Вологодская: 'ru-vologda-oblast',
  Воронежская: 'ru-voronezh-oblast',
  Ивановская: 'ru-ivanovo-oblast',
  Иркутская: 'ru-irkutsk-oblast',
  Калининградская: 'ru-kaliningrad',
  Калужская: 'ru-kaluga-oblast',
  Кемеровская: 'ru-kemerovo-oblast',
  Кировская: 'ru-kirov-oblast',
  Костромская: 'ru-kostroma-oblast',
  Краснодарский: 'ru-krasnodar-krai',
  Красноярский: 'ru-krasnoyarsk-krai',
  Курганская: 'ru-kurgan-oblast',
  Курская: 'ru-kursk-oblast',
  Ленинградская: 'ru-leningrad-oblast',
  Липецкая: 'ru-lipetsk-oblast',
  Московская: 'ru-moscow-oblast',
  Мурманская: 'ru-murmansk-oblast',
  Нижегородская: 'ru-nizhny-novgorod-oblast',
  Новгородская: 'ru-novgorod-oblast',
  Новосибирская: 'ru-novosibirsk-oblast',
  Омская: 'ru-omsk-oblast',
  Оренбургская: 'ru-orenburg-oblast',
  Орловская: 'ru-oryol-oblast',
  Пензенская: 'ru-penza-oblast',
  Пермский: 'ru-perm-krai',
  // «Приморск» near Berdyansk ≠ Приморский край — only full «край» forms.
  'Приморский край': 'ru-primorsky-krai',
  Псковская: 'ru-pskov-oblast',
  Ростовская: 'ru-rostov-oblast',
  Рязанская: 'ru-ryazan-oblast',
  Самарская: 'ru-samara-oblast',
  Саратовская: 'ru-saratov-oblast',
  Сахалинская: 'ru-sakhalin-oblast',
  Свердловская: 'ru-sverdlovsk-oblast',
  Смоленская: 'ru-smolensk-oblast',
  Ставропольский: 'ru-stavropol-krai',
  Тамбовская: 'ru-tambov-oblast',
  Тверская: 'ru-tver-oblast',
  Томская: 'ru-tomsk-oblast',
  Тульская: 'ru-tula-oblast',
  Тюменская: 'ru-tyumen-oblast',
  Ульяновская: 'ru-ulyanovsk-oblast',
  Хабаровский: 'ru-khabarovsk-krai',
  Челябинская: 'ru-chelyabinsk-oblast',
  Ярославская: 'ru-yaroslavl-oblast',
  Амурская: 'ru-amur-oblast',
  Архангельская: 'ru-arkhangelsk-oblast',
  Астраханская: 'ru-astrakhan-oblast',
  Магаданская: 'ru-magadan-oblast',
  Алтайский: 'ru-altai-krai',
  Забайкальский: 'ru-zabaykalsky-krai',
  Камчатский: 'ru-kamchatka-krai',
}

/** Occupied UA regions as labeled in RU channels («… область РФ»). Keys = oblasts.geojson. */
const TOT_NAME_TO_KEY = {
  'Запорожская область': 'запорізька',
  Запорожская: 'запорізька',
  'Запорізька область': 'запорізька',
  'Херсонская область': 'херсонська',
  Херсонская: 'херсонська',
  'Донецкая область': 'донецька',
  Донецкая: 'донецька',
  ДНР: 'донецька',
  'Луганская область': 'луганська',
  Луганская: 'луганська',
  ЛНР: 'луганська',
  Крым: 'автономна республіка крим',
  'Республика Крым': 'автономна республіка крим',
  'АР Крым': 'автономна республіка крим',
  Севастополь: 'севастополь',
}

const TOT_KEY_TO_NAME = {
  запорізька: 'Запорожская область (ТОТ)',
  херсонська: 'Херсонская область (ТОТ)',
  донецька: 'Донецкая область (ТОТ)',
  луганська: 'Луганская область (ТОТ)',
  'автономна республіка крим': 'Крым (ТОТ)',
  севастополь: 'Севастополь (ТОТ)',
}

const KEY_TO_NAME = {
  ...Object.fromEntries(Object.entries(NAME_TO_KEY).map(([name, key]) => [key, name])),
  ...TOT_KEY_TO_NAME,
}

const LAYER_BY_KEY = Object.fromEntries([
  ...Object.values(NAME_TO_KEY).map((k) => [k, 'ru']),
  ...Object.values(TOT_NAME_TO_KEY).map((k) => [k, 'ua-tot']),
])

/** Case-flexible regex: Брянская/Брянской области, Краснодарский/Краснодарского края… */
function flexLabelRe(label) {
  let s = escapeRe(label)
  const reps = [
    [/ская\s+область/gi, 'ск(?:ая|ой|ую)\\s+област(?:ь|и)'],
    [/ский\s+край/gi, 'ск(?:ий|ого|ом)\\s+кра(?:й|я|е)'],
    [/ская/gi, 'ск(?:ая|ой|ую|ие)'],
    [/ский/gi, 'ск(?:ий|ого|ом|им|ие)'],
    [/ая\s+область/gi, '(?:ая|ой|ую)\\s+област(?:ь|и)'],
  ]
  for (const [re, to] of reps) s = s.replace(re, to)
  // Short names (Тыва, Коми…) — avoid substring hits inside «только/поддержке».
  if (label.length <= 6 && !/\s/.test(label)) {
    s = `(?<![\\p{L}\\p{N}])(?:${s})(?![\\p{L}\\p{N}])`
    return new RegExp(s, 'iu')
  }
  return new RegExp(s, 'i')
}

/** Longest-first matchers */
const MATCHERS = [
  ...Object.entries({ ...NAME_TO_KEY, ...EXTRA_ALIASES, ...TOT_NAME_TO_KEY }),
]
  .map(([label, key]) => ({ label, key, re: flexLabelRe(label) }))
  .sort((a, b) => b.label.length - a.label.length)

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim()
}

function kindsFromText(text) {
  const t = text.toLowerCase()
  const kinds = []
  if (/бпла|беспилот|дрон|шахед|shahed|гербер/i.test(t)) kinds.push('bpla')
  if (/баллист/i.test(t)) kinds.push('ballistic')
  if (/ракет/i.test(t)) kinds.push('rocket')
  if (/авиац|самол[её]т/i.test(t)) kinds.push('aviation')
  if (/арт|fpv|обстрел/i.test(t)) kinds.push('shelling')
  return kinds.length ? kinds : ['bpla']
}

/** Keys in first-mention order (longest matchers claim ranges first). */
function extractKeys(text) {
  const hits = []
  const usedKeys = new Set()
  const ranges = []
  for (const m of MATCHERS) {
    if (usedKeys.has(m.key)) continue
    const match = m.re.exec(text)
    m.re.lastIndex = 0
    if (!match || match.index == null) continue
    const start = match.index
    const end = start + match[0].length
    if (ranges.some(([s, e]) => start < e && end > s)) continue
    usedKeys.add(m.key)
    ranges.push([start, end])
    hits.push({ key: m.key, index: start })
  }
  hits.sort((a, b) => a.index - b.index)
  return hits.map((h) => h.key)
}

/** Compass cue → degrees clockwise from north (MapLibre icon-rotate). */
function bearingFromText(text) {
  const rules = [
    [/северо[-\s]?восточ|на\s+северо[-\s]?восток/i, 45],
    [/северо[-\s]?западн|на\s+северо[-\s]?запад/i, 315],
    [/юго[-\s]?восточ|на\s+юго[-\s]?восток/i, 135],
    [/юго[-\s]?западн|на\s+юго[-\s]?запад/i, 225],
    [/(?:^|[^\p{L}])на\s+север(?![о\p{L}])/iu, 0],
    [/(?:^|[^\p{L}])на\s+юг(?![о\p{L}])/iu, 180],
    [/(?:^|[^\p{L}])на\s+восток(?!\p{L})/iu, 90],
    [/(?:^|[^\p{L}])на\s+запад(?!\p{L})/iu, 270],
    [/курс\s+на\s+север(?![о\p{L}])/iu, 0],
    [/курс\s+на\s+юг(?![о\p{L}])/iu, 180],
    [/курс\s+на\s+восток/iu, 90],
    [/курс\s+на\s+запад/iu, 270],
  ]
  for (const [re, deg] of rules) {
    if (re.test(text)) return deg
  }
  return null
}

/** Max gap between sequential oblast activations to form a cascade corridor. */
const CASCADE_WINDOW_MS = 45 * 60_000

/** Project a point along a compass bearing (approx km). */
function destPoint(lat, lon, bearingDeg, km) {
  const R = 6371
  const δ = km / R
  const θ = (bearingDeg * Math.PI) / 180
  const φ1 = (lat * Math.PI) / 180
  const λ1 = (lon * Math.PI) / 180
  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ),
  )
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2),
    )
  return {
    lat: (φ2 * 180) / Math.PI,
    lon: ((((λ2 * 180) / Math.PI + 540) % 360) - 180),
  }
}

/**
 * Build ordered waypoints from geocoded places; if one place + bearing, extend ~45 km.
 * @returns {{ lat: number, lon: number, place?: string }[]}
 */
function pointsFromPlaces(places, bearingDeg) {
  if (!places?.length) return []
  const pts = places.map((p) => ({
    lat: p.lat,
    lon: p.lon,
    place: p.place,
  }))
  if (pts.length === 1 && bearingDeg != null && Number.isFinite(bearingDeg)) {
    const tip = destPoint(pts[0].lat, pts[0].lon, bearingDeg, 45)
    pts.push({ lat: tip.lat, lon: tip.lon })
  }
  return pts
}

function isCancel(text) {
  return /отбой/i.test(text)
}

/** MoD night tallies — list many oblasts but are not live alerts. */
function isRetrospective(text) {
  return /уничтож|перехвачен|в течение прошедш|за прошедш|дежурными силами|силами пво было/i.test(
    text,
  )
}

function isThreatCue(text) {
  return /опасност|угроз|тревог|фиксац|прол[её]т|бпла|беспилот|ракет|баллист|авиац|сохраняется|направление/i.test(
    text,
  )
}

function isNoise(text) {
  const t = text.trim()
  if (t.length < 3) return true
  if (/^(📡|♥|подпис|реклам|donat|донат)/i.test(t)) return true
  if (/поддержк|поддержите|cloudtips|donate|реквизит|подписчик/i.test(t) && !isThreatCue(text)) {
    return true
  }
  if (/локатор россии|купол россии|vrv|треугольник/i.test(t) && extractKeys(t).length === 0) {
    return true
  }
  return false
}

/**
 * @param {{ channel: string, at: string | null, text: string }[]} messages
 * @param {Array<{ name: string, lat: number, lon: number }> | null} [placeIndex]
 * @returns {{
 *   alerts: { key: string, name: string, level: 'danger', kinds: string[], layer: 'ru' | 'ua-tot', bearingDeg?: number | null, activatedAt?: string | null }[],
 *   trajectories: { id: string, keys: string[], points: { lat: number, lon: number, place?: string }[], bearingDeg?: number | null, source: 'message' | 'cascade' | 'place' }[],
 * }}
 */
export function reduceTgMessagesToAlerts(messages, placeIndex = null) {
  const active = new Map()
  /** @type {{ id: string, keys: string[], points: { lat: number, lon: number, place?: string }[], bearingDeg: number | null, source: 'message' | 'place' }[]} */
  const msgTrajectories = []
  /** Place fixes kept while their oblast is still active (for cascade stitching). */
  const placeFixes = []
  const ordered = [...messages].sort((a, b) =>
    String(a.at ?? '').localeCompare(String(b.at ?? '')),
  )

  for (const msg of ordered) {
    const text = msg.text
    if (!text || isNoise(text)) continue
    const keys = extractKeys(text)
    if (!keys.length) continue
    const kinds = kindsFromText(text)
    if (isCancel(text)) {
      for (const key of keys) active.delete(key)
      continue
    }
    // Skip MoD "235 UAVs destroyed over …" digests — not a fresh alert set.
    if (isRetrospective(text)) continue
    // Bare oblast name lists (common after «отбой») must not re-arm the alert.
    // Real alerts always carry a cue: опасность / фиксации / пролёт / БПЛА…
    if (!isThreatCue(text)) continue

    const bearingDeg = bearingFromText(text)
    const at = msg.at ?? null
    const ts = at ? Date.parse(at) : NaN
    const places = placeIndex ? extractPlacesFromText(text, placeIndex) : []
    const points = pointsFromPlaces(places, bearingDeg)

    for (const key of keys) {
      const prev = active.get(key)
      active.set(key, {
        key,
        name: KEY_TO_NAME[key] ?? key,
        level: 'danger',
        kinds: [...new Set([...(prev?.kinds ?? []), ...kinds])],
        layer: LAYER_BY_KEY[key] === 'ua-tot' ? 'ua-tot' : 'ru',
        bearingDeg: bearingDeg ?? prev?.bearingDeg ?? null,
        activatedAt: prev?.activatedAt ?? at,
        activatedTs: Number.isFinite(prev?.activatedTs)
          ? prev.activatedTs
          : Number.isFinite(ts)
            ? ts
            : Date.now(),
      })
    }

    if (points.length) {
      for (const p of points) {
        if (p.place) {
          placeFixes.push({
            ...p,
            keys: [...keys],
            ts: Number.isFinite(ts) ? ts : Date.now(),
            bearingDeg,
          })
        }
      }
    }

    // Multi-oblast corridor and/or place-level track (≥2 waypoints).
    // Skip lone single-point fixes — they flood the map with dots/tips.
    if (points.length >= 2 || (keys.length >= 2 && points.length === 0)) {
      msgTrajectories.push({
        id: `msg-${msg.channel}-${at ?? msgTrajectories.length}-${keys.join('>')}`,
        keys: [...keys],
        points,
        bearingDeg,
        source: points.length >= 2 ? 'place' : 'message',
      })
    }
  }

  const activeKeys = new Set(active.keys())
  const trajectories = []
  const seenChain = new Set()

  for (const t of msgTrajectories) {
    const live = t.keys.filter((k) => activeKeys.has(k))
    if (!live.length) continue
    // Keep place tracks even for a single live oblast; multi-key needs ≥2 live.
    if (t.points.length < 2 && live.length < 2) continue
    const sig = `${live.join('>')}|${t.points.map((p) => `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`).join('>')}`
    if (seenChain.has(sig)) continue
    seenChain.add(sig)
    trajectories.push({
      id: t.id,
      keys: live,
      points: t.points,
      bearingDeg: t.bearingDeg,
      source: t.source,
    })
  }

  // One short place-chain from the latest fixes (avoid stitching the whole night).
  const liveFixes = placeFixes
    .filter((f) => f.keys.some((k) => activeKeys.has(k)))
    .sort((a, b) => a.ts - b.ts)
  if (liveFixes.length >= 2) {
    const recent = liveFixes.slice(-4)
    const points = []
    for (const f of recent) {
      const same = points.some(
        (p) => Math.abs(p.lat - f.lat) < 0.05 && Math.abs(p.lon - f.lon) < 0.05,
      )
      if (!same) points.push({ lat: f.lat, lon: f.lon, place: f.place })
    }
    if (points.length >= 2) {
      const keys = [
        ...new Set(recent.flatMap((c) => c.keys).filter((k) => activeKeys.has(k))),
      ]
      const sig = `fixchain|${points.map((p) => `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`).join('>')}`
      if (!seenChain.has(sig)) {
        seenChain.add(sig)
        trajectories.push({
          id: sig,
          keys,
          points,
          bearingDeg: recent[recent.length - 1].bearingDeg ?? null,
          source: 'place',
        })
      }
    }
  }

  // Pairwise cascade only when we still have almost no place corridors.
  const placeCount = trajectories.filter((t) => (t.points?.length ?? 0) >= 2).length
  if (placeCount < 3) {
    const byTime = [...active.values()]
      .filter((a) => Number.isFinite(a.activatedTs) && a.key.startsWith('ru-'))
      .sort((a, b) => a.activatedTs - b.activatedTs || a.key.localeCompare(b.key))

    for (let i = 1; i < byTime.length; i++) {
      const prev = byTime[i - 1]
      const next = byTime[i]
      const dt = next.activatedTs - prev.activatedTs
      if (dt <= 0 || dt > CASCADE_WINDOW_MS) continue
      const pair = [prev.key, next.key]
      const sig = pair.join('>')
      if (seenChain.has(sig)) continue
      const coveredByMsg = trajectories.some((t) => {
        const ia = t.keys.indexOf(prev.key)
        const ib = t.keys.indexOf(next.key)
        return ia >= 0 && ib > ia
      })
      if (coveredByMsg) continue
      seenChain.add(sig)
      trajectories.push({
        id: `cascade-${sig}`,
        keys: pair,
        points: [],
        bearingDeg: next.bearingDeg ?? prev.bearingDeg ?? null,
        source: 'cascade',
      })
    }
  }

  const alerts = [...active.values()].map(
    ({ activatedTs: _ts, ...rest }) => rest,
  )

  return { alerts, trajectories }
}

const TG_HEADERS = {
  Accept: 'text/html',
  'User-Agent': 'alert-tracker/1.0 (+https://github.com/Azerorh/alert-tracker)',
}

/** How far back to walk t.me/s pages (NAHR keeps state; preview is only ~20 msgs). */
const TG_MAX_PAGES = 6
const TG_MAX_AGE_MS = 8 * 60 * 60_000

function parseMessagesFromHtml(channelId, html) {
  const blocks = html.split('tgme_widget_message_wrap')
  const msgs = []
  for (const b of blocks.slice(1)) {
    const textMatch = b.match(/tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/)
    const dateMatch = b.match(/datetime="([^"]+)"/)
    if (!textMatch) continue
    msgs.push({
      channel: channelId,
      at: dateMatch?.[1] ?? null,
      text: stripHtml(textMatch[1]),
    })
  }
  const before =
    html.match(/href="\/s\/[^"?]+\/?[^"]*\?before=(\d+)"/)?.[1] ??
    html.match(/\?before=(\d+)/)?.[1] ??
    null
  return { msgs, before }
}

async function fetchChannelMessages(channelId) {
  const msgs = []
  const seen = new Set()
  let before = null
  const cutoff = Date.now() - TG_MAX_AGE_MS

  for (let page = 0; page < TG_MAX_PAGES; page++) {
    const url = before
      ? `https://t.me/s/${channelId}?before=${before}`
      : `https://t.me/s/${channelId}`
    const res = await fetch(url, { headers: TG_HEADERS })
    if (!res.ok) throw new Error(`t.me/s/${channelId} HTTP ${res.status}`)
    const html = await res.text()
    const parsed = parseMessagesFromHtml(channelId, html)
    let oldest = Date.now()
    for (const m of parsed.msgs) {
      const id = `${m.channel}|${m.at}|${m.text.slice(0, 80)}`
      if (seen.has(id)) continue
      seen.add(id)
      msgs.push(m)
      const ts = m.at ? Date.parse(m.at) : NaN
      if (Number.isFinite(ts) && ts < oldest) oldest = ts
    }
    if (!parsed.before || parsed.before === before) break
    before = parsed.before
    if (oldest < cutoff) break
  }
  return msgs
}

/** Live pull of NAHR-cited Telegram channels → active RU oblast alerts. */
export async function fetchNahrStyleRuAlerts() {
  const batches = await Promise.allSettled(
    NAHR_TG_CHANNELS.map((c) => fetchChannelMessages(c.id)),
  )
  const messages = []
  const errors = []
  for (let i = 0; i < batches.length; i++) {
    const b = batches[i]
    if (b.status === 'fulfilled') messages.push(...b.value)
    else errors.push(`${NAHR_TG_CHANNELS[i].id}: ${b.reason}`)
  }
  if (!messages.length) {
    throw new Error(`RU TG alerts failed: ${errors.join('; ') || 'empty'}`)
  }
  let placeIndex = null
  try {
    placeIndex = await loadPlaceIndex()
  } catch (err) {
    errors.push(`gazetteer: ${err}`)
  }
  const { alerts, trajectories } = reduceTgMessagesToAlerts(messages, placeIndex)
  return {
    alerts,
    trajectories,
    sources: NAHR_TG_CHANNELS,
    messageCount: messages.length,
    errors,
  }
}
