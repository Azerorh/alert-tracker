/**
 * RF ground markers from GeoConfirmed public API (Ukraine conflict).
 * Verified placemarks — not live tracks.
 */

export const GEOCONFIRMED_URL = 'https://geoconfirmed.org/'
export const GEOCONFIRMED_GEOJSON_URL =
  'https://geoconfirmed.org/api/placemark/geojson?conflict=Ukraine'
export const GEOCONFIRMED_ICONS_URL = 'https://geoconfirmed.org/api/placemark/icons'
export const GEOCONFIRMED_DETAIL_URL = (id) =>
  `https://geoconfirmed.org/api/placemark/detail/${id}`

/** Russia fighting faction on Ukraine map. */
export const GC_RUSSIA_FACTION_ID = 7
/** Neutral gear sometimes tagged RF in text — only keep when kit icon + RF subject. */
export const GC_NEUTRAL_FACTION_ID = 6

/** Wider kit window — still no strike-on-UA markers. */
export const GC_WINDOW_MS = 21 * 24 * 60 * 60_000
export const GC_WINDOW_HOURS = 24 * 21

const UA = 'alert-tracker/1.0 (+https://github.com/Azerorh/alert-tracker)'
const DETAIL_CONCURRENCY = 6

const CATEGORY_RULES = [
  { key: 'tanks', re: /tank/i },
  { key: 'ifv', re: /\bifv\b|bmp|bmd|infantry fighting/i },
  { key: 'apc', re: /\bapc\b|btr|mt-?lb|mrap|humvee|armoured|armored/i },
  { key: 'artillery', re: /artillery|mlrs|howitz|mortar/i },
  { key: 'airdef', re: /anti-?air|sam\b|radar|pantsir|buk|tor\b|electronic warfare|\bew\b/i },
  { key: 'trucks', re: /truck|transport|logistics|engineer|ugv/i },
]

/** Strike / effect markers on Ukraine — not RF kit locations. */
const STRIKE_ON_UA_ICON =
  /killed or wounded civilian|warcrime|owad|loitering munition|bomber drone|shelling by artillery|aerial bombings|location of the shelling|^video\b|^picture\b|point of view|infrastructure/i

/** RF ground / air kit or presence (what we keep for ground mode). */
const RF_KIT_ICON =
  /tank|bmp|bmd|btr|ifv|apc|mrap|truck|artillery|howitz|mlrs|mortar|radar|sam\b|pantsir|buk|tor\b|anti-?air|helicopter|fighter aircraft|soldier|militant|armou?r|engineering|electronic warfare|ew system|ground vehicle|infantry fighting|armoured|armored|ugv|jammer|trench|fortif|ammo|depot|hq\b|command|infantry|marines|assault|vehicle/i

const RF_DESTROYED_KIT_ICON =
  /(?:recently|older)\s+destroyed|damaged\[visible|burn(?:t|ed|ing)|wia\/kia/i

/** Far-outside theater (e.g. Kaliningrad air crash) — skip. */
const THEATER_BOUNDS = { latMin: 44.0, latMax: 53.8, lonMin: 28.0, lonMax: 48.5 }

const STRIKE_ON_UA_TEXT =
  /(?:attack(?:ed|s|ing)?|hit|struck|strike|shells?|bomb(?:ed|ing)?|drop(?:s|ped)?)\s+(?:on\s+)?(?:a\s+)?(?:claimed\s+)?ukrainian|ukrainian\s+(?:position|vehicle|firing|uav|soldier)|killed\s+(?:a\s+)?(?:man|girl|people|civilian|person)|civilian|warcrime|residential|railway station|municipal bus|dormitory|evacuate|train targeted|drone\s+(?:struck|hit|attack)|fpv\s+(?:drone\s+)?(?:hit|attack)|airstrike|missile strike/i

const RF_ASSET_SUBJECT =
  /russian\s+(?:['‘’"][^'"‘’]+['‘’"]\s+)?(?:mi-?\d|su-?\d|t-?\d{2}|tank|bmp|btr|mt-?lb|helicopter|fighter|aircraft|ew|radar|pantsir|buk|tor|sam|mlrs|artillery|column|truck|vehicle|armou?r|soldier|infantry|marines)|(?:mi-?\d|su-?\d)\b.{0,40}(?:russian|destroyed|burnt)|destroyed by ukrainian|burnt down at|\brf\b.{0,30}(?:tank|bmp|btr|armor)/i

function stripHtml(html) {
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim()
}

function categoryFromText(...parts) {
  const hay = parts.filter(Boolean).join(' ')
  // Airframes are not ground trucks (icon text often says "transport helicopter").
  if (/helicopter|fighter aircraft|airplane|\bsu-\d|\bmi-\d/i.test(hay)) return 'other'
  for (const rule of CATEGORY_RULES) {
    if (rule.re.test(hay)) return rule.key
  }
  return 'other'
}

function kindFromIconAndText(iconName, description) {
  const hay = `${iconName ?? ''} ${description ?? ''}`
  if (/destroy|damag|burn|crash|intercepted|older destroyed|wia\/kia|kia\b/i.test(hay)) {
    return 'loss'
  }
  return 'sighting'
}

/**
 * Keep RF equipment / presence only — drop strikes and effects on Ukraine.
 */
export function isRfGroundRelevant(iconName, description, gearNames = []) {
  const icon = String(iconName ?? '')
  const gear = (gearNames ?? []).filter(Boolean).join(' ')
  const text = `${description ?? ''} ${gear}`

  if (STRIKE_ON_UA_ICON.test(icon)) return false

  if (RF_KIT_ICON.test(icon) || RF_KIT_ICON.test(gear)) return true
  if (RF_DESTROYED_KIT_ICON.test(icon) && !/drone|owad|bomber/i.test(icon)) return true
  if (RF_ASSET_SUBJECT.test(text)) return true

  // Strike narrative without RF kit subject
  if (STRIKE_ON_UA_TEXT.test(text)) return false

  return false
}

function iconNameByPath(iconsByPath, iconPath) {
  if (!iconPath) return ''
  return iconsByPath.get(iconPath) ?? iconsByPath.get(iconPath.split('?')[0]) ?? ''
}

async function mapPool(items, concurrency, fn) {
  const out = new Array(items.length)
  let i = 0
  async function worker() {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx], idx)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  )
  return out
}

async function loadIconIndex() {
  const res = await fetch(GEOCONFIRMED_ICONS_URL, {
    headers: { Accept: 'application/json', 'User-Agent': UA },
  })
  if (!res.ok) throw new Error(`icons HTTP ${res.status}`)
  const all = await res.json()
  const ua = all.find((c) => /ukraine/i.test(c.conflictName ?? c.conflict ?? ''))
  const byPath = new Map()
  for (const fid of [GC_RUSSIA_FACTION_ID, GC_NEUTRAL_FACTION_ID]) {
    const fac = ua?.factions?.find((f) => f.factionId === fid)
    for (const icon of fac?.icons ?? []) {
      const path = icon.icon || icon.path || ''
      if (path) byPath.set(path, icon.name ?? '')
    }
  }
  return byPath
}

/**
 * @returns {Promise<{
 *   markers: object[],
 *   windowHours: number,
 *   featureCount: number,
 *   detailErrors: string[],
 * }>}
 */
export async function fetchGeoConfirmedGround() {
  const [geoRes, iconsByPath] = await Promise.all([
    fetch(GEOCONFIRMED_GEOJSON_URL, {
      headers: { Accept: 'application/json', 'User-Agent': UA },
    }),
    loadIconIndex(),
  ])
  if (!geoRes.ok) throw new Error(`geojson HTTP ${geoRes.status}`)
  const payload = await geoRes.json()
  const features = payload?.geojson?.features
  if (!Array.isArray(features)) throw new Error('geojson.features missing')

  const cutoff = Date.now() - GC_WINDOW_MS
  const candidates = []
  for (const f of features) {
    const p = f?.properties
    if (!p) continue
    const fid = p.factionId
    if (fid !== GC_RUSSIA_FACTION_ID && fid !== GC_NEUTRAL_FACTION_ID) continue
    const ts = Date.parse(p.date)
    if (!Number.isFinite(ts) || ts < cutoff) continue
    const coords = f.geometry?.coordinates
    if (!Array.isArray(coords) || coords.length < 2) continue
    const lon = Number(coords[0])
    const lat = Number(coords[1])
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    const iconName = iconNameByPath(iconsByPath, p.icon)
    // Neutral: only pre-filter likely kit icons (detail confirms RF subject).
    if (fid === GC_NEUTRAL_FACTION_ID) {
      if (STRIKE_ON_UA_ICON.test(iconName)) continue
      if (!RF_KIT_ICON.test(iconName) && !RF_DESTROYED_KIT_ICON.test(iconName)) continue
    }
    candidates.push({
      id: p.id,
      lat,
      lon,
      date: p.date,
      iconPath: p.icon,
      iconName,
      factionId: fid,
    })
  }

  const detailErrors = []
  const details = await mapPool(candidates, DETAIL_CONCURRENCY, async (c) => {
    try {
      const res = await fetch(GEOCONFIRMED_DETAIL_URL(c.id), {
        headers: { Accept: 'application/json', 'User-Agent': UA },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (err) {
      detailErrors.push(`${c.id}: ${err instanceof Error ? err.message : String(err)}`)
      return null
    }
  })

  const markers = []
  let skippedStrikes = 0
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]
    const d = details[i]
    const description = stripHtml(d?.description ?? '')
    const iconName = c.iconName || ''
    const gearNames = (d?.gearItems ?? []).map((g) => g.name).filter(Boolean)
    if (!isRfGroundRelevant(iconName, description, gearNames)) {
      skippedStrikes += 1
      continue
    }
    // Neutral must still read as RF asset after detail.
    if (
      c.factionId === GC_NEUTRAL_FACTION_ID &&
      !RF_ASSET_SUBJECT.test(`${description} ${gearNames.join(' ')}`)
    ) {
      skippedStrikes += 1
      continue
    }
    const category = categoryFromText(iconName, ...gearNames, description, d?.name)
    const kind = kindFromIconAndText(iconName, description)
    const unit =
      d?.orbatUnits?.[0]?.name ??
      (typeof d?.units === 'string' ? d.units : null) ??
      null
    const sources = String(d?.originalSource ?? '')
      .split(/\n+/)
      .map((s) => s.trim())
      .filter((s) => /^https?:\/\//i.test(s))
    const place =
      String(d?.plusCode ?? '')
        .split(',')
        .slice(0, 2)
        .join(',')
        .trim() || null
    const summary =
      description ||
      [d?.name, iconName, gearNames.join(', ')].filter(Boolean).join(' · ') ||
      'GeoConfirmed · РФ'

    const lat = Number.isFinite(d?.latitude) ? Number(d.latitude) : c.lat
    const lon = Number.isFinite(d?.longitude) ? Number(d.longitude) : c.lon
    if (
      lat < THEATER_BOUNDS.latMin ||
      lat > THEATER_BOUNDS.latMax ||
      lon < THEATER_BOUNDS.lonMin ||
      lon > THEATER_BOUNDS.lonMax
    ) {
      skippedStrikes += 1
      continue
    }

    markers.push({
      id: `gc-${c.id}`,
      gcId: c.id,
      lat,
      lon,
      at: d?.date ?? c.date,
      category,
      kind,
      summary: summary.slice(0, 480),
      title: (d?.name || iconName || 'GeoConfirmed').slice(0, 120),
      iconName: iconName || null,
      unit,
      place,
      sources,
      postUrl: `${GEOCONFIRMED_URL}ukraine#${c.id}`,
      channelId: 'geoconfirmed',
      channelLabel: 'GeoConfirmed',
      precision: 'coords',
      side: 'rf',
      source: 'geoconfirmed',
    })
  }

  markers.sort((a, b) => String(b.at).localeCompare(String(a.at)))

  return {
    markers,
    windowHours: GC_WINDOW_HOURS,
    featureCount: candidates.length,
    skippedStrikes,
    detailErrors,
  }
}
