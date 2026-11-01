import type {
  AlertZone,
  ConfidenceLevel,
  ConfidenceMeta,
  ConnectionStatus,
  FilterOption,
  PredictResult,
  RealtimeSnapshot,
  Threat,
  ThreatType,
  TypeMeta,
} from '../lib/neptun-types'

export type {
  AlertZone,
  ConfidenceLevel,
  ConfidenceMeta,
  ConnectionStatus,
  FilterOption,
  PredictResult,
  RealtimeSnapshot,
  Threat,
  ThreatType,
  TypeMeta,
}

export declare class RealtimeClient {
  constructor(baseUrl: string)
  subscribe(listener: (snap: RealtimeSnapshot) => void): () => void
  getSnapshot(): RealtimeSnapshot
  start(): void
  stop(): void
  retry(): void
}

export declare const THREAT_TYPES: Record<ThreatType, TypeMeta>
export declare const FILTERS: FilterOption[]
export declare const CONFIDENCE_META: Record<ConfidenceLevel, ConfidenceMeta>
export declare const PUBLISHED_THREAT_TYPES: ThreatType[]
export declare const UKRAINE_CENTER: [number, number]
export declare const INITIAL_ZOOM: number
export declare const MIN_ZOOM: number
export declare const MAX_ZOOM: number
export declare const FLY_TO_ZOOM: number
export declare const UKRAINE_MAX_BOUNDS: [[number, number], [number, number]]
export declare const UKRAINE_FIT_BOUNDS: [[number, number], [number, number]]
export declare const STALE_AFTER_SECONDS: number
export declare const FLY_HORIZON_MIN: Record<string, number>
export declare const MAX_GHOST_KM: Record<string, number>

export declare function predict(threat: Threat, nowMs: number): PredictResult
export declare function getTypeMeta(type: string): TypeMeta
export declare function formatRelativeTime(iso: string, nowMs?: number): string
export declare function formatClock(iso: string): string
export declare function isStale(iso: string, nowMs?: number, afterSec?: number): boolean
export declare function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number
export declare function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number
export declare function dest(lat: number, lon: number, bearing: number, km: number): [number, number]
export declare function threatsLabel(n: number): string
export declare function sourcesLabel(n: number): string
export declare function ukPlural(n: number, forms: [string, string, string]): string
export declare function anyFlying(threats: Threat[], nowMs: number): boolean
export declare function isThreat(value: unknown): value is Threat
export declare function toLngLat(threat: Threat): [number, number]
export declare function lngLat(lat: number, lon: number, id?: string): [number, number]
export declare function parseAlertList(raw: unknown): AlertZone[]
