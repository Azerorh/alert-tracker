/** Snapshot UA power-outage schedules from kolysvitlo.com.
 * Prefers REST API when KOLYSVITLO_API_KEY is set; otherwise scrapes public HTML
 * (API started requiring a free Bearer key ~2026-11-04).
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'geo',
  'power-outages.json',
)

const API = 'https://kolysvitlo.com/api/v1'
const SITE = 'https://kolysvitlo.com'

/** kolysvitlo region_id → oblasts.geojson `key` */
const REGION_TO_OBLAST = {
  prykarpattia_oblenergo: 'івано-франківська',
  voe_volyn: 'волинська',
  voe_vinnytsia: 'вінницька',
  dtek_dnipro: 'дніпропетровська',
  cek_dnipro: 'дніпропетровська',
  dtek_donetsk: 'донецька',
  ztoe_zhytomyr: 'житомирська',
  zakarpattia_oblenergo: 'закарпатська',
  zoe_zaporizhzhia: 'запорізька',
  dtek_kyiv_oblast: 'київська',
  kiroe: 'кіровоградська',
  loe_lviv: 'львівська',
  mykolaiv_oblenergo: 'миколаївська',
  dtek_odesa: 'одеська',
  poe_poltava: 'полтавська',
  roe_rivne: 'рівненська',
  soe_sumy: 'сумська',
  toe_ternopil: 'тернопільська',
  kharkov_oblenergo: 'харківська',
  hoe_khmelnytsky: 'хмельницька',
  cherkasy_oblenergo: 'черкаська',
  chernivtsi_oblenergo: 'чернівецька',
  chernihiv_oblenergo: 'чернігівська',
  dtek_kyiv: 'м. київ',
}

const API_KEY = (process.env.KOLYSVITLO_API_KEY || '').trim()

const UA = {
  Accept: 'application/json, text/html;q=0.9',
  'User-Agent':
    'alert-tracker-power-snapshot/1.1 (+https://github.com/Azerorh/alert-tracker)',
  Referer: `${SITE}/`,
}

function authHeaders() {
  if (!API_KEY) return { ...UA }
  const token = API_KEY.startsWith('Bearer ') ? API_KEY : `Bearer ${API_KEY}`
  return { ...UA, Authorization: token }
}

function kyivHour(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Kyiv',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(now)
  return Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
}

function kyivDateIso(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Kyiv',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  const d = parts.find((p) => p.type === 'day')?.value
  return `${y}-${m}-${d}`
}

function isOffStatus(status) {
  const s = String(status ?? '').toLowerCase()
  return s === 'no' || s === 'first' || s === 'second' || s === 'mfirst' || s === 'msecond'
}

function slotStatusAt(slots, hour) {
  if (!Array.isArray(slots)) return 'unknown'
  const hit = slots.find((s) => Number(s.hour) === hour)
  return hit?.status ?? 'unknown'
}

/** Half-hour digit → status (Kolysvitlo track encoding). */
function digitStatus(d) {
  if (d === '2') return 'no'
  if (d === '1') return 'first'
  if (d === '0') return 'yes'
  return 'unknown'
}

function worseStatus(a, b) {
  const rank = { no: 3, second: 3, msecond: 3, first: 2, mfirst: 2, yes: 1, unknown: 0 }
  return (rank[a] ?? 0) >= (rank[b] ?? 0) ? a : b
}

/** 48 half-hour digits → 24 hourly slots. */
function slotsFromHalfHours(dataH) {
  const s = String(dataH || '')
  const slots = []
  for (let hour = 0; hour < 24; hour++) {
    const a = digitStatus(s[hour * 2] ?? '')
    const b = digitStatus(s[hour * 2 + 1] ?? '')
    slots.push({ hour, status: worseStatus(a, b) })
  }
  return slots
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: authHeaders() })
  if (!res.ok) throw new Error(`${url} → ${res.status}`)
  return res.json()
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      ...UA,
      Accept: 'text/html',
    },
  })
  if (!res.ok) throw new Error(`${url} → ${res.status}`)
  return res.text()
}

function mergeRegion(into, piece) {
  if (!into) {
    return {
      ...piece,
      operators: [...piece.operators],
      groups: { ...piece.groups },
      offNow: [...piece.offNow],
    }
  }
  const groups = { ...into.groups }
  for (const [gid, g] of Object.entries(piece.groups)) {
    const key = groups[gid] ? `${piece.operators[0]?.id ?? 'op'}:${gid}` : gid
    groups[key] = {
      ...g,
      name: groups[gid] && piece.operators[0]?.name
        ? `${g.name} (${piece.operators[0].name})`
        : g.name,
    }
  }
  const offNow = [...new Set([...into.offNow, ...piece.offNow])]
  const groupCount = Object.keys(groups).length
  const offNowCount = offNow.length
  return {
    ...into,
    name: into.name || piece.name,
    updatedAt: [into.updatedAt, piece.updatedAt].filter(Boolean).sort().at(-1) ?? null,
    fetchedAt: piece.fetchedAt || into.fetchedAt,
    scheduleDate: piece.scheduleDate || into.scheduleDate,
    operators: [...into.operators, ...piece.operators],
    groups,
    offNow,
    groupCount,
    offNowCount,
    intensity: groupCount > 0 ? offNowCount / groupCount : 0,
    noOutages: into.noOutages && piece.noOutages,
  }
}

function pieceFromSchedule(id, oblastKey, schedule, regionMeta, hour) {
  const groupsIn = schedule?.groups && typeof schedule.groups === 'object' ? schedule.groups : {}
  const groups = {}
  const offNow = []
  for (const [gid, raw] of Object.entries(groupsIn)) {
    const slots = Array.isArray(raw?.slots)
      ? raw.slots.map((s) => ({
          hour: Number(s.hour),
          status: String(s.status ?? 'unknown'),
        }))
      : []
    const nowStatus = slotStatusAt(slots, hour)
    groups[gid] = {
      name: String(raw?.name ?? gid),
      slots,
      nowStatus,
    }
    if (isOffStatus(nowStatus)) offNow.push(gid.replace(/^GPV/i, ''))
  }
  const groupCount = Object.keys(groups).length
  const offNowCount = offNow.length
  return {
    oblastKey,
    name: String(schedule.region_name ?? regionMeta?.name ?? oblastKey),
    updatedAt: schedule.updated_at ?? null,
    fetchedAt: schedule.fetched_at ?? new Date().toISOString(),
    scheduleDate: schedule.schedule_date ?? null,
    noOutages: Boolean(regionMeta?.no_outages),
    operators: [{ id, name: String(regionMeta?.name ?? id) }],
    groups,
    offNow,
    groupCount,
    offNowCount,
    intensity: groupCount > 0 ? offNowCount / groupCount : 0,
    sourceUrl: `${SITE}/schedule/${encodeURIComponent(id)}`,
  }
}

async function fetchViaApi(hour) {
  const regions = await fetchJson(`${API}/regions`)
  if (!Array.isArray(regions)) throw new Error('regions: not an array')

  const byOblast = new Map()
  const errors = []

  for (const r of regions) {
    const id = String(r.id ?? '')
    const oblastKey = REGION_TO_OBLAST[id]
    if (!oblastKey) {
      errors.push(`unmapped:${id}`)
      continue
    }
    if (r.is_active === false) continue

    try {
      const schedule = await fetchJson(`${API}/regions/${encodeURIComponent(id)}/schedule`)
      const piece = pieceFromSchedule(id, oblastKey, schedule, r, hour)
      byOblast.set(oblastKey, mergeRegion(byOblast.get(oblastKey), piece))
    } catch (err) {
      errors.push(`${id}:${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return { byOblast, errors, mode: 'api' }
}

function parseScheduleHtml(id, oblastKey, html, hour) {
  const groups = {}
  const offNow = []
  const re =
    /<button\b[^>]*\bdata-group="([^"]+)"[^>]*\bdata-h="([0-9]+)"[^>]*>|<button\b[^>]*\bdata-h="([0-9]+)"[^>]*\bdata-group="([^"]+)"[^>]*>/gi
  let m
  while ((m = re.exec(html))) {
    const gid = m[1] || m[4]
    const dataH = m[2] || m[3]
    if (!gid || !dataH) continue
    const slots = slotsFromHalfHours(dataH)
    const nowStatus = slotStatusAt(slots, hour)
    const key = gid.startsWith('GPV') ? gid : gid
    groups[key] = {
      name: String(gid).replace(/^GPV/i, ''),
      slots,
      nowStatus,
    }
    if (isOffStatus(nowStatus)) offNow.push(String(gid).replace(/^GPV/i, ''))
  }

  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, '').trim()
  const name =
    h1?.replace(/:\s*графік відключень.*$/i, '').trim() ||
    html.match(/<title>([^|<]+)/)?.[1]?.trim() ||
    oblastKey

  const checked = html.match(/перевірено\s+([^<]{0,60})/i)?.[1]?.trim() ?? null
  const emergency = /екстрені відключення|графіки не діють/i.test(html)
  const groupCount = Object.keys(groups).length
  const offNowCount = offNow.length

  return {
    oblastKey,
    name,
    updatedAt: checked ? new Date().toISOString() : new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
    scheduleDate: kyivDateIso(),
    noOutages: groupCount === 0 && !emergency,
    operators: [{ id, name }],
    groups,
    offNow,
    groupCount,
    offNowCount,
    intensity: groupCount > 0 ? offNowCount / groupCount : 0,
    sourceUrl: `${SITE}/schedule/${encodeURIComponent(id)}`,
    _checkedLabel: checked,
    _emergency: emergency,
  }
}

async function fetchViaHtml(hour) {
  const byOblast = new Map()
  const errors = []

  for (const [id, oblastKey] of Object.entries(REGION_TO_OBLAST)) {
    try {
      const html = await fetchHtml(`${SITE}/schedule/${encodeURIComponent(id)}`)
      const piece = parseScheduleHtml(id, oblastKey, html, hour)
      if (piece.groupCount === 0 && !piece._emergency) {
        // Still record empty / no-outage regions.
      }
      delete piece._checkedLabel
      delete piece._emergency
      byOblast.set(oblastKey, mergeRegion(byOblast.get(oblastKey), piece))
    } catch (err) {
      errors.push(`${id}:${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return { byOblast, errors, mode: 'html' }
}

async function main() {
  const hour = kyivHour()
  let result
  let mode = 'html'

  if (API_KEY) {
    try {
      result = await fetchViaApi(hour)
      mode = 'api'
    } catch (err) {
      console.warn(
        '[power-outages] API failed, falling back to HTML:',
        err instanceof Error ? err.message : err,
      )
      result = await fetchViaHtml(hour)
      mode = 'html'
    }
  } else {
    // Probe once — if open again, use API; else HTML scrape.
    try {
      const probe = await fetch(`${API}/regions`, { headers: authHeaders() })
      if (probe.ok) {
        result = await fetchViaApi(hour)
        mode = 'api'
      } else {
        console.warn(`[power-outages] API ${probe.status} — using public HTML scrape`)
        result = await fetchViaHtml(hour)
      }
    } catch (err) {
      console.warn(
        '[power-outages] API unreachable, using HTML:',
        err instanceof Error ? err.message : err,
      )
      result = await fetchViaHtml(hour)
    }
  }

  const oblasts = [...result.byOblast.values()].sort((a, b) =>
    a.name.localeCompare(b.name, 'uk'),
  )
  if (!oblasts.length) {
    throw new Error(`no oblasts parsed (mode=${mode}); ${result.errors.slice(0, 3).join('; ')}`)
  }

  const payload = {
    fetchedAt: new Date().toISOString(),
    source: mode === 'api' ? 'kolysvitlo' : 'kolysvitlo-html',
    attribution: `${SITE}/`,
    kyivHour: hour,
    oblastCount: oblasts.length,
    errors: result.errors,
    oblasts,
  }

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload))
  console.log(
    `[power-outages] ${OUT}: ${oblasts.length} oblasts, hour=${hour}, mode=${mode}` +
      (result.errors.length ? ` (notes: ${result.errors.slice(0, 5).join('; ')})` : ''),
  )
}

main().catch((err) => {
  console.error('[power-outages] refresh failed', err)
  process.exit(1)
})
