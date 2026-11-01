import type { Threat } from './neptun'

/** Short-lived map ghosts after a track ends. */
export type ThreatEndKind = 'shot_down' | 'vanished'

export type DisplayThreat = Threat & {
  endKind?: ThreatEndKind
  /** Epoch ms when the end event was detected. */
  endAt?: number
}

export const SHOT_DOWN_TTL_MS = 55_000
export const VANISHED_TTL_MS = 30_000

export function isEndedThreat(t: DisplayThreat): boolean {
  return t.endKind === 'shot_down' || t.endKind === 'vanished'
}

export function isActiveTrack(t: DisplayThreat): boolean {
  if (isEndedThreat(t)) return false
  if (t.status === 'resolved' || t.status === 'shot_down' || t.status === 'vanished') return false
  return true
}

export function endKindLabel(kind: ThreatEndKind): string {
  return kind === 'shot_down' ? 'Збито' : 'Зникло'
}

export function endKindColor(kind: ThreatEndKind): string {
  return kind === 'shot_down' ? '#8fa3b8' : '#6b7280'
}

export function ttlFor(kind: ThreatEndKind): number {
  return kind === 'shot_down' ? SHOT_DOWN_TTL_MS : VANISHED_TTL_MS
}

export function freezeThreat(threat: Threat, endKind: ThreatEndKind, endAt: number): DisplayThreat {
  return {
    ...threat,
    status: endKind,
    endKind,
    endAt,
    velocity: undefined,
    confirmedAt: threat.confirmedAt ?? threat.updatedAt,
    advisory: endKind === 'vanished' ? true : threat.advisory,
  }
}
