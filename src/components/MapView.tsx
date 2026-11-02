import { useEffect, useRef, useState } from 'react'
import maplibregl, {
  type AddLayerObject,
  type GeoJSONSource,
  type Map as MapLibreMap,
} from 'maplibre-gl'
import type { FeatureCollection, LineString, MultiPolygon, Point, Polygon } from 'geojson'
import {
  DS_ATTACKS_GEOJSON_URL,
  FLY_TO_ZOOM,
  INITIAL_ZOOM,
  MAX_ZOOM,
  OBLASTS_GEOJSON_URL,
  OCCUPIED_GEOJSON_URL,
  RAIONS_GEOJSON_URL,
  RUSSIA_OBLASTS_GEOJSON_URL,
  RUSSIA_OUTLINE_GEOJSON_URL,
  UKRAINE_CENTER,
  UKRAINE_FIT_BOUNDS,
  getTypeMeta,
  matchesUiFilter,
  predict,
  type AlertZone,
  type UiFilterKey,
} from '../lib/neptun'
import {
  DS_ATTACK_ICON_ID,
  registerDsAttackArrow,
} from '../lib/dsAttackArrow'
import {
  DS_UNIT_HQ_ICON_ID,
  DS_UNIT_ICON_ID,
  registerDsUnitIcons,
} from '../lib/dsUnitIcon'
import type { DsUnit } from '../lib/dsUnits'
import type { GroundFilterKey } from '../lib/warspotting'
import {
  endKindColor,
  isEndedThreat,
  type DisplayThreat,
} from '../lib/threatDisplay'
import type { BurningRefinery, DsmStrike } from '../lib/droneStrikeMap'
import type { MapMode } from '../lib/mapMode'
import { powerSelectId, type PowerOblast } from '../lib/powerOutages'
import {
  POWER_QUEUE_SELECT_ID,
  type ResolvedPowerQueue,
} from '../lib/powerQueue'
import {
  buildPowerSignalFeatures,
  primaryMarkerIdFromSignalProps,
} from '../lib/powerSignalZones'
import { powerTgSelectId, type PowerTgMarker } from '../lib/powerTgOutages'
import { buildEradarFeatures, type EradarZone } from '../lib/eradar'
import {
  buildRfAviationFeatures,
  computeRfAvEdgeCues,
  rfAvIconUrl,
  type RfAviationEvent,
  type RfAvEdgeCue,
} from '../lib/rfAviation'
import {
  ruBplaMarkerId,
  type RuAlertZone,
  type RuTrajectory,
} from '../lib/ruAlerts'
import { indexCentroidsByKey } from '../lib/geoCentroid'
import { isOverRussia, setHostileAirspace } from '../lib/russiaPresence'
import {
  groundIconId,
  registerGroundIcons,
} from '../lib/groundIcons'
import type { RfSighting } from '../lib/rfSightings'
import { registerRuTrajArrow } from '../lib/ruTrajArrow'
import {
  ABROAD_ICON_COLOR,
  FIRE_ICON_ID,
  iconIdForType,
  registerThreatIcons,
} from '../lib/threatIcons'
import type { GroundLoss } from '../lib/warspotting'

type Props = {
  mapMode: MapMode
  threats: DisplayThreat[]
  alerts: AlertZone[]
  alertOblasts: AlertZone[]
  filter: UiFilterKey
  selectedId: string | null
  onSelect: (id: string | null) => void
  locateToken: number
  userLocation: { lat: number; lon: number } | null
  nearbyIds: Set<string> | null
  nearMeRadiusKm: number | null
  dsmStrikes: DsmStrike[]
  burningRefineries: BurningRefinery[]
  ruAlerts: RuAlertZone[]
  ruTrajectories: RuTrajectory[]
  groundLosses: GroundLoss[]
  rfSightings: RfSighting[]
  dsUnits: DsUnit[]
  groundFilter: GroundFilterKey
  powerOblasts: PowerOblast[]
  powerTgMarkers: PowerTgMarker[]
  powerQueue: ResolvedPowerQueue | null
  eradarZones: EradarZone[]
  rfAviation: RfAviationEvent[]
}

const THREATS_SOURCE = 'threats'
const THREAT_UNCERTAINTY_SOURCE = 'threat-uncertainty'
const TRAILS_SOURCE = 'trails'
const RAIONS_SOURCE = 'raions'
const OBLASTS_SOURCE = 'oblasts'
const OCCUPIED_SOURCE = 'occupied'
const DS_ATTACKS_SOURCE = 'ds-attacks'
const DS_UNITS_SOURCE = 'ds-units'
const USER_SOURCE = 'user'
const NEAR_SOURCE = 'near-me'
const DSM_SOURCE = 'dsm-strikes'
const NPZ_SOURCE = 'npz-fires'
const RU_BPLA_SOURCE = 'ru-bpla'
const RU_FIX_SOURCE = 'ru-fixes'
const RU_TRAJ_SOURCE = 'ru-traj'
const RU_TRAJ_ARROW_SOURCE = 'ru-traj-arrows'
const GROUND_SOURCE = 'ground-losses'
const SIGHTING_SOURCE = 'rf-sightings'
const POWER_TG_SOURCE = 'power-tg-points'
const POWER_SIGNAL_SOURCE = 'power-signal-zones'
const POWER_QUEUE_SOURCE = 'power-queue-pin'
const ERADAR_SOURCE = 'eradar-zones'
const RF_AV_SOURCE = 'rf-aviation'
const RUSSIA_SOURCE = 'russia-outline'
const RUSSIA_OBLASTS_SOURCE = 'russia-oblasts'

const AIR_LAYER_IDS = [
  'oblasts-fill',
  'raions-fill',
  'russia-oblasts-fill',
  'russia-oblasts-line',
  'eradar-fill',
  'eradar-line',
  'near-me-fill',
  'near-me-line',
  'trails-line',
  'ru-traj-line',
  'ru-traj-arrow',
  'ru-fix-halo',
  'ru-fix-dot',
  'rf-av-halo',
  'rf-av-icon',
  'threat-uncertainty',
  'threat-halo',
  'threat-icon',
  'threat-ended-label',
  'dsm-icon',
  'npz-icon',
  'ru-bpla-icon',
] as const

/** OpenFreeMap default: latin translit + local script. Prefer Ukrainian only. */
const UK_ONLY_TEXT_FIELD: maplibregl.ExpressionSpecification = [
  'coalesce',
  ['get', 'name:uk'],
  ['get', 'name:nonlatin'],
  ['get', 'name'],
]

/** Dark style ships place labels at ~rgb(101,101,101) — unreadable on phones. */
const PLACE_LABEL_COLOR = '#f5f7fa'
const PLACE_LABEL_HALO = 'rgba(8, 12, 20, 0.92)'
const PLACE_LABEL_LAYER =
  /^(place_city|place_city_large|place_town|place_village|place_suburb|place_other|place_state|place_country)/

function preferUkrainianBasemapLabels(map: MapLibreMap) {
  const layers = map.getStyle().layers ?? []
  for (const layer of layers) {
    if (layer.type !== 'symbol') continue
    // Keep motorway shields (M-06 etc.), not place names.
    if (layer.id === 'highway_name_motorway') continue
    const textField = layer.layout?.['text-field']
    if (textField == null) continue
    try {
      map.setLayoutProperty(layer.id, 'text-field', UK_ONLY_TEXT_FIELD)
    } catch (err) {
      console.warn('label locale patch failed', layer.id, err)
    }

    if (!PLACE_LABEL_LAYER.test(layer.id)) continue
    try {
      map.setPaintProperty(layer.id, 'text-color', PLACE_LABEL_COLOR)
      map.setPaintProperty(layer.id, 'text-halo-color', PLACE_LABEL_HALO)
      map.setPaintProperty(layer.id, 'text-halo-width', 1.8)
      map.setPaintProperty(layer.id, 'text-halo-blur', 0.4)
      // Slightly larger for city / oblast readability on small screens.
      if (layer.id === 'place_city' || layer.id === 'place_town') {
        map.setLayoutProperty(layer.id, 'text-size', 12)
      } else if (layer.id === 'place_city_large') {
        map.setLayoutProperty(layer.id, 'text-size', 15)
      } else if (layer.id === 'place_state') {
        map.setLayoutProperty(layer.id, 'text-size', 12)
      } else if (layer.id === 'place_village' || layer.id === 'place_suburb') {
        map.setLayoutProperty(layer.id, 'text-size', 11)
      }
    } catch (err) {
      console.warn('label contrast patch failed', layer.id, err)
    }
  }
}

const POWER_LAYER_IDS = [
  'power-oblasts-fill',
  'power-oblasts-line',
  'power-signal-fill',
  'power-signal-line',
  'power-tg-halo',
  'power-tg-dot',
  'power-queue-halo',
  'power-queue-dot',
] as const

const GROUND_LAYER_IDS = [
  'ground-halo',
  'ground-icon',
  'sighting-halo',
  'sighting-icon',
  'ds-attack-arrow',
  'ds-unit-icon',
] as const

/** Wide enough to pan across Ukraine + most of European / western Russia. */
const MAP_MAX_BOUNDS: [[number, number], [number, number]] = [
  [8, 36],
  [95, 72],
]
/** Lower than NEPTUN’s MIN_ZOOM(4) so the map can show deep into Russia. */
const MAP_MIN_ZOOM = 2.6

function emptyPoints(): FeatureCollection<Point> {
  return { type: 'FeatureCollection', features: [] }
}

function emptyLines(): FeatureCollection<LineString> {
  return { type: 'FeatureCollection', features: [] }
}

function emptyPolygons(): FeatureCollection {
  return { type: 'FeatureCollection', features: [] }
}

/** Geodesic ring in km — true map distance (not zoom-dependent pixel radius). */
function circleRingCoords(
  lon: number,
  lat: number,
  radiusKm: number,
  steps = 48,
): [number, number][] {
  const coords: [number, number][] = []
  const R = 6371
  const lat1 = (lat * Math.PI) / 180
  const lon1 = (lon * Math.PI) / 180
  const angDist = Math.max(0.05, radiusKm) / R
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

/** Approximate geodesic circle for near-me radius ring. */
function circlePolygon(lon: number, lat: number, radiusKm: number, steps = 64): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [circleRingCoords(lon, lat, radiusKm, steps)] },
      },
    ],
  }
}

function buildThreatFeatures(
  threats: DisplayThreat[],
  now: number,
  filter: UiFilterKey,
  selectedId: string | null,
  nearbyIds: Set<string> | null,
) {
  const points: FeatureCollection<Point> = { type: 'FeatureCollection', features: [] }
  const trails: FeatureCollection<LineString> = { type: 'FeatureCollection', features: [] }
  const uncertainty: FeatureCollection = { type: 'FeatureCollection', features: [] }

  for (const threat of threats) {
    if (!matchesUiFilter(threat.type, filter)) continue
    if (threat.status === 'resolved' && !isEndedThreat(threat)) continue

    const ended = isEndedThreat(threat)
    const endKind = threat.endKind ?? ''
    const areaOnly = Boolean(threat.areaOnly)
    const advisory = Boolean(threat.advisory)
    const meta = getTypeMeta(threat.type)
    const predicted = areaOnly || ended ? null : predict(threat, now)
    const lat = predicted?.lat ?? threat.lat
    const lon = predicted?.lon ?? threat.lon
    // Prefer kinematics bearing; fall back to reported heading (not SDK hash filler).
    const courseDeg =
      threat.velocity?.bearingDeg ??
      (threat.heading != null && Number.isFinite(threat.heading) ? threat.heading : null)
    const heading = courseDeg ?? predicted?.heading ?? 0
    const selected = threat.id === selectedId ? 1 : 0
    const nearby = !nearbyIds || nearbyIds.has(threat.id) ? 1 : 0
    // Live tracks over RF → red silhouettes. TOT / UA stay white. Ended stay gray.
    const overRussia = !ended && !areaOnly && isOverRussia(lat, lon)
    const color =
      ended && threat.endKind
        ? endKindColor(threat.endKind)
        : overRussia
          ? ABROAD_ICON_COLOR
          : meta.hex
    const flying = !ended && !areaOnly && predicted?.flying ? 1 : 0
    const rotate = !ended && !areaOnly && courseDeg != null ? 1 : 0
    const isGroup = threat.type === 'uav' && !ended && (threat.count ?? 0) > 1
    const icon = iconIdForType(
      threat.type,
      ended ? threat.endKind : null,
      overRussia,
      isGroup,
    )
    const uncertaintyKm = ended
      ? 3
      : (threat.uncertaintyKm ??
        (threat.positionQuality === 'confirmed' || threat.positionQuality === 'mapa' ? 5 : 10))
    const approx = threat.positionQuality === 'approx' || areaOnly || ended ? 1 : 0

    points.features.push({
      type: 'Feature',
      id: threat.id,
      properties: {
        id: threat.id,
        type: threat.type,
        title: threat.title,
        color,
        icon,
        heading,
        rotate,
        flying,
        areaOnly: areaOnly ? 1 : 0,
        advisory: advisory || ended ? 1 : 0,
        selected,
        nearby,
        ended: ended ? 1 : 0,
        endKind,
        uncertaintyKm,
        priority: ended ? 0 : meta.priority,
        approx,
      },
      geometry: { type: 'Point', coordinates: [lon, lat] },
    })

    // True km ring (geodesic) — old pixel radius grew with zoom and looked like false range.
    if (!areaOnly && nearby && Number.isFinite(uncertaintyKm) && uncertaintyKm > 0) {
      uncertainty.features.push({
        type: 'Feature',
        properties: {
          id: threat.id,
          color,
          nearby,
          approx,
          selected,
          ended: ended ? 1 : 0,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [circleRingCoords(lon, lat, Math.min(uncertaintyKm, 35), 40)],
        },
      })
    }

    // Keep trail for vanished ghosts; shot_down stays icon-only (as before).
    const showTrail =
      !areaOnly &&
      Boolean(threat.trail && threat.trail.length > 1) &&
      nearby &&
      (!ended || threat.endKind === 'vanished')
    if (showTrail && threat.trail) {
      const coords = threat.trail.map((p) => [p.lon, p.lat] as [number, number])
      const last = coords[coords.length - 1]
      if (!last || Math.abs(last[0] - lon) > 1e-5 || Math.abs(last[1] - lat) > 1e-5) {
        coords.push([lon, lat])
      }
      trails.features.push({
        type: 'Feature',
        properties: {
          id: threat.id,
          color: ended
            ? endKindColor('vanished')
            : overRussia
              ? ABROAD_ICON_COLOR
              : meta.hex,
        },
        geometry: { type: 'LineString', coordinates: coords },
      })
    }
  }

  return { points, trails, uncertainty }
}

/** All DSM RU hits (24h) → flame markers (reported impacts, not live tracks). */
function buildDsmFeatures(strikes: DsmStrike[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: strikes.map((s) => ({
      type: 'Feature' as const,
      id: s.id,
      properties: {
        id: s.id,
        title: `${s.place || s.region} · ${s.date}`,
        summary: s.summary,
        icon: FIRE_ICON_ID,
      },
      geometry: { type: 'Point' as const, coordinates: [s.lon, s.lat] },
    })),
  }
}

function buildNpzFeatures(sites: BurningRefinery[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: sites.map((s) => ({
      type: 'Feature' as const,
      id: s.id,
      properties: {
        id: s.id,
        title: s.name,
        summary: `${s.region} · ${s.reason}`,
        icon: FIRE_ICON_ID,
      },
      geometry: { type: 'Point' as const, coordinates: [s.lon, s.lat] },
    })),
  }
}

function buildGroundFeatures(
  losses: GroundLoss[],
  selectedId: string | null,
): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: losses.map((l) => ({
      type: 'Feature' as const,
      id: l.id,
      properties: {
        id: l.id,
        title: l.model,
        category: l.category,
        icon: groundIconId(l.category, 'loss'),
        color: ABROAD_ICON_COLOR,
        selected: l.id === selectedId ? 1 : 0,
      },
      geometry: { type: 'Point' as const, coordinates: [l.lon, l.lat] },
    })),
  }
}

function buildSightingFeatures(
  sightings: RfSighting[],
  selectedId: string | null,
): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: sightings.map((s) => ({
      type: 'Feature' as const,
      id: s.id,
      properties: {
        id: s.id,
        title: s.summary,
        category: s.category,
        icon: groundIconId(s.category, 'sighting'),
        color: '#f0b429',
        selected: s.id === selectedId ? 1 : 0,
        placeApprox: s.precision === 'place' ? 1 : 0,
      },
      geometry: { type: 'Point' as const, coordinates: [s.lon, s.lat] },
    })),
  }
}

function buildPowerTgFeatures(
  markers: PowerTgMarker[],
  selectedId: string | null,
): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: markers.map((m) => {
      const sid = powerTgSelectId(m.id)
      return {
        type: 'Feature' as const,
        id: m.id,
        properties: {
          id: sid,
          title: m.summary,
          place: m.place ?? '',
          selected: sid === selectedId ? 1 : 0,
          placeApprox: m.precision === 'coords' ? 0 : 1,
        },
        geometry: { type: 'Point' as const, coordinates: [m.lon, m.lat] },
      }
    }),
  }
}

function buildPowerQueueFeatures(
  queue: ResolvedPowerQueue | null,
  selectedId: string | null,
): FeatureCollection<Point> {
  if (!queue) return emptyPoints()
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature' as const,
        id: POWER_QUEUE_SELECT_ID,
        properties: {
          id: POWER_QUEUE_SELECT_ID,
          title: queue.group.name || queue.groupId,
          off: queue.nowOff ? 1 : 0,
          selected: selectedId === POWER_QUEUE_SELECT_ID ? 1 : 0,
        },
        geometry: { type: 'Point' as const, coordinates: [queue.lon, queue.lat] },
      },
    ],
  }
}

/**
 * RF BPLA markers: prefer geocoded town fixes from TG corridors, else oblast centroid.
 * No experimental track lines (those were too noisy).
 */
function buildRuBplaFeatures(
  alerts: RuAlertZone[],
  trajectories: RuTrajectory[],
  centroids: Map<string, [number, number]>,
): FeatureCollection<Point> {
  const features: FeatureCollection<Point>['features'] = []
  const usedCells = new Set<string>()
  const coveredKeys = new Set<string>()

  const cellOf = (lon: number, lat: number) =>
    `${lat.toFixed(1)},${lon.toFixed(1)}`

  const activeKeys = new Set(
    alerts.filter((a) => a.kinds?.includes('bpla')).map((a) => a.key),
  )

  // 1) Town fixes from trajectories that still touch an active alert.
  for (const t of trajectories) {
    if (!t.keys.some((k) => activeKeys.has(k))) continue
    for (const p of t.points ?? []) {
      if (!p.place) continue
      const cell = cellOf(p.lon, p.lat)
      if (usedCells.has(cell)) continue
      usedCells.add(cell)
      for (const k of t.keys) coveredKeys.add(k)
      const bearing =
        t.bearingDeg != null && Number.isFinite(t.bearingDeg) ? t.bearingDeg : 0
      const id = ruBplaMarkerId('place', p.lon, p.lat, p.place)
      features.push({
        type: 'Feature',
        id,
        properties: {
          id,
          title: p.place,
          icon: iconIdForType('uav', null, true, false),
          bearing,
          rotate: t.bearingDeg != null ? 1 : 0,
        },
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      })
      if (features.length >= 10) break
    }
    if (features.length >= 10) break
  }

  // 2) Centroid fallback for alert oblasts without a town fix.
  for (const a of alerts) {
    if (!a.kinds?.includes('bpla')) continue
    if (coveredKeys.has(a.key)) continue
    const c = centroids.get(a.key)
    if (!c) continue
    const cell = cellOf(c[0], c[1])
    if (usedCells.has(cell)) continue
    usedCells.add(cell)
    const hasBearing =
      a.bearingDeg != null && Number.isFinite(a.bearingDeg)
    const id = ruBplaMarkerId('oblast', c[0], c[1], a.key)
    features.push({
      type: 'Feature',
      id,
      properties: {
        id,
        title: a.name,
        icon: iconIdForType('uav', null, true, false),
        bearing: hasBearing ? (a.bearingDeg as number) : 0,
        rotate: hasBearing ? 1 : 0,
      },
      geometry: { type: 'Point', coordinates: c },
    })
  }

  return { type: 'FeatureCollection', features }
}

function buildDsUnitFeatures(
  units: DsUnit[],
  selectedId: string | null,
  groundFilter: GroundFilterKey,
): FeatureCollection<Point> {
  // Units = RF troop ORBAT markers — keep visible with sightings too.
  const filtered =
    groundFilter === 'all' || groundFilter === 'sightings'
      ? units
      : units.filter((u) => u.category === groundFilter)
  return {
    type: 'FeatureCollection',
    features: filtered.map((u) => ({
      type: 'Feature' as const,
      id: u.id,
      properties: {
        id: u.id,
        title: u.title,
        icon: u.role === 'hq' ? DS_UNIT_HQ_ICON_ID : DS_UNIT_ICON_ID,
        selected: u.id === selectedId ? 1 : 0,
      },
      geometry: { type: 'Point' as const, coordinates: [u.lon, u.lat] },
    })),
  }
}

function setLayersVisibility(map: MapLibreMap, ids: readonly string[], visible: boolean) {
  const value = visible ? 'visible' : 'none'
  for (const id of ids) {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, 'visibility', value)
    }
  }
}

function syncAlertStates(
  map: MapLibreMap,
  source: string,
  nextKeys: Set<string>,
  levelByKey: Map<string, string>,
  prevKeys: Set<string>,
) {
  for (const key of prevKeys) {
    if (!nextKeys.has(key)) {
      map.setFeatureState({ source, id: key }, { alert: 0, level: '' })
    }
  }
  for (const key of nextKeys) {
    map.setFeatureState(
      { source, id: key },
      { alert: 1, level: levelByKey.get(key) ?? 'red' },
    )
  }
  prevKeys.clear()
  for (const key of nextKeys) prevKeys.add(key)
}

function syncPowerStates(
  map: MapLibreMap,
  source: string,
  oblasts: PowerOblast[],
  prevKeys: Set<string>,
) {
  const next = new Map(oblasts.map((o) => [o.oblastKey, o]))
  for (const key of prevKeys) {
    if (!next.has(key)) {
      map.setFeatureState({ source, id: key }, { power: 0, powerIntensity: 0 })
    }
  }
  for (const [key, o] of next) {
    map.setFeatureState(
      { source, id: key },
      {
        power: 1,
        powerIntensity: Math.max(0, Math.min(1, o.intensity || 0)),
      },
    )
  }
  prevKeys.clear()
  for (const key of next.keys()) prevKeys.add(key)
}

export function MapView({
  mapMode,
  threats,
  alerts,
  alertOblasts,
  filter,
  selectedId,
  onSelect,
  locateToken,
  userLocation,
  nearbyIds,
  nearMeRadiusKm,
  dsmStrikes,
  burningRefineries,
  ruAlerts,
  ruTrajectories,
  groundLosses,
  rfSightings,
  dsUnits,
  groundFilter,
  powerOblasts,
  powerTgMarkers,
  powerQueue,
  eradarZones,
  rfAviation,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const [ready, setReady] = useState(false)
  const [edgeCues, setEdgeCues] = useState<RfAvEdgeCue[]>([])
  const rfAviationRef = useRef(rfAviation)
  const edgeIconUrl = useRef(rfAvIconUrl())
  const ruCentroidsRef = useRef<Map<string, [number, number]>>(new Map())
  const selectedRef = useRef(selectedId)
  const onSelectRef = useRef(onSelect)
  const threatsRef = useRef(threats)
  const filterRef = useRef(filter)
  const nearbyIdsRef = useRef(nearbyIds)
  const mapModeRef = useRef(mapMode)
  const prevRaionKeys = useRef(new Set<string>())
  const prevOblastKeys = useRef(new Set<string>())
  const prevRuAlertKeys = useRef(new Set<string>())
  const prevTotAlertKeys = useRef(new Set<string>())
  const prevPowerKeys = useRef(new Set<string>())
  const powerOblastsFcRef = useRef<FeatureCollection<
    Polygon | MultiPolygon,
    { key?: string }
  > | null>(null)

  useEffect(() => {
    selectedRef.current = selectedId
  }, [selectedId])

  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  useEffect(() => {
    threatsRef.current = threats
  }, [threats])

  useEffect(() => {
    filterRef.current = filter
  }, [filter])

  useEffect(() => {
    nearbyIdsRef.current = nearbyIds
  }, [nearbyIds])

  useEffect(() => {
    mapModeRef.current = mapMode
  }, [mapMode])

  useEffect(() => {
    rfAviationRef.current = rfAviation
  }, [rfAviation])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/dark',
      center: UKRAINE_CENTER,
      zoom: INITIAL_ZOOM,
      minZoom: MAP_MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      maxBounds: MAP_MAX_BOUNDS,
      attributionControl: false,
    })

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution: '© OpenFreeMap · © OpenMapTiles · © OpenStreetMap',
      }),
      'bottom-left',
    )

    map.fitBounds(UKRAINE_FIT_BOUNDS, { padding: 48, duration: 0 })
    mapRef.current = map

    let cancelled = false

    map.on('load', async () => {
      try {
        preferUkrainianBasemapLabels(map)

        let raions: FeatureCollection = emptyPoints() as FeatureCollection
        let oblasts: FeatureCollection = emptyPoints() as FeatureCollection
        let occupied: FeatureCollection = emptyPoints() as FeatureCollection
        let dsAttacks: FeatureCollection = emptyPoints() as FeatureCollection
        let russia: FeatureCollection = emptyPoints() as FeatureCollection
        let russiaOblasts: FeatureCollection = emptyPoints() as FeatureCollection
        try {
          ;[raions, oblasts] = await Promise.all([
            fetch(RAIONS_GEOJSON_URL).then(async (r) => {
              if (!r.ok) throw new Error(`raions ${r.status}`)
              return r.json() as Promise<FeatureCollection>
            }),
            fetch(OBLASTS_GEOJSON_URL).then(async (r) => {
              if (!r.ok) throw new Error(`oblasts ${r.status}`)
              return r.json() as Promise<FeatureCollection>
            }),
          ])
        } catch (geoErr) {
          console.warn('Alert polygons unavailable', geoErr)
        }
        try {
          const [russiaRes, ruOblastsRes] = await Promise.all([
            fetch(RUSSIA_OUTLINE_GEOJSON_URL),
            fetch(RUSSIA_OBLASTS_GEOJSON_URL),
          ])
          if (russiaRes.ok) russia = (await russiaRes.json()) as FeatureCollection
          if (ruOblastsRes.ok) {
            russiaOblasts = (await ruOblastsRes.json()) as FeatureCollection
          }
        } catch (ruErr) {
          console.warn('Russia polygons unavailable', ruErr)
        }
        try {
          const occupiedRes = await fetch(OCCUPIED_GEOJSON_URL)
          if (!occupiedRes.ok) throw new Error(`occupied ${occupiedRes.status}`)
          const occupiedJson = (await occupiedRes.json()) as FeatureCollection
          if (!Array.isArray(occupiedJson.features) || occupiedJson.features.length === 0) {
            throw new Error('occupied geojson empty or invalid')
          }
          occupied = occupiedJson
        } catch (occErr) {
          console.warn('Occupied territory layer unavailable', occErr)
        }
        try {
          const attacksRes = await fetch(DS_ATTACKS_GEOJSON_URL)
          if (attacksRes.ok) {
            const attacksJson = (await attacksRes.json()) as FeatureCollection
            if (Array.isArray(attacksJson.features)) dsAttacks = attacksJson
          }
        } catch (attErr) {
          console.warn('DeepState attack arrows unavailable', attErr)
        }
        if (cancelled) return

        // Abroad (red) icons only over RF proper — TOT stays white like free Ukraine.
        setHostileAirspace([russia])

        ruCentroidsRef.current = new Map([
          ...indexCentroidsByKey(russiaOblasts),
          ...indexCentroidsByKey(oblasts),
        ])
        powerOblastsFcRef.current = oblasts as FeatureCollection<
          Polygon | MultiPolygon,
          { key?: string }
        >

        map.addSource(OCCUPIED_SOURCE, { type: 'geojson', data: occupied })
        map.addSource(DS_ATTACKS_SOURCE, { type: 'geojson', data: dsAttacks })
        map.addSource(RAIONS_SOURCE, { type: 'geojson', data: raions, promoteId: 'key' })
        map.addSource(OBLASTS_SOURCE, { type: 'geojson', data: oblasts, promoteId: 'key' })
        map.addSource(RUSSIA_SOURCE, { type: 'geojson', data: russia })
        map.addSource(RUSSIA_OBLASTS_SOURCE, {
          type: 'geojson',
          data: russiaOblasts,
          promoteId: 'key',
        })
        map.addSource(THREATS_SOURCE, { type: 'geojson', data: emptyPoints() })
        map.addSource(THREAT_UNCERTAINTY_SOURCE, { type: 'geojson', data: emptyPolygons() })
        map.addSource(TRAILS_SOURCE, { type: 'geojson', data: emptyLines() })
        map.addSource(NEAR_SOURCE, { type: 'geojson', data: emptyPolygons() })
        map.addSource(USER_SOURCE, { type: 'geojson', data: emptyPoints() })
        map.addSource(DSM_SOURCE, { type: 'geojson', data: emptyPoints() })
        map.addSource(NPZ_SOURCE, { type: 'geojson', data: emptyPoints() })
        map.addSource(RU_BPLA_SOURCE, { type: 'geojson', data: emptyPoints() })
        map.addSource(RU_FIX_SOURCE, { type: 'geojson', data: emptyPoints() })
        map.addSource(RU_TRAJ_SOURCE, { type: 'geojson', data: emptyLines() })
        map.addSource(RU_TRAJ_ARROW_SOURCE, { type: 'geojson', data: emptyPoints() })
        map.addSource(GROUND_SOURCE, { type: 'geojson', data: emptyPoints() })
        map.addSource(SIGHTING_SOURCE, { type: 'geojson', data: emptyPoints() })
        map.addSource(POWER_TG_SOURCE, { type: 'geojson', data: emptyPoints() })
        map.addSource(POWER_SIGNAL_SOURCE, { type: 'geojson', data: emptyPolygons() })
        map.addSource(POWER_QUEUE_SOURCE, { type: 'geojson', data: emptyPoints() })
        map.addSource(RF_AV_SOURCE, { type: 'geojson', data: emptyPoints() })
        map.addSource(ERADAR_SOURCE, {
          type: 'geojson',
          data: emptyPolygons(),
          promoteId: 'id',
        })
        map.addSource(DS_UNITS_SOURCE, { type: 'geojson', data: emptyPoints() })

        try {
          registerDsAttackArrow(map)
          registerRuTrajArrow(map)
          registerDsUnitIcons(map)
          registerThreatIcons(map)
          registerGroundIcons(map)
        } catch (iconErr) {
          console.warn('Threat icon registration failed', iconErr)
        }

        const addLayerSafe = (layer: AddLayerObject) => {
          try {
            if (!map.getLayer(layer.id)) map.addLayer(layer)
          } catch (err) {
            console.error(`Failed to add layer ${layer.id}`, err)
          }
        }

        // Soft lift so Ukraine reads brighter than the surrounding dark basemap.
        addLayerSafe({
          id: 'ukraine-land',
          type: 'fill',
          source: OBLASTS_SOURCE,
          paint: {
            'fill-color': '#d7e4f4',
            'fill-opacity': 0.14,
          },
        })

        addLayerSafe({
          id: 'russia-oblasts-fill',
          type: 'fill',
          source: RUSSIA_OBLASTS_SOURCE,
          paint: {
            'fill-color': [
              'case',
              ['==', ['feature-state', 'level'], 'attention'],
              '#f0b429',
              '#e85d4c',
            ],
            'fill-opacity': ['case', ['==', ['feature-state', 'alert'], 1], 0.42, 0],
          },
        })

        addLayerSafe({
          id: 'russia-oblasts-line',
          type: 'line',
          source: RUSSIA_OBLASTS_SOURCE,
          paint: {
            'line-color': [
              'case',
              ['==', ['feature-state', 'alert'], 1],
              '#ff6b6b',
              'rgba(0,0,0,0)',
            ],
            'line-width': 1.4,
            'line-opacity': 0.85,
          },
        })

        addLayerSafe({
          id: 'russia-outline',
          type: 'line',
          source: RUSSIA_SOURCE,
          paint: {
            'line-color': '#ff4d4d',
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              2,
              0.8,
              5,
              1.25,
              8,
              1.75,
            ],
            'line-opacity': 0.72,
          },
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
        })

        addLayerSafe({
          id: 'oblasts-fill',
          type: 'fill',
          source: OBLASTS_SOURCE,
          paint: {
            'fill-color': [
              'case',
              ['==', ['feature-state', 'level'], 'yellow'],
              '#f0b429',
              '#e85d4c',
            ],
            'fill-opacity': ['case', ['==', ['feature-state', 'alert'], 1], 0.18, 0],
          },
        })

        addLayerSafe({
          id: 'raions-fill',
          type: 'fill',
          source: RAIONS_SOURCE,
          paint: {
            'fill-color': [
              'case',
              ['==', ['feature-state', 'level'], 'yellow'],
              '#f0b429',
              '#e85d4c',
            ],
            'fill-opacity': ['case', ['==', ['feature-state', 'alert'], 1], 0.22, 0],
          },
        })

        addLayerSafe({
          id: 'oblasts-line',
          type: 'line',
          source: OBLASTS_SOURCE,
          paint: {
            'line-color': '#c5e8dc',
            'line-opacity': 0.38,
            'line-width': 1.2,
          },
        })

        addLayerSafe({
          id: 'power-oblasts-fill',
          type: 'fill',
          source: OBLASTS_SOURCE,
          layout: { visibility: 'none' },
          paint: {
            'fill-color': [
              'interpolate',
              ['linear'],
              ['coalesce', ['feature-state', 'powerIntensity'], 0],
              0,
              '#2f6b4f',
              0.2,
              '#f0b429',
              0.5,
              '#e85d4c',
              1,
              '#5c1a1a',
            ],
            'fill-opacity': [
              'case',
              ['==', ['feature-state', 'power'], 1],
              [
                'interpolate',
                ['linear'],
                ['coalesce', ['feature-state', 'powerIntensity'], 0],
                0,
                0.28,
                1,
                0.62,
              ],
              0,
            ],
          },
        })

        addLayerSafe({
          id: 'power-oblasts-line',
          type: 'line',
          source: OBLASTS_SOURCE,
          layout: { visibility: 'none' },
          paint: {
            'line-color': '#f5e6c8',
            'line-opacity': 0.55,
            'line-width': 1.4,
          },
        })

        // DeepState gray / unknown control — under occupied so red wins overlaps
        addLayerSafe({
          id: 'unknown-fill',
          type: 'fill',
          source: OCCUPIED_SOURCE,
          filter: ['==', ['get', 'kind'], 'unknown'],
          paint: {
            'fill-color': '#6b7280',
            'fill-opacity': 0.42,
          },
        })

        addLayerSafe({
          id: 'unknown-outline',
          type: 'line',
          source: OCCUPIED_SOURCE,
          filter: ['==', ['get', 'kind'], 'unknown'],
          paint: {
            'line-color': '#4b5563',
            'line-width': 1,
            'line-opacity': 0.75,
          },
        })

        // DeepState occupied territory — above alert fills so Crimea/south stay visible
        addLayerSafe({
          id: 'occupied-fill',
          type: 'fill',
          source: OCCUPIED_SOURCE,
          filter: ['any', ['==', ['get', 'kind'], 'occupied'], ['!', ['has', 'kind']]],
          paint: {
            'fill-color': '#8b0000',
            'fill-opacity': 0.58,
          },
        })

        addLayerSafe({
          id: 'occupied-outline',
          type: 'line',
          source: OCCUPIED_SOURCE,
          filter: ['any', ['==', ['get', 'kind'], 'occupied'], ['!', ['has', 'kind']]],
          paint: {
            'line-color': '#3d0000',
            'line-width': 1.2,
            'line-opacity': 0.9,
          },
        })

        addLayerSafe({
          id: 'ds-attack-arrow',
          type: 'symbol',
          source: DS_ATTACKS_SOURCE,
          layout: {
            visibility: 'none',
            'icon-image': DS_ATTACK_ICON_ID,
            'icon-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              5,
              0.45,
              9,
              0.75,
            ],
            'icon-rotate': ['to-number', ['get', 'bearing']],
            'icon-rotation-alignment': 'map',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          },
          paint: {
            'icon-opacity': 0.92,
          },
        })

        addLayerSafe({
          id: 'ds-unit-icon',
          type: 'symbol',
          source: DS_UNITS_SOURCE,
          layout: {
            visibility: 'none',
            'icon-image': ['get', 'icon'],
            'icon-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              5,
              ['case', ['==', ['to-number', ['get', 'selected']], 1], 0.55, 0.4],
              9,
              ['case', ['==', ['to-number', ['get', 'selected']], 1], 0.85, 0.65],
            ],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
            'text-field': ['step', ['zoom'], '', 8, ['get', 'title']],
            'text-size': 10,
            'text-offset': [0, 1.4],
            'text-anchor': 'top',
            'text-optional': true,
            'text-max-width': 10,
          },
          paint: {
            'icon-opacity': 0.9,
            'text-color': '#f5d0c8',
            'text-halo-color': '#1a0a0a',
            'text-halo-width': 1.2,
          },
        })

        addLayerSafe({
          id: 'near-me-fill',
          type: 'fill',
          source: NEAR_SOURCE,
          paint: {
            'fill-color': '#7dd3c0',
            'fill-opacity': 0.06,
          },
        })

        addLayerSafe({
          id: 'near-me-line',
          type: 'line',
          source: NEAR_SOURCE,
          paint: {
            'line-color': '#7dd3c0',
            'line-width': 1.5,
            'line-opacity': 0.55,
            'line-dasharray': [2, 1.5],
          },
        })

        addLayerSafe({
          id: 'trails-line',
          type: 'line',
          source: TRAILS_SOURCE,
          paint: {
            'line-color': ['get', 'color'],
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              5,
              1.6,
              10,
              2.6,
            ],
            'line-opacity': 0.65,
          },
        })

        addLayerSafe({
          id: 'ru-traj-line',
          type: 'line',
          source: RU_TRAJ_SOURCE,
          paint: {
            'line-color': '#ff8a3d',
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              3,
              1.4,
              6,
              2.2,
              9,
              2.8,
            ],
            'line-opacity': 0.75,
            'line-blur': 0.2,
          },
        })

        addLayerSafe({
          id: 'ru-traj-arrow',
          type: 'symbol',
          source: RU_TRAJ_ARROW_SOURCE,
          layout: {
            'icon-image': ['get', 'icon'],
            'icon-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              3,
              0.35,
              6,
              0.55,
              9,
              0.7,
            ],
            'icon-rotate': ['to-number', ['get', 'bearing']],
            'icon-rotation-alignment': 'map',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          },
          paint: {
            'icon-opacity': 0.9,
          },
        })

        addLayerSafe({
          id: 'ru-fix-halo',
          type: 'circle',
          source: RU_FIX_SOURCE,
          paint: {
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              4,
              6,
              8,
              9,
            ],
            'circle-color': '#ff8a3d',
            'circle-opacity': 0.1,
            'circle-stroke-color': '#ff8a3d',
            'circle-stroke-width': 0.8,
            'circle-stroke-opacity': 0.35,
          },
        })

        addLayerSafe({
          id: 'ru-fix-dot',
          type: 'circle',
          source: RU_FIX_SOURCE,
          paint: {
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              4,
              2.4,
              8,
              3.6,
            ],
            'circle-color': '#ff8a3d',
            'circle-opacity': 0.9,
            'circle-stroke-color': '#2a0a0a',
            'circle-stroke-width': 0.8,
          },
        })

        // TG zones under live tracks so yellow fills never steal clicks from БпЛА/КАБ.
        addLayerSafe({
          id: 'eradar-fill',
          type: 'fill',
          source: ERADAR_SOURCE,
          paint: {
            'fill-color': '#f0a020',
            'fill-opacity': [
              'case',
              ['==', ['to-number', ['get', 'selected']], 1],
              0.2,
              0.1,
            ],
          },
        })

        addLayerSafe({
          id: 'eradar-line',
          type: 'line',
          source: ERADAR_SOURCE,
          paint: {
            'line-color': '#ffc866',
            'line-width': [
              'case',
              ['==', ['to-number', ['get', 'selected']], 1],
              2.2,
              1.4,
            ],
            'line-opacity': 0.85,
            'line-dasharray': [1.6, 1.4],
          },
        })

        addLayerSafe({
          id: 'rf-av-halo',
          type: 'circle',
          source: RF_AV_SOURCE,
          paint: {
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              3,
              ['case', ['==', ['to-number', ['get', 'selected']], 1], 18, 12],
              7,
              ['case', ['==', ['to-number', ['get', 'selected']], 1], 28, 18],
            ],
            'circle-color': '#c4a0ff',
            'circle-opacity': [
              'case',
              ['==', ['to-number', ['get', 'selected']], 1],
              0.35,
              0.2,
            ],
            'circle-blur': 0.45,
          },
        })

        addLayerSafe({
          id: 'rf-av-icon',
          type: 'symbol',
          source: RF_AV_SOURCE,
          layout: {
            'icon-image': ['get', 'icon'],
            'icon-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              3,
              0.55,
              7,
              0.85,
            ],
            'icon-rotate': ['to-number', ['get', 'bearing']],
            'icon-rotation-alignment': 'map',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
            'text-field': ['get', 'airbase'],
            'text-size': 10,
            'text-offset': [0, 1.6],
            'text-anchor': 'top',
            'text-optional': true,
            'text-allow-overlap': false,
          },
          paint: {
            'icon-opacity': 0.95,
            'text-color': '#e8d6ff',
            'text-halo-color': '#1a0828',
            'text-halo-width': 1.2,
          },
        })

        // Uncertainty ≈ report precision in real km (geodesic), not zoom-scaled pixels.
        addLayerSafe({
          id: 'threat-uncertainty',
          type: 'fill',
          source: THREAT_UNCERTAINTY_SOURCE,
          paint: {
            'fill-color': ['get', 'color'],
            'fill-opacity': [
              'case',
              ['==', ['to-number', ['get', 'nearby']], 0],
              0.03,
              ['==', ['to-number', ['get', 'approx']], 1],
              0.12,
              0.08,
            ],
            'fill-outline-color': ['get', 'color'],
          },
        })

        addLayerSafe({
          id: 'threat-halo',
          type: 'circle',
          source: THREATS_SOURCE,
          paint: {
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              5,
              ['case', ['==', ['to-number', ['get', 'selected']], 1], 16, 11],
              10,
              ['case', ['==', ['to-number', ['get', 'selected']], 1], 22, 15],
            ],
            'circle-color': ['get', 'color'],
            'circle-opacity': [
              'case',
              ['==', ['to-number', ['get', 'nearby']], 0],
              0.04,
              ['==', ['to-number', ['get', 'selected']], 1],
              0.28,
              ['==', ['to-number', ['get', 'ended']], 1],
              0.1,
              0.14,
            ],
            'circle-blur': 0.65,
          },
        })

        addLayerSafe({
          id: 'threat-icon',
          type: 'symbol',
          source: THREATS_SOURCE,
          layout: {
            'icon-image': ['get', 'icon'],
            'icon-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              5,
              [
                'case',
                ['==', ['to-number', ['get', 'selected']], 1],
                0.78,
                ['==', ['to-number', ['get', 'nearby']], 0],
                0.42,
                0.62,
              ],
              10,
              [
                'case',
                ['==', ['to-number', ['get', 'selected']], 1],
                1.15,
                ['==', ['to-number', ['get', 'nearby']], 0],
                0.58,
                0.92,
              ],
            ],
            'icon-rotate': [
              'case',
              ['==', ['to-number', ['get', 'rotate']], 1],
              ['to-number', ['get', 'heading']],
              0,
            ],
            'icon-rotation-alignment': 'map',
            'icon-pitch-alignment': 'map',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
            'symbol-sort-key': [
              '-',
              10,
              ['to-number', ['get', 'priority']],
            ],
          },
          paint: {
            'icon-opacity': [
              'case',
              ['==', ['to-number', ['get', 'nearby']], 0],
              0.28,
              ['==', ['to-number', ['get', 'ended']], 1],
              0.85,
              ['==', ['to-number', ['get', 'advisory']], 1],
              0.75,
              1,
            ],
          },
        })

        addLayerSafe({
          id: 'threat-ended-label',
          type: 'symbol',
          source: THREATS_SOURCE,
          filter: ['==', ['to-number', ['get', 'ended']], 1],
          layout: {
            'text-field': [
              'case',
              ['==', ['get', 'endKind'], 'shot_down'],
              'Збито',
              'Зникло',
            ],
            'text-size': 11,
            'text-offset': [0, 1.7],
            'text-allow-overlap': true,
            'text-ignore-placement': true,
          },
          paint: {
            'text-color': [
              'case',
              ['==', ['get', 'endKind'], 'shot_down'],
              '#c5d0dc',
              '#9ca3af',
            ],
            'text-halo-color': '#0b1220',
            'text-halo-width': 1.4,
            'text-opacity': 0.9,
          },
        })

        addLayerSafe({
          id: 'dsm-icon',
          type: 'symbol',
          source: DSM_SOURCE,
          layout: {
            'icon-image': ['get', 'icon'],
            'icon-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              4,
              0.55,
              8,
              0.85,
            ],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          },
          paint: { 'icon-opacity': 1 },
        })

        addLayerSafe({
          id: 'npz-icon',
          type: 'symbol',
          source: NPZ_SOURCE,
          layout: {
            'icon-image': ['get', 'icon'],
            'icon-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              4,
              0.55,
              8,
              0.85,
            ],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          },
          paint: { 'icon-opacity': 1 },
        })

        addLayerSafe({
          id: 'ground-halo',
          type: 'circle',
          source: GROUND_SOURCE,
          layout: { visibility: 'none' },
          paint: {
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              4,
              ['case', ['==', ['to-number', ['get', 'selected']], 1], 14, 9],
              9,
              ['case', ['==', ['to-number', ['get', 'selected']], 1], 20, 13],
            ],
            'circle-color': ABROAD_ICON_COLOR,
            'circle-opacity': [
              'case',
              ['==', ['to-number', ['get', 'selected']], 1],
              0.3,
              0.14,
            ],
            'circle-blur': 0.55,
          },
        })

        addLayerSafe({
          id: 'ground-icon',
          type: 'symbol',
          source: GROUND_SOURCE,
          layout: {
            visibility: 'none',
            'icon-image': ['get', 'icon'],
            'icon-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              4,
              ['case', ['==', ['to-number', ['get', 'selected']], 1], 0.72, 0.55],
              9,
              ['case', ['==', ['to-number', ['get', 'selected']], 1], 1.05, 0.82],
            ],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          },
          paint: { 'icon-opacity': 1 },
        })

        addLayerSafe({
          id: 'sighting-halo',
          type: 'circle',
          source: SIGHTING_SOURCE,
          layout: { visibility: 'none' },
          paint: {
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              4,
              [
                'case',
                ['==', ['to-number', ['get', 'selected']], 1],
                ['case', ['==', ['to-number', ['get', 'placeApprox']], 1], 18, 14],
                ['case', ['==', ['to-number', ['get', 'placeApprox']], 1], 13, 9],
              ],
              9,
              [
                'case',
                ['==', ['to-number', ['get', 'selected']], 1],
                ['case', ['==', ['to-number', ['get', 'placeApprox']], 1], 26, 20],
                ['case', ['==', ['to-number', ['get', 'placeApprox']], 1], 18, 13],
              ],
            ],
            'circle-color': '#f0b429',
            'circle-opacity': [
              'case',
              ['==', ['to-number', ['get', 'selected']], 1],
              0.28,
              ['case', ['==', ['to-number', ['get', 'placeApprox']], 1], 0.18, 0.12],
            ],
            'circle-blur': 0.55,
          },
        })

        addLayerSafe({
          id: 'sighting-icon',
          type: 'symbol',
          source: SIGHTING_SOURCE,
          layout: {
            visibility: 'none',
            'icon-image': ['get', 'icon'],
            'icon-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              4,
              ['case', ['==', ['to-number', ['get', 'selected']], 1], 0.72, 0.55],
              9,
              ['case', ['==', ['to-number', ['get', 'selected']], 1], 1.05, 0.82],
            ],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          },
          paint: {
            'icon-opacity': [
              'case',
              ['==', ['to-number', ['get', 'placeApprox']], 1],
              0.72,
              1,
            ],
          },
        })

        addLayerSafe({
          id: 'ru-bpla-icon',
          type: 'symbol',
          source: RU_BPLA_SOURCE,
          layout: {
            'icon-image': ['get', 'icon'],
            'icon-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              3,
              0.38,
              5,
              0.5,
              7,
              0.62,
              9,
              0.72,
            ],
            'icon-rotate': [
              'case',
              ['==', ['to-number', ['get', 'rotate']], 1],
              ['to-number', ['get', 'bearing']],
              0,
            ],
            'icon-rotation-alignment': 'map',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
            'text-field': ['step', ['zoom'], '', 6.5, ['get', 'title']],
            'text-size': 10,
            'text-offset': [0, 1.25],
            'text-anchor': 'top',
            'text-optional': true,
            'text-max-width': 10,
          },
          paint: {
            'icon-opacity': 0.95,
            'text-color': '#ffd0a8',
            'text-halo-color': '#1a0800',
            'text-halo-width': 1.1,
          },
        })

        addLayerSafe({
          id: 'power-signal-fill',
          type: 'fill',
          source: POWER_SIGNAL_SOURCE,
          layout: { visibility: 'none' },
          paint: {
            'fill-color': '#d94cff',
            'fill-opacity': [
              'case',
              ['==', ['to-number', ['get', 'selected']], 1],
              0.32,
              0.2,
            ],
          },
        })

        addLayerSafe({
          id: 'power-signal-line',
          type: 'line',
          source: POWER_SIGNAL_SOURCE,
          layout: { visibility: 'none' },
          paint: {
            'line-color': '#f0b0ff',
            'line-width': [
              'case',
              ['==', ['to-number', ['get', 'selected']], 1],
              2.8,
              2,
            ],
            'line-opacity': 0.95,
            'line-dasharray': [2, 1.2],
          },
        })

        addLayerSafe({
          id: 'power-tg-halo',
          type: 'circle',
          source: POWER_TG_SOURCE,
          layout: { visibility: 'none' },
          paint: {
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              4,
              ['case', ['==', ['to-number', ['get', 'selected']], 1], 16, 11],
              9,
              ['case', ['==', ['to-number', ['get', 'selected']], 1], 24, 16],
            ],
            'circle-color': '#e85d4c',
            'circle-opacity': [
              'case',
              ['==', ['to-number', ['get', 'selected']], 1],
              0.32,
              0.18,
            ],
            'circle-blur': 0.5,
          },
        })

        addLayerSafe({
          id: 'power-tg-dot',
          type: 'circle',
          source: POWER_TG_SOURCE,
          layout: { visibility: 'none' },
          paint: {
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              4,
              ['case', ['==', ['to-number', ['get', 'selected']], 1], 7, 5],
              9,
              ['case', ['==', ['to-number', ['get', 'selected']], 1], 10, 7],
            ],
            'circle-color': '#e85d4c',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#1a0800',
            'circle-opacity': 0.95,
          },
        })

        addLayerSafe({
          id: 'power-queue-halo',
          type: 'circle',
          source: POWER_QUEUE_SOURCE,
          layout: { visibility: 'none' },
          paint: {
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              4,
              ['case', ['==', ['to-number', ['get', 'selected']], 1], 20, 14],
              9,
              ['case', ['==', ['to-number', ['get', 'selected']], 1], 28, 20],
            ],
            'circle-color': [
              'case',
              ['==', ['to-number', ['get', 'off']], 1],
              '#e85d4c',
              '#2f6b4f',
            ],
            'circle-opacity': 0.28,
            'circle-blur': 0.45,
          },
        })

        addLayerSafe({
          id: 'power-queue-dot',
          type: 'circle',
          source: POWER_QUEUE_SOURCE,
          layout: { visibility: 'none' },
          paint: {
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              4,
              ['case', ['==', ['to-number', ['get', 'selected']], 1], 9, 7],
              9,
              ['case', ['==', ['to-number', ['get', 'selected']], 1], 12, 9],
            ],
            'circle-color': [
              'case',
              ['==', ['to-number', ['get', 'off']], 1],
              '#e85d4c',
              '#3d9b6a',
            ],
            'circle-stroke-width': 2.5,
            'circle-stroke-color': '#f5e6c8',
            'circle-opacity': 1,
          },
        })

        addLayerSafe({
          id: 'user-dot',
          type: 'circle',
          source: USER_SOURCE,
          paint: {
            'circle-radius': 6,
            'circle-color': '#7dd3c0',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#0b1220',
          },
        })

        map.on('click', (e) => {
          const mode = mapModeRef.current
          if (mode === 'light') {
            const queueLayers = ['power-queue-dot', 'power-queue-halo'].filter((id) =>
              map.getLayer(id),
            )
            const queueHits = queueLayers.length
              ? map.queryRenderedFeatures(e.point, { layers: queueLayers })
              : []
            const queueId = queueHits[0]?.properties?.id
            if (typeof queueId === 'string' && queueId) {
              onSelectRef.current(queueId === selectedRef.current ? null : queueId)
              return
            }
            const tgLayers = ['power-tg-dot', 'power-tg-halo'].filter((id) =>
              map.getLayer(id),
            )
            const tgHits = tgLayers.length
              ? map.queryRenderedFeatures(e.point, { layers: tgLayers })
              : []
            const tgId = tgHits[0]?.properties?.id
            if (typeof tgId === 'string' && tgId) {
              onSelectRef.current(tgId === selectedRef.current ? null : tgId)
              return
            }
            const signalLayers = ['power-signal-fill', 'power-signal-line'].filter((id) =>
              map.getLayer(id),
            )
            const signalHits = signalLayers.length
              ? map.queryRenderedFeatures(e.point, { layers: signalLayers })
              : []
            const primary = primaryMarkerIdFromSignalProps(
              signalHits[0]?.properties as {
                primaryMarkerId?: string
                markerIds?: string
              } | null,
            )
            if (primary) {
              const sid = powerTgSelectId(primary)
              onSelectRef.current(sid === selectedRef.current ? null : sid)
              return
            }
            const layers = ['power-oblasts-fill'].filter((id) => map.getLayer(id))
            const hits = layers.length
              ? map.queryRenderedFeatures(e.point, { layers })
              : []
            const key = hits[0]?.properties?.key ?? hits[0]?.id
            if (typeof key === 'string' && key) {
              const sid = powerSelectId(key)
              onSelectRef.current(sid === selectedRef.current ? null : sid)
              return
            }
            onSelectRef.current(null)
            return
          }
          const preferGround = mode === 'ground'
          const hitLayers = (
            preferGround
              ? [
                  'sighting-icon',
                  'sighting-halo',
                  'ground-icon',
                  'ground-halo',
                  'ds-unit-icon',
                ]
              : [
                  'npz-icon',
                  'dsm-icon',
                  'ru-bpla-icon',
                  'rf-av-icon',
                  'rf-av-halo',
                  'threat-icon',
                  'threat-halo',
                  'eradar-fill',
                  'eradar-line',
                ]
          ).filter((id) => map.getLayer(id))
          const hits = hitLayers.length
            ? map.queryRenderedFeatures(e.point, { layers: hitLayers })
            : []
          // Prefer live tracks over TG zone fills when stacks overlap.
          const hit =
            hits.find((f) => {
              const lid = f.layer?.id
              return lid !== 'eradar-fill' && lid !== 'eradar-line'
            }) ?? hits[0]
          const rawId = hit?.properties?.id ?? hit?.id
          const id = rawId != null ? String(rawId) : ''
          if (id) {
            onSelectRef.current(id === selectedRef.current ? null : id)
            return
          }
          onSelectRef.current(null)
        })

        for (const layerId of [
          'threat-icon',
          'threat-halo',
          'dsm-icon',
          'npz-icon',
          'ru-bpla-icon',
          'rf-av-icon',
          'rf-av-halo',
          'eradar-fill',
          'eradar-line',
          'ground-icon',
          'ground-halo',
          'sighting-icon',
          'sighting-halo',
          'ds-unit-icon',
          'power-oblasts-fill',
          'power-signal-fill',
          'power-tg-dot',
          'power-tg-halo',
          'power-queue-dot',
          'power-queue-halo',
        ]) {
          map.on('mouseenter', layerId, () => {
            map.getCanvas().style.cursor = 'pointer'
          })
          map.on('mouseleave', layerId, () => {
            map.getCanvas().style.cursor = ''
          })
        }

        setReady(true)
        ;(window as unknown as { __alertMap?: MapLibreMap }).__alertMap = map
      } catch (err) {
        console.error('Map bootstrap failed', err)
      }
    })

    return () => {
      cancelled = true
      setReady(false)
      if (import.meta.env.DEV) {
        delete (window as unknown as { __alertMap?: MapLibreMap }).__alertMap
      }
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const air = mapMode === 'air'
    const ground = mapMode === 'ground'
    const light = mapMode === 'light'
    setLayersVisibility(map, AIR_LAYER_IDS, air)
    setLayersVisibility(map, GROUND_LAYER_IDS, ground)
    setLayersVisibility(map, POWER_LAYER_IDS, light)
    // Hide UA alert fills in light mode; keep oblast outlines for context.
    if (map.getLayer('oblasts-fill')) {
      map.setLayoutProperty('oblasts-fill', 'visibility', air ? 'visible' : 'none')
    }
    if (map.getLayer('raions-fill')) {
      map.setLayoutProperty('raions-fill', 'visibility', air ? 'visible' : 'none')
    }
    if (map.getLayer('oblasts-line')) {
      map.setLayoutProperty('oblasts-line', 'visibility', light ? 'none' : 'visible')
    }

    // Stronger DeepState occupied context when browsing ground markers.
    if (map.getLayer('occupied-fill')) {
      map.setPaintProperty('occupied-fill', 'fill-opacity', air ? 0.58 : ground ? 0.72 : 0.35)
    }
    if (map.getLayer('occupied-outline')) {
      map.setPaintProperty('occupied-outline', 'line-opacity', air ? 0.9 : ground ? 1 : 0.55)
      map.setPaintProperty('occupied-outline', 'line-width', air ? 1.2 : ground ? 1.6 : 1)
    }
    if (map.getLayer('unknown-fill')) {
      map.setPaintProperty('unknown-fill', 'fill-opacity', air ? 0.42 : ground ? 0.55 : 0.25)
    }
    if (map.getLayer('unknown-outline')) {
      map.setPaintProperty('unknown-outline', 'line-opacity', air ? 0.75 : ground ? 0.9 : 0.45)
    }
  }, [mapMode, ready])

  // Smooth dead-reckoning on the map thread (~60fps), independent of React renders.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || mapMode !== 'air') return
    const srcPoints = map.getSource(THREATS_SOURCE) as GeoJSONSource | undefined
    const srcTrails = map.getSource(TRAILS_SOURCE) as GeoJSONSource | undefined
    const srcUnc = map.getSource(THREAT_UNCERTAINTY_SOURCE) as GeoJSONSource | undefined
    if (!srcPoints || !srcTrails || !srcUnc) return

    let raf = 0
    let lastPaint = 0
    const paint = (ts: number) => {
      if (ts - lastPaint >= 33) {
        lastPaint = ts
        const { points, trails, uncertainty } = buildThreatFeatures(
          threatsRef.current,
          Date.now(),
          filterRef.current,
          selectedRef.current,
          nearbyIdsRef.current,
        )
        srcPoints.setData(points)
        srcTrails.setData(trails)
        srcUnc.setData(uncertainty)
      }
      raf = requestAnimationFrame(paint)
    }
    raf = requestAnimationFrame(paint)
    return () => cancelAnimationFrame(raf)
  }, [ready, threats, filter, selectedId, nearbyIds, mapMode])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const src = map.getSource(DSM_SOURCE) as GeoJSONSource | undefined
    src?.setData(mapMode === 'air' ? buildDsmFeatures(dsmStrikes) : emptyPoints())
  }, [dsmStrikes, ready, mapMode])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const src = map.getSource(ERADAR_SOURCE) as GeoJSONSource | undefined
    src?.setData(
      mapMode === 'air' ? buildEradarFeatures(eradarZones, selectedId) : emptyPolygons(),
    )
  }, [eradarZones, selectedId, ready, mapMode])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const src = map.getSource(RF_AV_SOURCE) as GeoJSONSource | undefined
    src?.setData(
      mapMode === 'air' ? buildRfAviationFeatures(rfAviation, selectedId) : emptyPoints(),
    )
  }, [rfAviation, selectedId, ready, mapMode])

  // Off-screen airbase cues on the viewport edge (direction toward RF).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return

    const refresh = () => {
      if (mapModeRef.current !== 'air' || rfAviationRef.current.length === 0) {
        setEdgeCues([])
        return
      }
      const canvas = map.getCanvas()
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      const cues = computeRfAvEdgeCues(
        rfAviationRef.current,
        (lon, lat) => map.project([lon, lat]),
        w,
        h,
        selectedRef.current,
      )
      setEdgeCues(cues)
    }

    refresh()
    map.on('move', refresh)
    map.on('resize', refresh)
    return () => {
      map.off('move', refresh)
      map.off('resize', refresh)
    }
  }, [ready, rfAviation, selectedId, mapMode])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const src = map.getSource(NPZ_SOURCE) as GeoJSONSource | undefined
    src?.setData(mapMode === 'air' ? buildNpzFeatures(burningRefineries) : emptyPoints())
  }, [burningRefineries, ready, mapMode])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const src = map.getSource(GROUND_SOURCE) as GeoJSONSource | undefined
    src?.setData(
      mapMode === 'ground' ? buildGroundFeatures(groundLosses, selectedId) : emptyPoints(),
    )
  }, [groundLosses, selectedId, ready, mapMode])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const src = map.getSource(SIGHTING_SOURCE) as GeoJSONSource | undefined
    src?.setData(
      mapMode === 'ground' ? buildSightingFeatures(rfSightings, selectedId) : emptyPoints(),
    )
  }, [rfSightings, selectedId, ready, mapMode])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const src = map.getSource(DS_UNITS_SOURCE) as GeoJSONSource | undefined
    src?.setData(
      mapMode === 'ground'
        ? buildDsUnitFeatures(dsUnits, selectedId, groundFilter)
        : emptyPoints(),
    )
  }, [dsUnits, selectedId, ready, mapMode, groundFilter])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    if (!map.getSource(RAIONS_SOURCE) || !map.getSource(OBLASTS_SOURCE)) return

    const totAlerts = ruAlerts.filter((a) => a.layer === 'ua-tot')
    const raionKeys = new Set(alerts.map((a) => a.key))
    const oblastKeys = new Set([
      ...alertOblasts.map((a) => a.key),
      ...totAlerts.map((a) => a.key),
    ])
    const raionLevels = new Map(alerts.map((a) => [a.key, a.level ?? 'red']))
    const oblastLevels = new Map(alertOblasts.map((a) => [a.key, a.level ?? 'red']))
    for (const a of totAlerts) oblastLevels.set(a.key, a.level === 'attention' ? 'yellow' : 'red')

    syncAlertStates(map, RAIONS_SOURCE, raionKeys, raionLevels, prevRaionKeys.current)
    syncAlertStates(map, OBLASTS_SOURCE, oblastKeys, oblastLevels, prevOblastKeys.current)
    // Track TOT keys so a later empty ruAlerts poll still clears via oblastKeys merge.
    prevTotAlertKeys.current = new Set(totAlerts.map((a) => a.key))
  }, [alerts, alertOblasts, ruAlerts, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !map.getSource(OBLASTS_SOURCE)) return
    syncPowerStates(map, OBLASTS_SOURCE, powerOblasts, prevPowerKeys.current)
  }, [powerOblasts, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const src = map.getSource(POWER_TG_SOURCE) as GeoJSONSource | undefined
    src?.setData(
      mapMode === 'light' ? buildPowerTgFeatures(powerTgMarkers, selectedId) : emptyPoints(),
    )
  }, [powerTgMarkers, selectedId, ready, mapMode])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const src = map.getSource(POWER_SIGNAL_SOURCE) as GeoJSONSource | undefined
    src?.setData(
      mapMode === 'light'
        ? buildPowerSignalFeatures(powerTgMarkers, powerOblastsFcRef.current, selectedId)
        : emptyPolygons(),
    )
  }, [powerTgMarkers, selectedId, ready, mapMode])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const src = map.getSource(POWER_QUEUE_SOURCE) as GeoJSONSource | undefined
    src?.setData(
      mapMode === 'light' ? buildPowerQueueFeatures(powerQueue, selectedId) : emptyPoints(),
    )
  }, [powerQueue, selectedId, ready, mapMode])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const ruOnly = ruAlerts.filter((a) => a.layer !== 'ua-tot')
    const keys = new Set(ruOnly.map((a) => a.key))
    const levels = new Map(ruOnly.map((a) => [a.key, a.level]))
    syncAlertStates(map, RUSSIA_OBLASTS_SOURCE, keys, levels, prevRuAlertKeys.current)

    const bplaSrc = map.getSource(RU_BPLA_SOURCE) as GeoJSONSource | undefined
    const fixSrc = map.getSource(RU_FIX_SOURCE) as GeoJSONSource | undefined
    const trajSrc = map.getSource(RU_TRAJ_SOURCE) as GeoJSONSource | undefined
    const arrowSrc = map.getSource(RU_TRAJ_ARROW_SOURCE) as GeoJSONSource | undefined
    // Icons only — no experimental corridor lines/dots.
    fixSrc?.setData(emptyPoints())
    trajSrc?.setData(emptyLines())
    arrowSrc?.setData(emptyPoints())
    bplaSrc?.setData(
      mapMode === 'air'
        ? buildRuBplaFeatures(ruAlerts, ruTrajectories, ruCentroidsRef.current)
        : emptyPoints(),
    )
  }, [ruAlerts, ruTrajectories, ready, mapMode])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const src = map.getSource(USER_SOURCE) as GeoJSONSource | undefined
    const nearSrc = map.getSource(NEAR_SOURCE) as GeoJSONSource | undefined
    if (!src) return
    if (!userLocation) {
      src.setData(emptyPoints())
      nearSrc?.setData(emptyPolygons())
      return
    }
    src.setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Point',
            coordinates: [userLocation.lon, userLocation.lat],
          },
        },
      ],
    })
    if (nearSrc) {
      nearSrc.setData(
        nearMeRadiusKm != null
          ? circlePolygon(userLocation.lon, userLocation.lat, nearMeRadiusKm)
          : emptyPolygons(),
      )
    }
  }, [userLocation, nearMeRadiusKm, ready])

  useEffect(() => {
    if (!locateToken || !userLocation || !mapRef.current) return
    const zoom = nearMeRadiusKm != null ? Math.max(mapRef.current.getZoom(), 7.2) : Math.max(mapRef.current.getZoom(), FLY_TO_ZOOM)
    mapRef.current.flyTo({
      center: [userLocation.lon, userLocation.lat],
      zoom,
      essential: true,
      duration: 900,
    })
  }, [locateToken, userLocation, nearMeRadiusKm])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !selectedId) return
    if (mapMode === 'ground') {
      const loss = groundLosses.find((l) => l.id === selectedId)
      if (loss) {
        map.easeTo({
          center: [loss.lon, loss.lat],
          zoom: Math.max(map.getZoom(), FLY_TO_ZOOM - 0.4),
          duration: 650,
        })
        return
      }
      const sight = rfSightings.find((s) => s.id === selectedId)
      if (sight) {
        map.easeTo({
          center: [sight.lon, sight.lat],
          zoom: Math.max(map.getZoom(), FLY_TO_ZOOM - 0.4),
          duration: 650,
        })
        return
      }
      const unit = dsUnits.find((u) => u.id === selectedId)
      if (unit) {
        map.easeTo({
          center: [unit.lon, unit.lat],
          zoom: Math.max(map.getZoom(), FLY_TO_ZOOM - 0.4),
          duration: 650,
        })
      }
      return
    }
    if (mapMode === 'light') {
      if (selectedId === POWER_QUEUE_SELECT_ID && powerQueue) {
        map.easeTo({
          center: [powerQueue.lon, powerQueue.lat],
          zoom: Math.max(map.getZoom(), FLY_TO_ZOOM - 0.4),
          duration: 650,
        })
        return
      }
      const tg = powerTgMarkers.find((m) => powerTgSelectId(m.id) === selectedId)
      if (tg) {
        map.easeTo({
          center: [tg.lon, tg.lat],
          zoom: Math.max(map.getZoom(), FLY_TO_ZOOM - 0.4),
          duration: 650,
        })
      }
      return
    }
    const threat = threats.find((t) => t.id === selectedId)
    if (threat && !threat.areaOnly) {
      const p = predict(threat, Date.now())
      map.easeTo({
        center: [p.lon, p.lat],
        zoom: Math.max(map.getZoom(), FLY_TO_ZOOM - 0.4),
        duration: 650,
      })
      return
    }
    const strike = dsmStrikes.find((s) => s.id === selectedId)
    if (strike) {
      map.easeTo({
        center: [strike.lon, strike.lat],
        zoom: Math.max(map.getZoom(), FLY_TO_ZOOM - 0.4),
        duration: 650,
      })
      return
    }
    const site = burningRefineries.find((s) => s.id === selectedId)
    if (site) {
      map.easeTo({
        center: [site.lon, site.lat],
        zoom: Math.max(map.getZoom(), FLY_TO_ZOOM - 0.4),
        duration: 650,
      })
    }
  }, [
    selectedId,
    threats,
    dsmStrikes,
    burningRefineries,
    groundLosses,
    rfSightings,
    dsUnits,
    powerTgMarkers,
    powerQueue,
    mapMode,
  ])

  return (
    <div className="map-shell">
      <div className="map-root" ref={containerRef} role="presentation" />
      {mapMode === 'air' && edgeCues.length > 0 ? (
        <div className="rf-av-edge-layer">
          {edgeCues.map((cue) => (
            <button
              key={cue.id}
              type="button"
              className={`rf-av-edge${cue.selected ? ' is-selected' : ''}`}
              style={{ left: cue.x, top: cue.y }}
              title={`${cue.title} · ${cue.airbase}`}
              aria-label={`${cue.title}, ${cue.airbase}, напрям вильоту`}
              onClick={(ev) => {
                ev.stopPropagation()
                onSelect(cue.selectId === selectedId ? null : cue.selectId)
              }}
            >
              <span
                className="rf-av-edge-arrows"
                style={{ transform: `rotate(${cue.inboundDeg}deg)` }}
              >
                <span className="rf-av-edge-chevron" />
                <span className="rf-av-edge-chevron" />
                <span className="rf-av-edge-chevron" />
              </span>
              <img className="rf-av-edge-icon" src={edgeIconUrl.current} alt="" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
