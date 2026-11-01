/** Empty = same-origin `/api` via Vite proxy in dev, or direct upstream fallbacks. */
export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ?? ''

export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE}${p}`
}

export type SourceHealth = {
  name: string
  ok: boolean
  ageSec: number | null
  lagMs: number | null
  error: string | null
  stale: boolean
  threatCount?: number | null
  activeObjects?: number | null
}

export type StatusPayload = {
  serverTime: string
  hideTracks: boolean
  sources: SourceHealth[]
}
