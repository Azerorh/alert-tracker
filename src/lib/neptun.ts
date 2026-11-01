export {
  RealtimeClient,
  predict,
  getTypeMeta,
  formatRelativeTime,
  formatClock,
  isStale,
  distanceKm,
  threatsLabel,
  sourcesLabel,
  THREAT_TYPES,
  FILTERS,
  CONFIDENCE_META,
  UKRAINE_CENTER,
  INITIAL_ZOOM,
  MIN_ZOOM,
  MAX_ZOOM,
  FLY_TO_ZOOM,
  UKRAINE_MAX_BOUNDS,
  UKRAINE_FIT_BOUNDS,
  STALE_AFTER_SECONDS,
} from '../vendor/neptun.esm.js'

export type {
  Threat,
  ThreatType,
  AlertZone,
  RealtimeSnapshot,
  ConnectionStatus,
  PredictResult,
  TypeMeta,
  ConfidenceLevel,
  FilterOption,
} from './neptun-types'

export const NEPTUN_BASE = 'https://neptun.in.ua'
export const NEPTUN_ATTRIBUTION_URL = 'https://neptun.in.ua/'
export const DEEPSTATE_ATTRIBUTION_URL = 'https://deepstatemap.live/'
/** Served same-origin — upstream GeoJSON has no CORS headers. Respect Vite `base` (GitHub Pages). */
const publicBase = import.meta.env.BASE_URL || '/'
export const RAIONS_GEOJSON_URL = `${publicBase}geo/raions.geojson`
export const OBLASTS_GEOJSON_URL = `${publicBase}geo/oblasts.geojson`
/** Natural Earth 50m Russia outline (public domain), same-origin for Pages. */
export const RUSSIA_OUTLINE_GEOJSON_URL = `${publicBase}geo/russia-outline.geojson`
/** geoBoundaries RUS ADM1 simplified — oblast fills for RU alerts. */
export const RUSSIA_OBLASTS_GEOJSON_URL = `${publicBase}geo/russia-oblasts.geojson`
import occupiedGeoJsonUrl from '../data/occupied.geojson?url'

/** Occupied territory polygons extracted from DeepStateMap (bundled URL). */
export const OCCUPIED_GEOJSON_URL = occupiedGeoJsonUrl

export type UiFilterKey =
  | 'all'
  | 'uav'
  | 'missile'
  | 'ballistic'
  | 'kab'
  | 'recon'
  | 'aviation'

/** Group UAV-like filters under one chip for cleaner UI. */
export const UI_FILTERS: ReadonlyArray<{
  key: UiFilterKey
  label: string
  types: readonly string[] | null
}> = [
  { key: 'all', label: 'Усі', types: null },
  { key: 'uav', label: 'БпЛА', types: ['uav', 'fpv'] },
  { key: 'missile', label: 'Ракети', types: ['missile'] },
  { key: 'ballistic', label: 'Балістика', types: ['ballistic'] },
  { key: 'kab', label: 'КАБ', types: ['kab'] },
  { key: 'recon', label: 'Розвідка', types: ['recon'] },
  { key: 'aviation', label: 'Авіація', types: ['mig31k'] },
]

export function matchesUiFilter(type: string, filter: UiFilterKey): boolean {
  const item = UI_FILTERS.find((f) => f.key === filter)
  if (!item || item.types === null) return true
  return item.types.includes(type)
}
