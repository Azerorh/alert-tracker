/**
 * Active RF ground sightings from a Telegram allowlist.
 * Markers = geolocated RF kit / troops (NOT AFU, NOT pure air/strike noise).
 */

import {
  extractPlaceFromText,
  inBounds,
  loadPlaceIndex,
} from './placeGazetteer.mjs'

export const RF_SIGHTING_CHANNELS = [
  { id: 'DeepStateUA', label: 'DeepState', url: 'https://t.me/DeepStateUA', mode: 'places' },
  { id: 'WeebUnionWar', label: 'WeebUnion', url: 'https://t.me/WeebUnionWar', mode: 'coords' },
  { id: 'exilenova_plus', label: 'ExileNova+', url: 'https://t.me/exilenova_plus', mode: 'coords' },
  { id: 'supernova_plus', label: 'Supernova+', url: 'https://t.me/supernova_plus', mode: 'coords' },
  { id: 'militarylandnet', label: 'MilitaryLand', url: 'https://t.me/militarylandnet', mode: 'coords' },
  { id: 'geoconfirmed', label: 'GeoConfirmed', url: 'https://t.me/geoconfirmed', mode: 'coords' },
  { id: 'war_monitor', label: 'War Monitor', url: 'https://t.me/war_monitor', mode: 'coords' },
  { id: 'PlayfraOSINT', label: 'PlayfraOSINT', url: 'https://t.me/PlayfraOSINT', mode: 'coords' },
  { id: 'NOELreports', label: 'NOEL', url: 'https://t.me/NOELreports', mode: 'coords' },
  { id: 'osinttechnical', label: 'OSINTtechnical', url: 'https://t.me/osinttechnical', mode: 'coords' },
]

/** Active sightings window. */
export const SIGHTING_MAX_AGE_MS = 7 * 24 * 60 * 60_000
export const SIGHTING_WINDOW_HOURS = 24 * 7

const TG_HEADERS = {
  Accept: 'text/html,application/xhtml+xml',
  'User-Agent': 'alert-tracker/1.0 (+https://github.com/Azerorh/alert-tracker)',
}
const TG_MAX_PAGES = 10
/** Cap place-geocoded markers per post (DeepState multi-settlement). */
const MAX_PLACES_PER_POST = 6

/** RF force / kit / troops context. */
const RF_CUE =
  /танк|т-7[2-9]|т-90|t-7[2-9]|t-90|бмп|бтр|мт-?лб|бмд|тигр|урал-?\d|камаз|град|смерч|ураган|гаубиц|сау|рсзв|ппо|панцир|тор-м|бук-|окупант|оккуп|рашист|оркі|оркы|рос(?:ій|ий|сіян)|russian|#ru\b|вс\s*рф|всрф|ворог|окупац|bmp-\d|btr-\d|mt-?lb|колон|піхот|штурм|морпіх|десант|підрозділ|бригад|полк\b|батальйон|рота\b|regiment|brigade|infantry|marines|armor|armou?r|vehicle|технічк|технік[аи]|войск|військ|occup/i

/** Ground kit specifically (vs pure air). */
const GROUND_KIT =
  /танк|т-7[2-9]|т-90|t-7[2-9]|t-90|бмп|бтр|мт-?лб|бмд|тигр|урал|камаз|град|смерч|ураган|гаубиц|сау|рсзв|ппо|панцир|тор-м|бук|bmp|btr|mt-?lb|колон|артилер|мста|піхот|штурм|морпіх|десант|підрозділ|бригад|полк|батальйон|infantry|armor|armou?r|mrap|howitz|mlrs|sam\b|radar|jammer|реб|інженер/i

/** Active presence / movement / map update. */
const ACTIVE_CUE =
  /колон|висун|выдвин|руха|движ|помічен|замечен|фіксу|фиксир|позиці|позици|просун|продвин|зайнял|занял|скупчен|скоплен|накопич|розгорт|разверт|направлен|утриму|удерж|контрол|флаг|#ru\b|поблизу|біля\s|возле|наблюд|спостер|район\s|мапу\s+оновлено|мапа\s+оновлен|карту?\s+оновлен|технік[аи]\s+рф|техник[аи]\s+рф|equipment|geolocat|геоприв|на\s+мапі|на\s+карте|координат|sighting|presence|deploy|armor|armou?r|vehicle|танк[иі]?\s+(?:рф|рос)|бмп-?\d|бтр-?\d|confirmed|верифік|верифик|просуван|продвижен|займає|занимает|україн\w*\s+напрям|на\s+напрямк|infiltrat|просочив|рубіж|важк\w*\s+технік|рос(?:ійськ|ийск)\w*\s+технік/i

/** Destroyed language — still useful as recent RF kit location if RF subject. */
const DESTROYED_CUE =
  /знищ|уничт|підбит|подбит|destroyed|згоріл|сгорел|трофе|втрат\w*\s+техн|кадри\s+знищення|was\s+destroyed|hit\s+by/i

const AFU_POSITION =
  /(?:^|[\s,.;:])(?:наша|наші|наш)\s+(?:технік|танк|бмп|бтр|позиці|колон|блокпост|підрозділ)|зсу\s+(?:зайнял|висун|утриму|займає|закріп|просун)|(?:зайняли|висунулися|висунулись)\s+на\s+(?:позиц|рубіж)|(?:наш|наша)\s+бригад|всу\s+(?:занял|выдвин|продвин)|#ua\b/i

const AFU_KIT =
  /(?:^|[^\p{L}\p{N}])(?:всу|зсу)(?=[^\p{L}\p{N}]|$)|українськ(?:а|і|ої)?\s+(?:технік|танк|бмп|бтр)|украинск(?:ая|ие|ой)?\s+(?:техник|танк|бмп|бтр)|бтр-3|бмп-1у|leopard|challenger|abrams|bradley|\bm113\b|м113|kozak|козак-?\d|ukrainian\s+armed|ukrainian\s+tank|ukrainian\s+bmp/iu

const AIR_ONLY =
  /самол[её]т|истребител|бомбардировщик|вертол[её]т|helicopter|airplane|\bсу-\d|\bмиг-|\bміг-|\bту-\d|\bил-\d|ка-52|бпла|дрон-камікадзе|shahed|геран|ракетн|крилат|балістич|kinzhal|iskin|ціл[еє]р\s+ракет/i

/** Civilian strike / city hit — not RF troop/kit markers. */
const STRIKE_NOISE =
  /прильот|прилет|удар\s+по\s+(?:міст|город|місту|цивіл|житл|школ|лікарн)|влучанн\w*\s+у\s+(?:будин|школ|лікарн)|civilian\s+casualt|killed\s+civilians?|обстріл\s+міста/i

const CATEGORY_RULES = [
  { key: 'tanks', re: /танк|т-7[2-9]|т-90|t-7[2-9]|t-90/i },
  { key: 'ifv', re: /бмп|бмд|bmp|bmd/i },
  { key: 'apc', re: /бтр|мт-?лб|mrap|btr|mt-?lb|тигр/i },
  { key: 'artillery', re: /гаубиц|сау|рсзв|град|смерч|ураган|мста|гіацинт|артилер/i },
  { key: 'airdef', re: /ппо|тор-м|панцир|бук|buk|с-300|с-400|реле|реб|radar|jammer/i },
  { key: 'trucks', re: /урал|камаз|kamаз|тягач|паливозаправ|бензовоз|truck|транспорт|колон/i },
]

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

function categoryFromText(text) {
  for (const rule of CATEGORY_RULES) {
    if (rule.re.test(text)) return rule.key
  }
  return 'other'
}

function channelMeta(channelId) {
  return RF_SIGHTING_CHANNELS.find((c) => c.id === channelId) ?? null
}

/** DeepState-style place candidates from advance / near phrasing. */
export function extractAdvancePlaceNames(text) {
  if (!text) return []
  const patterns = [
    /поблизу\s+([^.!?\n🗺💬🔄⚔️📍]+?)(?:\.|💬|🗺|Мапа|🛑|$)/iu,
    /біля\s+([^.!?\n🗺💬🔄⚔️📍,]{3,40}?)(?:\.|,|💬|🗺|та\s| і |$)/iu,
    /возле\s+([^.!?\n🗺💬🔄⚔️📍,]{3,40}?)(?:\.|,|💬|🗺|и\s|$)/iu,
    /(?:в\s+)?район[іу]?\s+([^.!?\n🗺💬🔄⚔️📍,]{3,40}?)(?:\.|,|💬|🗺|$)/iu,
    /(?:на\s+)?напрямк[уі]\s+([^.!?\n🗺💬🔄⚔️📍,]{3,40}?)(?:\.|,|💬|🗺|$)/iu,
    /на\s+([А-Яа-яІіЇїЄєҐґA-Za-z'\-]{4,40}?ськ\w*)\s+(?:напрямк|ділянц|фланг|осередк)/iu,
    /(?:накопичен\w*|скупчен\w*|фіксу\w*)[^.!\n]{0,40}?\s+на\s+([А-Яа-яІіЇїЄєҐґA-Za-z'\-]{4,40}?ськ\w*)/iu,
    /near\s+([A-Za-zА-Яа-яІіЇїЄєҐґ'\-\s]{3,40}?)(?:\.|,|;|💬|$)/iu,
    /around\s+([A-Za-zА-Яа-яІіЇїЄєҐґ'\-\s]{3,40}?)(?:\.|,|;|💬|$)/iu,
    /([A-Za-z][A-Za-z'\-]{2,40})\s+direction\b/i,
    /situation\s+in\s+([A-Za-z][A-Za-z'\-\s]{2,40}?)(?:\s+as\b|\.|\,|$)/i,
  ]
  const names = []
  for (const re of patterns) {
    const m = text.match(re)
    if (!m) continue
    for (const part of m[1].split(/\s*(?:та|,| і | и | and |\/)\s*/iu)) {
      const s = part
        .replace(/^[\s«»"']+|[\s«»"']+$/gu, '')
        .replace(/\s+/g, ' ')
        .trim()
      if (s.length >= 3 && s.length < 40) names.push(s)
    }
  }
  return [...new Set(names)]
}

export function extractCoords(text) {
  if (!text) return null

  const tick = text.match(/`(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)`/)
  if (tick) {
    const lat = Number(tick[1])
    const lon = Number(tick[2])
    if (Number.isFinite(lat) && Number.isFinite(lon) && inBounds(lat, lon)) {
      return { lat, lon, precision: 'coords' }
    }
  }

  const mapLink =
    text.match(
      /(?:google\.[\w.]+\/maps\?q=|maps\.google\.[\w.]+\/\?q=|maps\.app\.goo\.gl\/)(-?\d{1,2}\.\d+)[,+\s]+(-?\d{1,3}\.\d+)/i,
    ) ||
    text.match(/@(-?\d{1,2}\.\d{2,}),\s*(-?\d{1,3}\.\d{2,})/) ||
    text.match(/[?&]ll=(-?\d{1,2}\.\d+)%2C(-?\d{1,3}\.\d+)/i) ||
    text.match(/[?&]ll=(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/i) ||
    text.match(/Coordinates:\s*`?(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)`?/i) ||
    text.match(
      /(?:geo|gps|coords?|координат\w*)\s*[:=]?\s*(-?\d{1,2}\.\d+)\s*[,;\s]\s*(-?\d{1,3}\.\d+)/i,
    )

  if (mapLink) {
    const lat = Number(mapLink[1])
    const lon = Number(mapLink[2])
    if (Number.isFinite(lat) && Number.isFinite(lon) && inBounds(lat, lon)) {
      return { lat, lon, precision: 'coords' }
    }
  }

  const plain = [
    ...text.matchAll(
      /(?<![\d.])([4-5]\d\.\d{3,8})\s*[,;\s]\s*([2-4]\d\.\d{3,8})(?![\d.])/g,
    ),
  ]
  for (const m of plain) {
    const lat = Number(m[1])
    const lon = Number(m[2])
    if (Number.isFinite(lat) && Number.isFinite(lon) && inBounds(lat, lon)) {
      return { lat, lon, precision: 'coords' }
    }
  }
  return null
}

export function extractPlace(text, index) {
  return extractPlaceFromText(text, index)
}

/**
 * @param {string} text
 * @param {{ hasCoords?: boolean, mode?: string }} opts
 */
export function isAllowedActiveRfSightingText(text, opts = {}) {
  if (!text || text.length < 12) return false
  if (AFU_POSITION.test(text)) return false
  if (AFU_KIT.test(text) && !RF_CUE.test(text)) return false
  if (STRIKE_NOISE.test(text) && !GROUND_KIT.test(text)) return false
  if (AIR_ONLY.test(text) && !GROUND_KIT.test(text)) return false
  // Diplomatic / off-front noise that still mentions «росія» + a city name.
  if (/південн\w*\s+коре|south\s+korea|переговор|diplomat|санкці/i.test(text) && !GROUND_KIT.test(text)) {
    return false
  }
  if (!RF_CUE.test(text)) return false

  const hasCoords = Boolean(opts.hasCoords)
  const mode = opts.mode ?? 'coords'

  // Coords + RF context is enough for OSINT channels.
  if (hasCoords) return true

  // Destroyed RF kit with place mention still marks recent RF presence.
  if (DESTROYED_CUE.test(text) && GROUND_KIT.test(text)) return true

  if (mode === 'places') {
    // DeepState: map updates / advances without literal «колона».
    return ACTIVE_CUE.test(text) || /мап[ау]|оновлен|просуван|поблизу|зайнял/i.test(text)
  }

  // Place-only (no coords): presence cue + ground kit/troops — cuts long front analyses.
  return ACTIVE_CUE.test(text) && GROUND_KIT.test(text)
}

/** @deprecated use isAllowedActiveRfSightingText */
export function isAllowedRfSightingText(text) {
  return isAllowedActiveRfSightingText(text)
}

function parseMessagesFromHtml(channelId, html) {
  const blocks = html.split('tgme_widget_message_wrap')
  const msgs = []
  for (const b of blocks.slice(1)) {
    const textMatch = b.match(/tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/)
    const dateMatch = b.match(/datetime="([^"]+)"/)
    const linkMatch =
      b.match(/href="(https:\/\/t\.me\/[^"]+\/\d+)"/) ||
      b.match(/data-post="([^"]+)"/)
    if (!textMatch) continue
    let postUrl = null
    if (linkMatch?.[1]?.startsWith('http')) postUrl = linkMatch[1]
    else if (linkMatch?.[1]?.includes('/')) {
      postUrl = `https://t.me/${linkMatch[1]}`
    }
    msgs.push({
      channel: channelId,
      at: dateMatch?.[1] ?? null,
      text: stripHtml(textMatch[1]),
      postUrl,
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
  const cutoff = Date.now() - SIGHTING_MAX_AGE_MS

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

function summarize(text) {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length > 160 ? `${one.slice(0, 157)}…` : one
}

function resolveGeos(text, index, mode) {
  const coords = extractCoords(text)
  if (coords) return [coords]

  const geos = []
  const seen = new Set()
  const push = (g) => {
    if (!g) return
    const key = `${g.lat.toFixed(3)},${g.lon.toFixed(3)}`
    if (seen.has(key)) return
    seen.add(key)
    geos.push(g)
  }

  // Prefer explicit near/advance phrasing — avoids matching random town names in essays.
  for (const name of extractAdvancePlaceNames(text)) {
    push(extractPlaceFromText(name, index))
  }

  if (!geos.length && mode === 'places') {
    const line = text.match(
      /(?:поблизу|просун\w*|зайнял\w*)[^.!?\n🗺💬]{3,80}/iu,
    )
    if (line) push(extractPlaceFromText(line[0], index))
  } else if (!geos.length) {
    // OSINT channels: only if short / local post, not multi-paragraph analyses.
    if (text.length <= 360) push(extractPlace(text, index))
  }

  return geos.slice(0, MAX_PLACES_PER_POST)
}

function messageToSightings(m, now, index) {
  const ts = m.at ? Date.parse(m.at) : NaN
  if (!Number.isFinite(ts) || now - ts > SIGHTING_MAX_AGE_MS || ts > now + 60_000) {
    return []
  }
  const meta = channelMeta(m.channel)
  const mode = meta?.mode ?? 'coords'
  const hasCoords = Boolean(extractCoords(m.text))
  if (!isAllowedActiveRfSightingText(m.text, { hasCoords, mode })) return []
  const geos = resolveGeos(m.text, index, mode)
  if (!geos.length) return []

  return geos.map((geo) => ({
    id: `rfs-${m.channel}-${ts}-${geo.lat.toFixed(4)}-${geo.lon.toFixed(4)}`,
    lat: geo.lat,
    lon: geo.lon,
    at: new Date(ts).toISOString(),
    category: categoryFromText(m.text),
    summary: summarize(m.text),
    channelId: m.channel,
    channelLabel: meta?.label ?? m.channel,
    postUrl: m.postUrl ?? meta?.url ?? `https://t.me/${m.channel}`,
    precision: geo.precision,
    place: geo.place ?? null,
    kind: DESTROYED_CUE.test(m.text) ? 'loss_proxy' : 'active',
    side: 'rf',
  }))
}

/** Live pull → active RF ground sightings (≤7d, geolocated, AFU-safe). */
export async function fetchRfGroundSightings() {
  const index = await loadPlaceIndex()
  const batches = await Promise.allSettled(
    RF_SIGHTING_CHANNELS.map((c) => fetchChannelMessages(c.id)),
  )
  const messages = []
  const errors = []
  for (let i = 0; i < batches.length; i++) {
    const b = batches[i]
    if (b.status === 'fulfilled') messages.push(...b.value)
    else errors.push(`${RF_SIGHTING_CHANNELS[i].id}: ${b.reason}`)
  }

  const now = Date.now()
  const byId = new Map()
  const byChannel = Object.fromEntries(RF_SIGHTING_CHANNELS.map((c) => [c.id, 0]))
  for (const m of messages) {
    for (const s of messageToSightings(m, now, index)) {
      byId.set(s.id, s)
      byChannel[s.channelId] = (byChannel[s.channelId] ?? 0) + 1
    }
  }

  const sightings = [...byId.values()].sort(
    (a, b) => Date.parse(b.at) - Date.parse(a.at),
  )

  return {
    sightings,
    sources: RF_SIGHTING_CHANNELS.map(({ id, label, url }) => ({ id, label, url })),
    messageCount: messages.length,
    errors,
    byChannel,
    windowHours: SIGHTING_WINDOW_HOURS,
  }
}
