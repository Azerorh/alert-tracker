/** Snapshot UA power-outage schedules from kolysvitlo.com (free, no API key). */
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

const UA = {
  Accept: 'application/json',
  'User-Agent': 'alert-tracker-power-snapshot/1.0',
}

function kyivHour(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Kyiv',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(now)
  return Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
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

async function fetchJson(url) {
  const res = await fetch(url, { headers: UA })
  if (!res.ok) throw new Error(`${url} → ${res.status}`)
  return res.json()
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

async function main() {
  const hour = kyivHour()
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
      const piece = {
        oblastKey,
        name: String(schedule.region_name ?? r.name ?? oblastKey),
        updatedAt: schedule.updated_at ?? null,
        fetchedAt: schedule.fetched_at ?? new Date().toISOString(),
        scheduleDate: schedule.schedule_date ?? null,
        noOutages: Boolean(r.no_outages),
        operators: [{ id, name: String(r.name ?? id) }],
        groups,
        offNow,
        groupCount,
        offNowCount,
        intensity: groupCount > 0 ? offNowCount / groupCount : 0,
        sourceUrl: `https://kolysvitlo.com/schedule/${encodeURIComponent(id)}`,
      }
      byOblast.set(oblastKey, mergeRegion(byOblast.get(oblastKey), piece))
    } catch (err) {
      errors.push(`${id}:${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const oblasts = [...byOblast.values()].sort((a, b) =>
    a.name.localeCompare(b.name, 'uk'),
  )
  const payload = {
    fetchedAt: new Date().toISOString(),
    source: 'kolysvitlo',
    attribution: 'https://kolysvitlo.com/',
    kyivHour: hour,
    oblastCount: oblasts.length,
    errors,
    oblasts,
  }

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload))
  console.log(
    `[power-outages] ${OUT}: ${oblasts.length} oblasts, hour=${hour}` +
      (errors.length ? ` (notes: ${errors.slice(0, 5).join('; ')})` : ''),
  )
}

main().catch((err) => {
  console.error('[power-outages] refresh failed', err)
  process.exit(1)
})
