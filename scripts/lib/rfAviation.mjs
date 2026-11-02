/**
 * RF strategic / Kinzhal-carrier takeoffs from public TG → capped advisory pins.
 * Short TTL (aircraft don't stay up 5–8h). No API keys — t.me/s HTML only.
 */

export const RF_AVIATION_CHANNELS = [
  { id: 'StrategicaviationT', label: 'Стратегічна авіація', url: 'https://t.me/StrategicaviationT' },
  { id: 'mon1tor_ua', label: 'ППО радар', url: 'https://t.me/mon1tor_ua' },
  { id: 'chyste_nebo', label: 'Чисте небо', url: 'https://t.me/chyste_nebo' },
  { id: 'kudy_letyt', label: 'Ринда', url: 'https://t.me/kudy_letyt' },
  { id: 'deraketaua', label: 'Де Ракета', url: 'https://t.me/deraketaua' },
  { id: 'kupolrussia', label: 'КУПОЛ РОСІЇ', url: 'https://t.me/kupolrussia' },
  { id: 'radarrussiia', label: 'Радар по РФ', url: 'https://t.me/radarrussiia' },
]

/** Keep window for scraping pages (wider than display TTL). */
export const RF_AVIATION_SCRAPE_MS = 4 * 60 * 60_000
export const RF_AVIATION_MAX = 8

/** Display TTL by aircraft class (ms). */
export const RF_AVIATION_TTL_MS = {
  strategic: 150 * 60_000, // Tu-95 / Tu-160 ~2.5h
  mig31k: 75 * 60_000,
  fighter: 60 * 60_000,
  aviation: 90 * 60_000,
}

/** Known RF airbases relevant to UA — not filtered by UA gazetteer bounds. */
export const RF_AIRBASES = [
  {
    id: 'engels',
    names: ['енгельс', 'engels', 'энгельс', 'енгельс-2', 'engels-2'],
    lat: 51.481,
    lon: 46.21,
    label: 'Енгельс-2',
  },
  {
    id: 'olenya',
    names: ['оленья', 'olenya', 'оленегорск', 'оленегорьск', 'olenegorsk'],
    lat: 68.152,
    lon: 33.465,
    label: 'Оленья',
  },
  {
    id: 'ukrainka',
    names: ['українка', 'украинка', 'ukrainka', 'серышево', 'серишево'],
    lat: 51.17,
    lon: 128.445,
    label: 'Українка',
  },
  {
    id: 'dyagilevo',
    names: ['дягілєво', 'дягилево', 'dyagilevo', 'рязань ае', 'рязань аэ'],
    lat: 54.642,
    lon: 39.57,
    label: 'Дягілєво',
  },
  {
    id: 'shaykovka',
    names: ['шайковка', 'shaykovka', 'шайківка'],
    lat: 54.227,
    lon: 34.372,
    label: 'Шайковка',
  },
  {
    id: 'savasleyka',
    names: ['саваслейка', 'savasleyka', 'саваслєйка'],
    lat: 55.344,
    lon: 42.313,
    label: 'Саваслейка',
  },
  {
    id: 'akhtubinsk',
    names: ['ахтубінськ', 'ахтубинск', 'akhtubinsk'],
    lat: 48.308,
    lon: 46.236,
    label: 'Ахтубінськ',
  },
  {
    id: 'morozovsk',
    names: ['морозовськ', 'морозовск', 'morozovsk'],
    lat: 48.313,
    lon: 41.792,
    label: 'Морозовськ',
  },
  {
    id: 'millerovo',
    names: ['міллерово', 'миллерово', 'millerovo'],
    lat: 48.955,
    lon: 40.298,
    label: 'Міллерово',
  },
  {
    id: 'primorsko_akhtarsk',
    names: ['приморсько-ахтарськ', 'приморско-ахтарск', 'primorsko-akhtarsk', 'приморско ахтарск'],
    lat: 46.043,
    lon: 38.174,
    label: 'Приморсько-Ахтарськ',
  },
  {
    id: 'krymsk',
    names: ['кримськ', 'крымск', 'krymsk'],
    lat: 44.974,
    lon: 37.991,
    label: 'Кримськ',
  },
  {
    id: 'mozdok',
    names: ['моздок', 'mozdok'],
    lat: 43.789,
    lon: 44.606,
    label: 'Моздок',
  },
  {
    id: 'marinovka',
    names: ['маринівка', 'мариновка', 'marinovka'],
    lat: 48.677,
    lon: 44.063,
    label: 'Маринівка',
  },
  {
    id: 'belaya',
    names: ['біла ае', 'белая аэ', 'ае белая', 'аэ белая', 'belaya air'],
    lat: 52.915,
    lon: 103.575,
    label: 'Біла',
  },
]

const UA_CENTER = { lat: 48.45, lon: 31.25 }

const TG_HEADERS = {
  Accept: 'text/html',
  'User-Agent': 'alert-tracker/1.0 (+https://github.com/Azerorh/alert-tracker)',
}
const TG_MAX_PAGES = 3

const TAKEOFF =
  /зліт|взл[её]т|подн[яи]л|піднял|подняты|в\s+повітрі|в\s+воздухе|вилет\w*|вылет\w*|виліт\w*|airborne|take[\s-]?off|піднятт|поднят|вывел\w*\s+в\s+воздух|підйом\s+борт/i

const AIRCRAFT =
  /ту-?\s?95|ту-?\s?160|миг-?\s?31|міг-?\s?31|mig-?\s?31|кинжал|кінжал|стратег\w*|бомбардир|авіац\w*|авиац\w*|самол[её]т|борт\w*|істребител|истребител|su-?\s?34|су-?\s?34|su-?\s?35|су-?\s?35/i

const LANDED =
  /посадк|приземл|сів\s+на\s+ае|сел\s+на\s+аэ|повернул\w*\s+на\s+базу|вернул\w*\s+на\s+базу/i

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

function summarize(text) {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length > 220 ? `${one.slice(0, 217)}…` : one
}

function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[''`´ʼ’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function bearingDeg(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180
  const φ1 = toRad(lat1)
  const φ2 = toRad(lat2)
  const Δλ = toRad(lon2 - lon1)
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

function aircraftKind(text) {
  if (/ту-?\s?95|ту-?\s?160|стратег|бомбардир/i.test(text)) return 'strategic'
  if (/миг-?\s?31|міг-?\s?31|mig-?\s?31|кинжал|кінжал/i.test(text)) return 'mig31k'
  if (/su-?\s?34|су-?\s?34|su-?\s?35|су-?\s?35|істребител|истребител/i.test(text)) return 'fighter'
  return 'aviation'
}

function aircraftLabel(kind, text) {
  if (/ту-?\s?160/i.test(text)) return 'Ту-160'
  if (/ту-?\s?95/i.test(text)) return 'Ту-95МС'
  if (kind === 'mig31k') return 'МіГ-31К'
  if (/su-?\s?34|су-?\s?34/i.test(text)) return 'Су-34'
  if (/su-?\s?35|су-?\s?35/i.test(text)) return 'Су-35'
  if (kind === 'strategic') return 'Стратегічна авіація'
  if (kind === 'fighter') return 'Винищувач РФ'
  return 'Авіація РФ'
}

function matchAirbase(text) {
  const hay = normalize(text)
  let best = null
  for (const base of RF_AIRBASES) {
    for (const name of base.names) {
      const n = normalize(name)
      if (n.length < 3) continue
      if (!hay.includes(n)) continue
      if (!best || n.length > best.nameLen) {
        best = { base, nameLen: n.length }
      }
    }
  }
  return best?.base ?? null
}

function isTakeoffMention(text) {
  if (!text || text.length < 24) return false
  if (LANDED.test(text) && !TAKEOFF.test(text)) return false
  if (!AIRCRAFT.test(text)) return false
  // Need takeoff cue OR explicit "in air" with airbase
  if (TAKEOFF.test(text)) return true
  if (matchAirbase(text) && /в\s+повітрі|в\s+воздухе|борт\w*\s+з|борт\w*\s+с\s+ае/i.test(text)) {
    return true
  }
  return false
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
    else if (linkMatch?.[1]?.includes('/')) postUrl = `https://t.me/${linkMatch[1]}`
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
  const cutoff = Date.now() - RF_AVIATION_SCRAPE_MS

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
      const ts = m.at ? Date.parse(m.at) : NaN
      if (Number.isFinite(ts)) oldest = Math.min(oldest, ts)
      if (Number.isFinite(ts) && ts < cutoff) continue
      msgs.push(m)
    }
    if (!parsed.before || oldest < cutoff) break
    before = parsed.before
  }
  return msgs
}

function eventFromMessage(msg) {
  if (!isTakeoffMention(msg.text)) return null
  if (LANDED.test(msg.text) && TAKEOFF.test(msg.text) === false) return null

  const base = matchAirbase(msg.text)
  if (!base) return null

  const kind = aircraftKind(msg.text)
  const atMs = msg.at ? Date.parse(msg.at) : Date.now()
  if (!Number.isFinite(atMs)) return null

  const ttl = RF_AVIATION_TTL_MS[kind] ?? RF_AVIATION_TTL_MS.aviation
  const expiresAt = atMs + ttl
  if (expiresAt < Date.now()) return null

  const towardUa = bearingDeg(base.lat, base.lon, UA_CENTER.lat, UA_CENTER.lon)

  return {
    id: `rf-av-${base.id}-${Math.floor(atMs / 60_000)}`,
    airbaseId: base.id,
    airbase: base.label,
    lat: base.lat,
    lon: base.lon,
    kind,
    title: aircraftLabel(kind, msg.text),
    /** Bearing from airbase toward Ukraine — inbound threat direction. */
    bearingDeg: Math.round(towardUa),
    channel: msg.channel,
    postUrl: msg.postUrl,
    excerpt: summarize(msg.text),
    lastSeen: new Date(atMs).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
  }
}

/**
 * @returns {Promise<{ fetchedAt: string, events: object[], messageCount: number, errors: string[] }>}
 */
export async function fetchRfAviationEvents() {
  const errors = []
  const allMsgs = []
  for (const ch of RF_AVIATION_CHANNELS) {
    try {
      const msgs = await fetchChannelMessages(ch.id)
      allMsgs.push(...msgs)
    } catch (err) {
      errors.push(`${ch.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const byBase = new Map()
  for (const msg of allMsgs) {
    const ev = eventFromMessage(msg)
    if (!ev) continue
    const prev = byBase.get(ev.airbaseId)
    if (!prev || Date.parse(ev.lastSeen) > Date.parse(prev.lastSeen)) {
      byBase.set(ev.airbaseId, ev)
    }
  }

  const events = [...byBase.values()]
    .sort((a, b) => Date.parse(b.lastSeen) - Date.parse(a.lastSeen))
    .slice(0, RF_AVIATION_MAX)

  return {
    fetchedAt: new Date().toISOString(),
    events,
    messageCount: allMsgs.length,
    errors,
  }
}
