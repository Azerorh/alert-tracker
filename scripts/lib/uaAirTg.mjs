/**
 * UA air-monitor Telegram channels → approximate place buffers for Pages.
 * Skips UkraineAlarmSignal (official alert mirror of NEPTUN).
 */

import {
  extractPlacesFromText,
  loadPlaceIndex,
} from './placeGazetteer.mjs'

export const UA_AIR_TG_CHANNELS = [
  { id: 'chyste_nebo', label: 'Чисте небо', url: 'https://t.me/chyste_nebo' },
  { id: 'kudy_letyt', label: 'Ринда', url: 'https://t.me/kudy_letyt' },
  { id: 'mon1tor_ua', label: 'ППО радар', url: 'https://t.me/mon1tor_ua' },
  { id: 'deraketaua', label: 'Де Ракета', url: 'https://t.me/deraketaua' },
  { id: 'eRadarrua', label: 'єРадар', url: 'https://t.me/eRadarrua' },
  { id: 'monitor_ukr', label: 'Моніторинг UA', url: 'https://t.me/monitor_ukr' },
  { id: 'raketa_trevoga', label: 'Чому тривога', url: 'https://t.me/raketa_trevoga' },
]

export const UA_AIR_TG_KEEP_MS = 45 * 60_000
export const UA_AIR_TG_MAX_ZONES = 18
export const UA_AIR_TG_MAX_PLACES_PER_POST = 3
export const UA_AIR_TG_DRAW_RADIUS_KM = {
  place: 14,
  district: 10,
  region: 22,
}

const TG_HEADERS = {
  Accept: 'text/html',
  'User-Agent': 'alert-tracker/1.0 (+https://github.com/Azerorh/alert-tracker)',
}
const TG_MAX_PAGES = 4

/** Live air activity / strike cues — not bare «тривога оголошена». */
const AIR_CUE =
  /бпл|бпла|шахед|шахід|геран|дрон|fpv|ракет|балістик|каб\b|умпк|умпб|крилат|кинжал|іскандер|калібр|х-?\d{2,3}|вибух|курс\s+на|напрям\w*\s+на|груп[аиы]\s+(?:бпл|ракет|шах)|збит\w*|ппо|зеніт|пуск\w*|проліт|летить|летять|зафіксован|фіксац/i

/** Pure alert status — skip unless AIR_CUE also present. */
const ALERT_ONLY =
  /оголошен\w*\s+тривог|відбій\s+(?:тривог|небезпек)|повітряна\s+тривога|жовтий\s+рівень|червоний\s+рівень|прям\w*\s+в\s+укритт/i

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

function isUaAirMention(text) {
  if (!text || text.length < 20) return false
  if (!AIR_CUE.test(text)) return false
  if (ALERT_ONLY.test(text) && !/(бпл|шахед|ракет|вибух|курс|збит|летить|каб)/i.test(text)) {
    return false
  }
  return true
}

function threatTypeFromText(text) {
  if (/балістик|кинжал|іскандер|kn-?\d/i.test(text)) return 'ballistic'
  if (/каб\b|умпк|умпб|авіабомб/i.test(text)) return 'kab'
  if (/ракет|калібр|крилат|х-?\d{2,3}/i.test(text)) return 'missile'
  if (/вибух/i.test(text) && !/бпл|шахед|дрон/i.test(text)) return 'explosion'
  return 'drone'
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
  const cutoff = Date.now() - UA_AIR_TG_KEEP_MS

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

function gridKey(lat, lon) {
  return `${lat.toFixed(2)},${lon.toFixed(2)}`
}

/**
 * @returns {Promise<{
 *   fetchedAt: string,
 *   source: string,
 *   keepMinutes: number,
 *   channels: string[],
 *   messageCount: number,
 *   errors: string[],
 *   zones: object[],
 * }>}
 */
export async function fetchUaAirTgZones() {
  const index = await loadPlaceIndex()
  const batches = await Promise.allSettled(
    UA_AIR_TG_CHANNELS.map((c) => fetchChannelMessages(c.id)),
  )
  const messages = []
  const errors = []
  for (let i = 0; i < batches.length; i++) {
    const b = batches[i]
    if (b.status === 'fulfilled') messages.push(...b.value)
    else errors.push(`${UA_AIR_TG_CHANNELS[i].id}: ${b.reason}`)
  }

  const now = Date.now()
  const byGrid = new Map()

  for (const m of messages) {
    const ts = m.at ? Date.parse(m.at) : NaN
    if (!Number.isFinite(ts) || now - ts > UA_AIR_TG_KEEP_MS) continue
    if (!isUaAirMention(m.text)) continue

    const places = extractPlacesFromText(m.text, index).slice(
      0,
      UA_AIR_TG_MAX_PLACES_PER_POST,
    )
    if (!places.length) continue

    const meta = UA_AIR_TG_CHANNELS.find((c) => c.id === m.channel)
    const threatType = threatTypeFromText(m.text)
    const excerpt = summarize(m.text)

    for (const p of places) {
      const gk = gridKey(p.lat, p.lon)
      const prev = byGrid.get(gk)
      if (prev && Date.parse(prev.lastSeen) >= ts) continue
      const precision = p.precision === 'district' ? 'district' : 'place'
      byGrid.set(gk, {
        id: `ua-tg-${gk.replace(/[^\d.-]/g, '_')}-${ts}`,
        sourceId: null,
        lat: p.lat,
        lon: p.lon,
        radiusKm: UA_AIR_TG_DRAW_RADIUS_KM[precision] ?? 14,
        name: p.place,
        kind: precision,
        threatType,
        channel: m.channel,
        channelLabel: meta?.label ?? m.channel,
        excerpt,
        lastSeen: new Date(ts).toISOString(),
        expiresAt: new Date(ts + UA_AIR_TG_KEEP_MS).toISOString(),
        confidence: 0.7,
        postUrl: m.postUrl,
        origin: 'ua-tg',
      })
    }
  }

  const zones = [...byGrid.values()]
    .sort((a, b) => Date.parse(b.lastSeen) - Date.parse(a.lastSeen))
    .slice(0, UA_AIR_TG_MAX_ZONES)

  return {
    fetchedAt: new Date().toISOString(),
    source: 'ua-air-tg',
    keepMinutes: UA_AIR_TG_KEEP_MS / 60_000,
    channels: UA_AIR_TG_CHANNELS.map((c) => c.id),
    messageCount: messages.length,
    errors,
    zones,
  }
}
