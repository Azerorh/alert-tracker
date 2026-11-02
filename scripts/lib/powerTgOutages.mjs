/**
 * Emergency / irregular power outages from official Telegram channels (t.me/s).
 * Complements schedule polygons — markers only, not street-level truth.
 */

import {
  extractPlaceFromText,
  extractPlacesFromText,
  loadPlaceIndex,
} from './placeGazetteer.mjs'

export const POWER_TG_CHANNELS = [
  { id: 'dtek_ua', label: 'ДТЕК', url: 'https://t.me/dtek_ua' },
  { id: 'DTEKKyivElectricNetworks', label: 'ДТЕК Київ', url: 'https://t.me/DTEKKyivElectricNetworks' },
  { id: 'DTEKKRE', label: 'ДТЕК Київщина', url: 'https://t.me/DTEKKRE' },
  { id: 'dtek_dnipro', label: 'ДТЕК Дніпро', url: 'https://t.me/dtek_dnipro' },
  { id: 'dtek_odesa', label: 'ДТЕК Одеса', url: 'https://t.me/dtek_odesa' },
]

/** Keep recent emergency mentions. */
export const POWER_TG_MAX_AGE_MS = 36 * 60 * 60_000
export const POWER_TG_WINDOW_HOURS = 36

const TG_HEADERS = {
  Accept: 'text/html,application/xhtml+xml',
  'User-Agent': 'alert-tracker/1.0 (+https://github.com/Azerorh/alert-tracker)',
}
const TG_MAX_PAGES = 6
const MAX_PLACES_PER_POST = 5

/** Restoration / back-to-schedule — not an active emergency marker. */
const RESTORE_CUE =
  /повернули\s+світл|скасован.{0,24}екстрен|екстрен.{0,36}скасован|повертаємось\s+до.{0,24}графік|відновлен.{0,20}(?:електро|живлен|постачан)/i

/** Strong emergency / irregular outage cues. */
const EMERGENCY_CUE =
  /екстрен|екстрені|аварійн|знеструм|без\s+світл|відсутн\w*\s+електро|відключен\w*\s+(?:через|внаслідок|після)|тимчасов\w*\s+відключен|масов\w*\s+відключен|не\s+діють\s+графік|поза\s+графік|аварі[їя]|пошкоджен\w*\s+(?:мереж|ліні|енерго)|негод|обстріл\w*.{0,40}(?:світл|електро|мереж)|атак\w*.{0,40}(?:світл|електро|мереж|відключен)/i

/** Pure schedule announcements — skip unless emergency cue also present. */
const SCHEDULE_ONLY =
  /графік(?:и|ів|у)?\s+відключен|графік(?:и)?\s+на\s+\d|тимчасов\w*\s+графік(?:и)?\s+на\s+завтра|погодинн\w*\s+графік|ГПВ|черг[аи]\s+\d/i

/** Region / city aliases → approximate map points (oblast or city center). */
const REGION_HINTS = [
  { re: /київськ(?:а|ій|ої)?\s+област|київщин/i, place: 'київська область', lat: 50.45, lon: 30.52, bump: [0.35, 0.15] },
  { re: /\bкиїв\b|столиц/i, place: 'київ', lat: 50.4501, lon: 30.5234 },
  { re: /одеськ(?:а|ій|ої)?\s+област|одещин/i, place: 'одеська область', lat: 46.48, lon: 30.73 },
  { re: /\bодес[аи]\b/i, place: 'одеса', lat: 46.4825, lon: 30.7233 },
  { re: /дніпропетровськ|дніпровщин/i, place: 'дніпропетровська область', lat: 48.46, lon: 35.05 },
  { re: /\bдніпр[оа]\b/i, place: 'дніпро', lat: 48.4647, lon: 35.0462 },
  { re: /донецьк(?:а|ій|ої)?\s+област|донеччин/i, place: 'донецька область', lat: 48.0, lon: 37.8 },
  { re: /харківськ|харківщин/i, place: 'харків', lat: 49.9935, lon: 36.2304 },
  { re: /львівськ|львівщин/i, place: 'львів', lat: 49.8397, lon: 24.0297 },
  { re: /запорізьк|запоріжж/i, place: 'запоріжжя', lat: 47.8388, lon: 35.1396 },
  { re: /микола[їі]в/i, place: 'миколаїв', lat: 46.975, lon: 31.9946 },
  { re: /полтав/i, place: 'полтава', lat: 49.5883, lon: 34.5514 },
  { re: /сумськ|\bсуми\b/i, place: 'суми', lat: 50.9077, lon: 34.7981 },
  { re: /чернігів/i, place: 'чернігів', lat: 51.4982, lon: 31.2893 },
  { re: /черкас/i, place: 'черкаси', lat: 49.4444, lon: 32.0598 },
  { re: /житомир/i, place: 'житомир', lat: 50.2547, lon: 28.6587 },
  { re: /вінниц/i, place: 'вінниця', lat: 49.2331, lon: 28.4682 },
  { re: /хмельниц/i, place: 'хмельницький', lat: 49.4229, lon: 26.9871 },
  { re: /рівн/i, place: 'рівне', lat: 50.6199, lon: 26.2516 },
  { re: /волин/i, place: 'луцьк', lat: 50.7472, lon: 25.3254 },
  { re: /івано-?франків|прикарпатт/i, place: 'івано-франківськ', lat: 48.9226, lon: 24.7111 },
  { re: /тернопіль/i, place: 'тернопіль', lat: 49.5535, lon: 25.5948 },
  { re: /закарпат/i, place: 'ужгород', lat: 48.6208, lon: 22.2879 },
  { re: /чернівец|буковин/i, place: 'чернівці', lat: 48.2917, lon: 25.9352 },
  { re: /кіровоград|кропивниц/i, place: 'кропивницький', lat: 48.5079, lon: 32.2623 },
]

/** Kyiv city districts → approximate centroids. */
const KYIV_DISTRICTS = [
  { re: /голь?осі[їі]вськ/i, place: 'голосіївський район', lat: 50.383, lon: 30.505 },
  { re: /дарницьк/i, place: 'дарницький район', lat: 50.407, lon: 30.655 },
  { re: /деснянськ/i, place: 'деснянський район', lat: 50.51, lon: 30.6 },
  { re: /дніпровськ(?:ий|ого)?\s+район|лівобереж/i, place: 'дніпровський район', lat: 50.47, lon: 30.61 },
  { re: /оболонськ/i, place: 'оболонський район', lat: 50.52, lon: 30.5 },
  { re: /печерськ/i, place: 'печерський район', lat: 50.427, lon: 30.538 },
  { re: /подільськ/i, place: 'подільський район', lat: 50.468, lon: 30.48 },
  { re: /святошинськ/i, place: 'святошинський район', lat: 50.457, lon: 30.365 },
  { re: /соломенськ|соломянськ/i, place: 'соломянський район', lat: 50.43, lon: 30.45 },
  { re: /шевченківськ/i, place: 'шевченківський район', lat: 50.46, lon: 30.48 },
  { re: /тро[єе]щин/i, place: 'троєщина', lat: 50.51, lon: 30.61 },
  { re: /лівий\s+берег|лівобережж/i, place: 'лівий берег києва', lat: 50.47, lon: 30.62 },
  { re: /правий\s+берег|правобережж/i, place: 'правий берег києва', lat: 50.45, lon: 30.48 },
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

function channelMeta(channelId) {
  return POWER_TG_CHANNELS.find((c) => c.id === channelId) ?? null
}

function isEmergencyOutageText(text) {
  if (!text || text.length < 40) return false
  if (RESTORE_CUE.test(text) && !/тривають\s+екстрен|досі\s+без\s+світл|ще\s+знеструм/i.test(text)) {
    return false
  }
  if (!EMERGENCY_CUE.test(text)) return false
  // Allow schedule wording if emergency cue is present (DTEK often mixes both).
  if (SCHEDULE_ONLY.test(text) && !/екстрен|аварійн|знеструм|пошкоджен|атак|обстріл|негод/i.test(text)) {
    return false
  }
  return true
}

function summarize(text) {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length > 220 ? `${one.slice(0, 217)}…` : one
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
  const cutoff = Date.now() - POWER_TG_MAX_AGE_MS

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

function collectGeos(text, index) {
  const geos = []
  const seen = new Set()
  const push = (g) => {
    if (!g || !Number.isFinite(g.lat) || !Number.isFinite(g.lon)) return
    const key = `${g.lat.toFixed(3)},${g.lon.toFixed(3)}`
    if (seen.has(key)) return
    seen.add(key)
    geos.push(g)
  }

  for (const d of KYIV_DISTRICTS) {
    if (d.re.test(text)) {
      push({ lat: d.lat, lon: d.lon, precision: 'district', place: d.place })
    }
  }

  for (const hit of extractPlacesFromText(text, index)) {
    push(hit)
  }

  if (!geos.length) {
    for (const r of REGION_HINTS) {
      if (!r.re.test(text)) continue
      const lat = r.lat + (r.bump?.[0] ?? 0)
      const lon = r.lon + (r.bump?.[1] ?? 0)
      push({ lat, lon, precision: 'region', place: r.place })
      break
    }
  }

  // Last resort: single gazetteer hit on shortened text.
  if (!geos.length) {
    const one = extractPlaceFromText(text.slice(0, 280), index)
    push(one)
  }

  return geos.slice(0, MAX_PLACES_PER_POST)
}

function messageToMarkers(m, now, index) {
  const ts = m.at ? Date.parse(m.at) : NaN
  if (!Number.isFinite(ts) || now - ts > POWER_TG_MAX_AGE_MS || ts > now + 60_000) {
    return []
  }
  if (!isEmergencyOutageText(m.text)) return []
  const meta = channelMeta(m.channel)
  const geos = collectGeos(m.text, index)
  if (!geos.length) return []

  return geos.map((geo, i) => ({
    id: `ptg-${m.channel}-${ts}-${geo.lat.toFixed(4)}-${geo.lon.toFixed(4)}-${i}`,
    lat: geo.lat,
    lon: geo.lon,
    place: geo.place ?? null,
    precision: geo.precision ?? 'place',
    at: new Date(ts).toISOString(),
    channelId: m.channel,
    channelLabel: meta?.label ?? m.channel,
    channelUrl: meta?.url ?? `https://t.me/${m.channel}`,
    postUrl: m.postUrl,
    summary: summarize(m.text),
  }))
}

export async function fetchPowerTgOutages() {
  const now = Date.now()
  const index = await loadPlaceIndex()
  const sources = []
  const errors = []
  const markers = []
  let messageCount = 0
  const byChannel = {}

  for (const ch of POWER_TG_CHANNELS) {
    try {
      const msgs = await fetchChannelMessages(ch.id)
      messageCount += msgs.length
      let n = 0
      for (const m of msgs) {
        const rows = messageToMarkers(m, now, index)
        n += rows.length
        markers.push(...rows)
      }
      byChannel[ch.id] = n
      sources.push({ id: ch.id, label: ch.label, url: ch.url, ok: true, markers: n })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`${ch.id}: ${msg}`)
      sources.push({ id: ch.id, label: ch.label, url: ch.url, ok: false, markers: 0 })
      byChannel[ch.id] = 0
    }
  }

  // Dedupe near-identical points from same channel+hour.
  const deduped = []
  const seen = new Set()
  for (const m of markers.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))) {
    const key = `${m.channelId}|${m.lat.toFixed(3)}|${m.lon.toFixed(3)}|${m.at.slice(0, 13)}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(m)
  }

  return {
    windowHours: POWER_TG_WINDOW_HOURS,
    sources,
    messageCount,
    errors,
    byChannel,
    markers: deduped,
  }
}
