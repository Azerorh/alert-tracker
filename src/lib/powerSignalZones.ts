import type { Feature, FeatureCollection, Polygon, MultiPolygon } from 'geojson'
import type { PowerTgMarker } from './powerTgOutages'

/** Buffer radii — always circles (full oblast silhouettes blend into schedule fills). */
const RADIUS_KM: Record<string, number> = {
  district: 8,
  place: 18,
  region: 55,
  coords: 5,
}

/** Map TG place labels → oblasts.geojson `key`. */
const PLACE_TO_OBLAST: Array<{ re: RegExp; key: string }> = [
  { re: /м\.?\s*київ|^київ$/i, key: 'м. київ' },
  { re: /київськ/i, key: 'київська' },
  { re: /дніпропетров|дніпровщин|^дніпр[оа]$/i, key: 'дніпропетровська' },
  { re: /одеськ|одещин|^одес/i, key: 'одеська' },
  { re: /харків/i, key: 'харківська' },
  { re: /львів/i, key: 'львівська' },
  { re: /запорізьк|запоріжж/i, key: 'запорізька' },
  { re: /донецьк|донеччин/i, key: 'донецька' },
  { re: /микола[їі]в/i, key: 'миколаївська' },
  { re: /полтав/i, key: 'полтавська' },
  { re: /сумськ|^суми$/i, key: 'сумська' },
  { re: /чернігів/i, key: 'чернігівська' },
  { re: /черкас/i, key: 'черкаська' },
  { re: /житомир/i, key: 'житомирська' },
  { re: /вінниц/i, key: 'вінницька' },
  { re: /хмельниц/i, key: 'хмельницька' },
  { re: /рівн/i, key: 'рівненська' },
  { re: /волин|луцьк/i, key: 'волинська' },
  { re: /івано-?франків|прикарпатт/i, key: 'івано-франківська' },
  { re: /тернопіль/i, key: 'тернопільська' },
  { re: /закарпат|ужгород/i, key: 'закарпатська' },
  { re: /чернівец|буковин/i, key: 'чернівецька' },
  { re: /кіровоград|кропивниц/i, key: 'кіровоградська' },
  { re: /херсон/i, key: 'херсонська' },
  { re: /луган/i, key: 'луганська' },
]

export function placeToOblastKey(place: string | null | undefined): string | null {
  if (!place) return null
  const p = place.trim().toLowerCase()
  for (const row of PLACE_TO_OBLAST) {
    if (row.re.test(p)) return row.key
  }
  return null
}

export function signalRadiusKm(precision: string): number {
  return RADIUS_KM[precision] ?? 12
}

function circleRing(lon: number, lat: number, radiusKm: number, steps = 48): [number, number][] {
  const coords: [number, number][] = []
  const R = 6371
  const lat1 = (lat * Math.PI) / 180
  const lon1 = (lon * Math.PI) / 180
  const angDist = radiusKm / R
  for (let i = 0; i <= steps; i++) {
    const bearing = (i / steps) * 2 * Math.PI
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(angDist) +
        Math.cos(lat1) * Math.sin(angDist) * Math.cos(bearing),
    )
    const lon2 =
      lon1 +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angDist) * Math.cos(lat1),
        Math.cos(angDist) - Math.sin(lat1) * Math.sin(lat2),
      )
    coords.push([(lon2 * 180) / Math.PI, (lat2 * 180) / Math.PI])
  }
  return coords
}

type OblastFc = FeatureCollection<Polygon | MultiPolygon, { key?: string }>

/**
 * Approximate «dark / outage signal» zones from TG emergency markers.
 * Not queue polygons — circular buffers around mentions.
 */
export function buildPowerSignalFeatures(
  markers: PowerTgMarker[],
  _oblasts?: OblastFc | null,
  selectedId: string | null = null,
): FeatureCollection<Polygon | MultiPolygon> {
  // Newest first; collapse same place / same ~grid cell.
  const sorted = [...markers].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
  const groups = new Map<string, PowerTgMarker[]>()

  for (const m of sorted) {
    const oblastKey = placeToOblastKey(m.place)
    const key =
      oblastKey && (m.precision === 'region' || m.precision === 'place')
        ? `ob:${oblastKey}`
        : `pt:${m.lat.toFixed(2)},${m.lon.toFixed(2)}`
    const list = groups.get(key)
    if (list) list.push(m)
    else groups.set(key, [m])
  }

  const features: Feature<Polygon | MultiPolygon>[] = []

  for (const [groupKey, list] of groups) {
    const head = list[0]
    if (!head) continue
    // Prefer a visible buffer around the mention point. Painting whole oblasts
    // looked identical to the schedule choropleth (user saw "nothing new").
    const r = signalRadiusKm(head.precision)
    const geometry: Polygon = {
      type: 'Polygon',
      coordinates: [circleRing(head.lon, head.lat, r)],
    }

    const sid = `power-signal:${groupKey}`
    features.push({
      type: 'Feature',
      id: sid,
      properties: {
        id: sid,
        kind: 'buffer',
        place: head.place ?? '',
        precision: head.precision,
        oblastKey: placeToOblastKey(head.place) ?? '',
        markerCount: list.length,
        markerIds: list.map((m) => m.id).join(','),
        primaryMarkerId: head.id,
        at: head.at,
        summary: head.summary,
        selected: selectedId === sid || list.some((m) => `power-tg:${m.id}` === selectedId) ? 1 : 0,
      },
      geometry,
    })
  }

  return { type: 'FeatureCollection', features }
}

export function parsePowerSignalSelectId(id: string | null): string | null {
  if (!id?.startsWith('power-signal:')) return null
  return id
}

export function primaryMarkerIdFromSignalProps(props: {
  primaryMarkerId?: string
  markerIds?: string
} | null): string | null {
  if (!props) return null
  if (props.primaryMarkerId) return props.primaryMarkerId
  const first = props.markerIds?.split(',')[0]
  return first || null
}
