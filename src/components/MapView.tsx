import { useEffect, useRef, useState } from 'react'
import maplibregl, {
  type AddLayerObject,
  type GeoJSONSource,
  type Map as MapLibreMap,
} from 'maplibre-gl'
import type { FeatureCollection, LineString, Point } from 'geojson'
import {
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
  endKindColor,
  isEndedThreat,
  type DisplayThreat,
} from '../lib/threatDisplay'
import {
  strikeIconKind,
  type BurningRefinery,
  type DsmStrike,
} from '../lib/droneStrikeMap'
import type { RuAlertZone } from '../lib/ruAlerts'
import {
  FIRE_ICON_ID,
  iconIdForType,
  registerThreatIcons,
} from '../lib/threatIcons'

type Props = {
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
}

const THREATS_SOURCE = 'threats'
const TRAILS_SOURCE = 'trails'
const RAIONS_SOURCE = 'raions'
const OBLASTS_SOURCE = 'oblasts'
const OCCUPIED_SOURCE = 'occupied'
const USER_SOURCE = 'user'
const NEAR_SOURCE = 'near-me'
const DSM_SOURCE = 'dsm-strikes'
const NPZ_SOURCE = 'npz-fires'
const RUSSIA_SOURCE = 'russia-outline'
const RUSSIA_OBLASTS_SOURCE = 'russia-oblasts'

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

/** Approximate geodesic circle for near-me radius ring. */
function circlePolygon(lon: number, lat: number, radiusKm: number, steps = 64): FeatureCollection {
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
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [coords] },
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
    // NEPTUN/MAPA markers stay white (ended = gray variants).
    const color = ended && threat.endKind ? endKindColor(threat.endKind) : meta.hex
    const flying = !ended && !areaOnly && predicted?.flying ? 1 : 0
    const rotate = !ended && !areaOnly && courseDeg != null ? 1 : 0
    const isGroup = threat.type === 'uav' && !ended && (threat.count ?? 0) > 1
    const icon = iconIdForType(threat.type, ended ? threat.endKind : null, false, isGroup)

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
        uncertaintyKm: ended
          ? 3
          : (threat.uncertaintyKm ??
            (threat.positionQuality === 'confirmed' || threat.positionQuality === 'mapa' ? 5 : 10)),
        priority: ended ? 0 : meta.priority,
        approx: threat.positionQuality === 'approx' || areaOnly || ended ? 1 : 0,
      },
      geometry: { type: 'Point', coordinates: [lon, lat] },
    })

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
          color: ended ? endKindColor('vanished') : meta.hex,
        },
        geometry: { type: 'LineString', coordinates: coords },
      })
    }
  }

  return { points, trails }
}

function buildDsmFeatures(strikes: DsmStrike[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: strikes.map((s) => {
      const kind = strikeIconKind(s.weapons)
      return {
        type: 'Feature' as const,
        id: s.id,
        properties: {
          id: s.id,
          title: `${s.place || s.region} · ${s.date}`,
          summary: s.summary,
          icon: iconIdForType(kind, null, true),
        },
        geometry: { type: 'Point' as const, coordinates: [s.lon, s.lat] },
      }
    }),
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

export function MapView({
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
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const [ready, setReady] = useState(false)
  const selectedRef = useRef(selectedId)
  const onSelectRef = useRef(onSelect)
  const threatsRef = useRef(threats)
  const filterRef = useRef(filter)
  const nearbyIdsRef = useRef(nearbyIds)
  const prevRaionKeys = useRef(new Set<string>())
  const prevOblastKeys = useRef(new Set<string>())
  const prevRuAlertKeys = useRef(new Set<string>())

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
        let raions: FeatureCollection = emptyPoints() as FeatureCollection
        let oblasts: FeatureCollection = emptyPoints() as FeatureCollection
        let occupied: FeatureCollection = emptyPoints() as FeatureCollection
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
        if (cancelled) return

        map.addSource(OCCUPIED_SOURCE, { type: 'geojson', data: occupied })
        map.addSource(RAIONS_SOURCE, { type: 'geojson', data: raions, promoteId: 'key' })
        map.addSource(OBLASTS_SOURCE, { type: 'geojson', data: oblasts, promoteId: 'key' })
        map.addSource(RUSSIA_SOURCE, { type: 'geojson', data: russia })
        map.addSource(RUSSIA_OBLASTS_SOURCE, {
          type: 'geojson',
          data: russiaOblasts,
          promoteId: 'key',
        })
        map.addSource(THREATS_SOURCE, { type: 'geojson', data: emptyPoints() })
        map.addSource(TRAILS_SOURCE, { type: 'geojson', data: emptyLines() })
        map.addSource(NEAR_SOURCE, { type: 'geojson', data: emptyPolygons() })
        map.addSource(USER_SOURCE, { type: 'geojson', data: emptyPoints() })
        map.addSource(DSM_SOURCE, { type: 'geojson', data: emptyPoints() })
        map.addSource(NPZ_SOURCE, { type: 'geojson', data: emptyPoints() })

        try {
          registerThreatIcons(map)
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
            'fill-opacity': ['case', ['==', ['feature-state', 'alert'], 1], 0.28, 0],
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
            'line-width': 1.1,
            'line-opacity': 0.7,
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

        // Uncertainty halo ≈ report precision (city/corridor), not radar CEP
        addLayerSafe({
          id: 'threat-uncertainty',
          type: 'circle',
          source: THREATS_SOURCE,
          filter: ['==', ['to-number', ['get', 'areaOnly']], 0],
          paint: {
            'circle-radius': [
              'interpolate',
              ['exponential', 2],
              ['zoom'],
              5,
              ['*', ['to-number', ['get', 'uncertaintyKm']], 1.1],
              8,
              ['*', ['to-number', ['get', 'uncertaintyKm']], 3.2],
              11,
              ['*', ['to-number', ['get', 'uncertaintyKm']], 9],
            ],
            'circle-color': ['get', 'color'],
            'circle-opacity': [
              'case',
              ['==', ['to-number', ['get', 'nearby']], 0],
              0.03,
              ['==', ['to-number', ['get', 'approx']], 1],
              0.14,
              0.1,
            ],
            'circle-stroke-color': ['get', 'color'],
            'circle-stroke-width': 1,
            'circle-stroke-opacity': [
              'case',
              ['==', ['to-number', ['get', 'nearby']], 0],
              0.08,
              0.35,
            ],
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
              0.48,
              8,
              0.72,
            ],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          },
          paint: { 'icon-opacity': 0.95 },
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
          const hitLayers = ['npz-icon', 'dsm-icon', 'threat-icon', 'threat-halo'].filter(
            (id) => map.getLayer(id),
          )
          const hits = hitLayers.length
            ? map.queryRenderedFeatures(e.point, { layers: hitLayers })
            : []
          const id = hits[0]?.properties?.id
          if (typeof id === 'string') {
            onSelectRef.current(id === selectedRef.current ? null : id)
            return
          }
          onSelectRef.current(null)
        })

        for (const layerId of ['threat-icon', 'threat-halo', 'dsm-icon', 'npz-icon']) {
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

  // Smooth dead-reckoning on the map thread (~60fps), independent of React renders.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const srcPoints = map.getSource(THREATS_SOURCE) as GeoJSONSource | undefined
    const srcTrails = map.getSource(TRAILS_SOURCE) as GeoJSONSource | undefined
    if (!srcPoints || !srcTrails) return

    let raf = 0
    let lastPaint = 0
    const paint = (ts: number) => {
      if (ts - lastPaint >= 33) {
        lastPaint = ts
        const { points, trails } = buildThreatFeatures(
          threatsRef.current,
          Date.now(),
          filterRef.current,
          selectedRef.current,
          nearbyIdsRef.current,
        )
        srcPoints.setData(points)
        srcTrails.setData(trails)
      }
      raf = requestAnimationFrame(paint)
    }
    raf = requestAnimationFrame(paint)
    return () => cancelAnimationFrame(raf)
  }, [ready, threats, filter, selectedId, nearbyIds])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const src = map.getSource(DSM_SOURCE) as GeoJSONSource | undefined
    src?.setData(buildDsmFeatures(dsmStrikes))
  }, [dsmStrikes, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const src = map.getSource(NPZ_SOURCE) as GeoJSONSource | undefined
    src?.setData(buildNpzFeatures(burningRefineries))
  }, [burningRefineries, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    if (!map.getSource(RAIONS_SOURCE) || !map.getSource(OBLASTS_SOURCE)) return

    const raionKeys = new Set(alerts.map((a) => a.key))
    const oblastKeys = new Set(alertOblasts.map((a) => a.key))
    const raionLevels = new Map(alerts.map((a) => [a.key, a.level ?? 'red']))
    const oblastLevels = new Map(alertOblasts.map((a) => [a.key, a.level ?? 'red']))

    syncAlertStates(map, RAIONS_SOURCE, raionKeys, raionLevels, prevRaionKeys.current)
    syncAlertStates(map, OBLASTS_SOURCE, oblastKeys, oblastLevels, prevOblastKeys.current)
  }, [alerts, alertOblasts, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const keys = new Set(ruAlerts.map((a) => a.key))
    const levels = new Map(ruAlerts.map((a) => [a.key, a.level]))
    syncAlertStates(map, RUSSIA_OBLASTS_SOURCE, keys, levels, prevRuAlertKeys.current)
  }, [ruAlerts, ready])

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
  }, [selectedId, threats, dsmStrikes, burningRefineries])

  return <div className="map-root" ref={containerRef} role="presentation" />
}
