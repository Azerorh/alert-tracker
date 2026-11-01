import { useEffect, useMemo, useRef, useState } from 'react'
import {
  assignMapaMatches,
  enrichThreatWithMapa,
  fetchMapaSnapshot,
  MAPA_SHOT_DOWN,
  type MapaObject,
} from '../lib/mapa'
import type { Threat } from '../lib/neptun'
import {
  freezeThreat,
  isActiveTrack,
  ttlFor,
  type DisplayThreat,
  type ThreatEndKind,
} from '../lib/threatDisplay'

type TrailPoint = { lat: number; lon: number; t: string }

const MAPA_POLL_MS = 8000
const LOCAL_TRAIL_MAX = 24
const MIN_MOVE_KM = 0.35
const TICK_MS = 1000

function appendLocalTrail(
  prev: TrailPoint[] | undefined,
  lat: number,
  lon: number,
  t: string,
): TrailPoint[] {
  const next = prev ? [...prev] : []
  const last = next[next.length - 1]
  if (last) {
    const dlat = Math.abs(last.lat - lat)
    const dlon = Math.abs(last.lon - lon)
    if (dlat < 0.003 && dlon < 0.003) {
      next[next.length - 1] = { lat, lon, t }
      return next
    }
  }
  next.push({ lat, lon, t })
  if (next.length > LOCAL_TRAIL_MAX) next.splice(0, next.length - LOCAL_TRAIL_MAX)
  return next
}

function haversineKm(a: TrailPoint, b: { lat: number; lon: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const R = 6371
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

type EndedEntry = {
  threat: DisplayThreat
  endKind: ThreatEndKind
  endAt: number
}

/**
 * Blend NEPTUN live tracks with MAPA kinematics/trails.
 * Keeps short-lived «Збито» / «Зникло» ghosts for map clarity.
 */
export function useEnrichedThreats(threats: Threat[]): {
  threats: DisplayThreat[]
  mapaLinked: number
  mapaStatus: 'idle' | 'live' | 'error'
  endedCount: { shot_down: number; vanished: number }
} {
  const [mapaActive, setMapaActive] = useState<MapaObject[]>([])
  const [mapaTerminal, setMapaTerminal] = useState<MapaObject[]>([])
  const [mapaStatus, setMapaStatus] = useState<'idle' | 'live' | 'error'>('idle')
  const [tick, setTick] = useState(0)

  const localTrails = useRef(new Map<string, TrailPoint[]>())
  const stickyMapa = useRef(new Map<string, string>())
  const lastLive = useRef(new Map<string, DisplayThreat>())
  const ended = useRef(new Map<string, EndedEntry>())
  const prevLiveIds = useRef(new Set<string>())

  useEffect(() => {
    let cancelled = false
    let timer = 0

    const pull = async () => {
      try {
        const snap = await fetchMapaSnapshot()
        if (cancelled) return
        setMapaActive(snap.active)
        setMapaTerminal(snap.terminal)
        setMapaStatus('live')
      } catch {
        if (!cancelled) setMapaStatus('error')
      }
    }

    void pull()
    timer = window.setInterval(pull, MAPA_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setTick((n) => n + 1), TICK_MS)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const seen = new Set<string>()
    for (const t of threats) {
      seen.add(t.id)
      if (t.areaOnly) continue
      const prev = localTrails.current.get(t.id)
      const last = prev?.[prev.length - 1]
      if (last && haversineKm(last, t) < MIN_MOVE_KM) {
        localTrails.current.set(
          t.id,
          appendLocalTrail(prev, last.lat, last.lon, t.updatedAt),
        )
        continue
      }
      localTrails.current.set(
        t.id,
        appendLocalTrail(prev, t.lat, t.lon, t.updatedAt),
      )
    }
    for (const id of [...localTrails.current.keys()]) {
      // Keep trails for vanished/shot ghosts still on the map.
      if (!seen.has(id) && !ended.current.has(id)) localTrails.current.delete(id)
    }
  }, [threats])

  const enriched = useMemo(() => {
    const now = Date.now()
    const terminalById = new Map(mapaTerminal.map((o) => [String(o.id), o]))

    const liveInput = threats.filter(
      (t) => t.status !== 'resolved' && t.status !== 'shot_down' && t.status !== 'vanished',
    )

    const assignments =
      mapaActive.length > 0
        ? assignMapaMatches(liveInput, mapaActive, stickyMapa.current)
        : new Map()

    const nextSticky = new Map<string, string>()
    for (const [threatId, m] of assignments) {
      nextSticky.set(threatId, String(m.object.id))
    }

    // Keep sticky for tracks that just went terminal so we can attribute shot_down.
    for (const [threatId, mid] of stickyMapa.current) {
      if (!nextSticky.has(threatId) && terminalById.has(mid)) {
        nextSticky.set(threatId, mid)
      }
    }
    stickyMapa.current = nextSticky

    let linked = 0
    const live: DisplayThreat[] = liveInput.map((threat) => {
      const match = assignments.get(threat.id)
      if (match) {
        linked += 1
        return enrichThreatWithMapa(threat, match)
      }

      let next: DisplayThreat = threat
      const local = localTrails.current.get(threat.id)
      if (local && local.length > 1) {
        const baseTrail = next.trail ?? []
        if (!baseTrail.length || baseTrail.length < local.length) {
          next = { ...next, trail: local }
        } else {
          const end = baseTrail[baseTrail.length - 1]
          const locEnd = local[local.length - 1]
          if (
            end &&
            locEnd &&
            (Math.abs(end.lat - locEnd.lat) > 0.001 ||
              Math.abs(end.lon - locEnd.lon) > 0.001)
          ) {
            next = { ...next, trail: [...baseTrail, locEnd] }
          }
        }
      }
      return next
    })

    const liveById = new Map(live.map((t) => [t.id, t]))
    for (const t of live) lastLive.current.set(t.id, t)

    // Revive if the track is live again (NEPTUN and/or MAPA) — avoid 3‑min ghost blocking a return.
    for (const id of liveById.keys()) {
      if (ended.current.has(id)) ended.current.delete(id)
    }

    const markEnded = (id: string, kind: ThreatEndKind, base?: DisplayThreat) => {
      const existing = ended.current.get(id)
      if (existing) {
        // Upgrade vanished → shot_down if MAPA confirms kill.
        if (existing.endKind === 'vanished' && kind === 'shot_down') {
          const src = base ?? existing.threat
          ended.current.set(id, {
            endKind: kind,
            endAt: now,
            threat: freezeThreat(src, kind, now),
          })
        }
        return
      }
      const src = base ?? lastLive.current.get(id)
      if (!src) return
      ended.current.set(id, {
        endKind: kind,
        endAt: now,
        threat: freezeThreat(src, kind, now),
      })
    }

    // MAPA eliminated / hit on sticky link while NEPTUN may still show the track.
    for (const [threatId, mid] of stickyMapa.current) {
      const term = terminalById.get(mid)
      if (!term) continue
      const kind: ThreatEndKind = MAPA_SHOT_DOWN.has(term.status) ? 'shot_down' : 'vanished'
      const base = liveById.get(threatId) ?? lastLive.current.get(threatId)
      markEnded(
        threatId,
        kind,
        base
          ? {
              ...base,
              lat: term.lat,
              lon: term.lon,
              heading: term.heading ?? base.heading,
            }
          : undefined,
      )
    }

    // NEPTUN resolved still present in snapshot.
    for (const t of threats) {
      if (t.status === 'resolved') {
        const stickyMid = stickyMapa.current.get(t.id)
        const term = stickyMid ? terminalById.get(stickyMid) : undefined
        const kind: ThreatEndKind =
          term && MAPA_SHOT_DOWN.has(term.status) ? 'shot_down' : 'vanished'
        markEnded(t.id, kind, lastLive.current.get(t.id) ?? t)
      }
    }

    // Dropped from NEPTUN live feed entirely.
    for (const id of prevLiveIds.current) {
      if (liveById.has(id)) continue
      const stickyMid = stickyMapa.current.get(id)
      const term = stickyMid ? terminalById.get(stickyMid) : undefined
      const kind: ThreatEndKind =
        term && MAPA_SHOT_DOWN.has(term.status) ? 'shot_down' : 'vanished'
      markEnded(id, kind)
    }

    prevLiveIds.current = new Set(liveById.keys())

    // Expire ghosts.
    for (const [id, entry] of [...ended.current.entries()]) {
      if (now - entry.endAt > ttlFor(entry.endKind)) {
        ended.current.delete(id)
        stickyMapa.current.delete(id)
        lastLive.current.delete(id)
        localTrails.current.delete(id)
      }
    }

    // Live list excludes anything we already marked ended (MAPA kill wins).
    const liveOut = live.filter((t) => !ended.current.has(t.id))
    const ghosts = [...ended.current.values()].map((e) => e.threat)

    const endedCount = { shot_down: 0, vanished: 0 }
    for (const e of ended.current.values()) {
      endedCount[e.endKind] += 1
    }

    return {
      threats: [...liveOut, ...ghosts],
      mapaLinked: linked,
      endedCount,
    }
  }, [threats, mapaActive, mapaTerminal, tick])

  return { ...enriched, mapaStatus }
}

export type { DisplayThreat }
export { isActiveTrack }
