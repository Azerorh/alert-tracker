export type ThreatType =
  | 'uav'
  | 'fpv'
  | 'missile'
  | 'ballistic'
  | 'kab'
  | 'mig31k'
  | 'recon'
  | 'unknown'

export type ConfidenceLevel = 'high' | 'medium' | 'low'

export type ConnectionStatus = 'connecting' | 'live' | 'reconnecting'

export type AlertLevel = 'red' | 'yellow'

export interface ThreatVelocity {
  bearingDeg: number
  speedKmh: number
}

export interface ThreatTrailPoint {
  lat: number
  lon: number
  t: string
}

export interface Threat {
  id: string
  type: ThreatType
  title: string
  region: string
  district: string
  locality?: string
  lat: number
  lon: number
  heading: number | null
  confidenceLevel?: ConfidenceLevel
  sourceCount?: number
  count?: number
  updatedAt: string
  explanationShort: string
  status: 'active' | 'stale' | 'resolved' | string
  velocity?: ThreatVelocity
  confirmedAt?: string
  uncertaintyKm?: number
  positionQuality?: string
  advisory?: boolean
  areaOnly?: boolean
  trail?: ThreatTrailPoint[]
  lifecycle?: string
  displayConfidence?: ConfidenceLevel
  destination?: boolean
}

export interface AlertZone {
  key: string
  name: string
  oblast: string
  since?: string
  level?: AlertLevel
  reasons?: string[]
}

export interface RealtimeSnapshot {
  threats: Threat[]
  alerts: AlertZone[]
  alertOblasts: AlertZone[]
  status: ConnectionStatus
  lastUpdatedAt: string
  pulseKey: number
}

export interface PredictResult {
  lat: number
  lon: number
  heading: number
  distKm: number
  ageMin: number
  flying: boolean
}

export interface TypeMeta {
  type: ThreatType
  label: string
  shortLabel: string
  hex: string
  priority: number
}

export interface FilterOption {
  key: 'all' | ThreatType
  label: string
}

export interface ConfidenceMeta {
  label: string
  hex: string
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
