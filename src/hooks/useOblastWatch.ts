import { useCallback, useEffect, useRef, useState } from 'react'
import {
  findOblastKey,
  loadOblastCatalog,
  type OblastMeta,
} from '../lib/oblasts'
import { getTypeMeta, predict } from '../lib/neptun'
import type { AlertLevel, AlertZone } from '../lib/neptun-types'
import { isActiveTrack, type DisplayThreat } from '../lib/threatDisplay'
import type { Feature } from 'geojson'

const STORAGE_KEY = 'alert-tracker:watched-oblasts'
const KINDS_STORAGE_KEY = 'alert-tracker:oblast-notify-kinds'
/** Soft cap so Windows toast center cannot be flooded. */
const MIN_NOTIFY_GAP_MS = 2_500

type OblastAlertState = 'clear' | AlertLevel

export type OblastNotifyKinds = {
  /** Live aerial object entered the oblast. */
  threats: boolean
  /** Official UA air-alert status changed for the oblast. */
  alerts: boolean
}

const DEFAULT_NOTIFY_KINDS: OblastNotifyKinds = { threats: true, alerts: true }

function readStored(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

function writeStored(keys: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys))
  } catch {
    /* ignore quota */
  }
}

function readNotifyKinds(): OblastNotifyKinds {
  try {
    const raw = localStorage.getItem(KINDS_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_NOTIFY_KINDS }
    const parsed = JSON.parse(raw) as Partial<OblastNotifyKinds>
    return {
      threats: parsed.threats !== false,
      alerts: parsed.alerts !== false,
    }
  } catch {
    return { ...DEFAULT_NOTIFY_KINDS }
  }
}

function writeNotifyKinds(kinds: OblastNotifyKinds) {
  try {
    localStorage.setItem(KINDS_STORAGE_KEY, JSON.stringify(kinds))
  } catch {
    /* ignore quota */
  }
}

function levelRank(level: OblastAlertState): number {
  if (level === 'red') return 2
  if (level === 'yellow') return 1
  return 0
}

function levelLabel(level: OblastAlertState): string {
  if (level === 'red') return 'повітряна тривога'
  if (level === 'yellow') return 'увага / жовтий рівень'
  return 'немає тривоги'
}

/** Collapse raion + oblast Neptun alerts onto watched oblast keys. */
function buildWatchedAlertStates(
  watched: string[],
  list: OblastMeta[],
  alertOblasts: AlertZone[],
  alerts: AlertZone[],
): Map<string, OblastAlertState> {
  const watchedSet = new Set(watched)
  const keyByName = new Map(list.map((o) => [o.name, o.key]))
  const out = new Map<string, OblastAlertState>()
  for (const key of watched) out.set(key, 'clear')

  const raise = (key: string, level: AlertLevel | undefined) => {
    if (!watchedSet.has(key)) return
    const next: OblastAlertState = level === 'yellow' ? 'yellow' : 'red'
    const prev = out.get(key) ?? 'clear'
    if (levelRank(next) > levelRank(prev)) out.set(key, next)
  }

  for (const zone of alertOblasts) raise(zone.key, zone.level)
  for (const zone of alerts) {
    const key = keyByName.get(zone.oblast)
    if (key) raise(key, zone.level)
  }
  return out
}

export type WatchToast = {
  id: string
  title: string
  body: string
  at: number
}

/**
 * Watch selected UA oblasts:
 * - notify when a live threat *enters*
 * - notify when official air-alert status changes (after selection baseline)
 */
export function useOblastWatch(
  threats: DisplayThreat[],
  alertOblasts: AlertZone[],
  alerts: AlertZone[],
  _now: number,
) {
  const [list, setList] = useState<OblastMeta[]>([])
  const [watched, setWatched] = useState<string[]>(() =>
    typeof window !== 'undefined' ? readStored() : [],
  )
  const [notifyKinds, setNotifyKindsState] = useState<OblastNotifyKinds>(() =>
    typeof window !== 'undefined' ? readNotifyKinds() : { ...DEFAULT_NOTIFY_KINDS },
  )
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'denied',
  )
  const [toasts, setToasts] = useState<WatchToast[]>([])
  const featuresRef = useRef<Feature[]>([])
  /** threatId → oblast key currently inside (watched only). */
  const insideRef = useRef(new Map<string, string>())
  const prevWatchedRef = useRef<string[]>([])
  const primedRef = useRef(false)
  const alertPrimedRef = useRef(false)
  const alertStateRef = useRef(new Map<string, OblastAlertState>())
  const lastNotifyAtRef = useRef(0)
  const threatsRef = useRef(threats)
  const notifyKindsRef = useRef(notifyKinds)
  threatsRef.current = threats
  notifyKindsRef.current = notifyKinds

  useEffect(() => {
    let cancelled = false
    void loadOblastCatalog()
      .then((cat) => {
        if (cancelled) return
        featuresRef.current = cat.features
        setList(cat.list)
      })
      .catch((err) => console.warn('Oblast catalog unavailable', err))
    return () => {
      cancelled = true
    }
  }, [])

  const persist = useCallback((keys: string[]) => {
    const unique = [...new Set(keys)]
    setWatched(unique)
    writeStored(unique)
  }, [])

  const setNotifyKinds = useCallback((patch: Partial<OblastNotifyKinds>) => {
    setNotifyKindsState((prev) => {
      const next = { ...prev, ...patch }
      // Keep at least one channel on — turning both off is confusing.
      if (!next.threats && !next.alerts) return prev
      writeNotifyKinds(next)
      return next
    })
  }, [])

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return 'denied' as NotificationPermission
    if (Notification.permission === 'granted') {
      setPermission('granted')
      return 'granted'
    }
    const res = await Notification.requestPermission()
    setPermission(res)
    return res
  }, [])

  const pushAlert = useCallback((title: string, body: string, tag: string) => {
    const now = Date.now()
    // Always keep a short in-app toast; throttle OS notifications harder.
    const id = `${now}-${Math.random().toString(36).slice(2, 7)}`
    setToasts((prev) => [{ id, title, body, at: now }, ...prev].slice(0, 3))

    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    if (now - lastNotifyAtRef.current < MIN_NOTIFY_GAP_MS) return
    lastNotifyAtRef.current = now
    try {
      new Notification(title, {
        body,
        tag,
        silent: false,
      })
    } catch {
      /* ignore */
    }
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toggleOblast = useCallback(
    async (key: string) => {
      const next = watched.includes(key)
        ? watched.filter((k) => k !== key)
        : [...watched, key]
      if (next.length > watched.length && typeof Notification !== 'undefined') {
        if (Notification.permission === 'default') await requestPermission()
        else setPermission(Notification.permission)
      }
      persist(next)
    },
    [watched, persist, requestPermission],
  )

  const selectAll = useCallback(async () => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      await requestPermission()
    }
    persist(list.map((o) => o.key))
  }, [list, persist, requestPermission])

  const clearAll = useCallback(() => {
    persist([])
    insideRef.current.clear()
    prevWatchedRef.current = []
    primedRef.current = false
    alertPrimedRef.current = false
    alertStateRef.current.clear()
  }, [persist])

  /** Mark everyone currently inside `keys` as already known — no alerts. */
  const seedSilent = useCallback((keys: string[]) => {
    if (!keys.length || !featuresRef.current.length) return
    const keySet = new Set(keys)
    const live = threatsRef.current.filter((t) => isActiveTrack(t) && !t.areaOnly)
    const ts = Date.now()
    for (const threat of live) {
      const p = predict(threat, ts)
      const oblast = findOblastKey(p.lon, p.lat, featuresRef.current)
      if (!oblast || !keySet.has(oblast)) continue
      insideRef.current.set(threat.id, oblast)
    }
  }, [])

  // Detect only real enters into watched oblasts
  useEffect(() => {
    if (!featuresRef.current.length) return

    if (!watched.length) {
      insideRef.current.clear()
      prevWatchedRef.current = []
      primedRef.current = false
      return
    }

    const watchedSet = new Set(watched)
    const nameByKey = new Map(list.map((o) => [o.key, o.name]))
    const prevWatched = prevWatchedRef.current
    const added = watched.filter((k) => !prevWatched.includes(k))

    // First arm, or newly checked oblasts: baseline without notifying.
    if (!primedRef.current) {
      seedSilent(watched)
      primedRef.current = true
      prevWatchedRef.current = [...watched]
      return
    }
    if (added.length) {
      seedSilent(added)
      prevWatchedRef.current = [...watched]
      // Continue into enter detection for other movement in this same tick.
    } else {
      prevWatchedRef.current = [...watched]
    }

    const live = threats.filter((t) => isActiveTrack(t) && !t.areaOnly)
    const seen = new Set<string>()
    const ts = Date.now()

    for (const threat of live) {
      seen.add(threat.id)
      const p = predict(threat, ts)
      const key = findOblastKey(p.lon, p.lat, featuresRef.current)
      const prev = insideRef.current.get(threat.id)

      if (!key || !watchedSet.has(key)) {
        if (prev) insideRef.current.delete(threat.id)
        continue
      }

      // Still in the same watched oblast — ignore.
      if (prev === key) continue

      // Real enter: was outside watched area, or came from another oblast.
      insideRef.current.set(threat.id, key)
      if (!notifyKindsRef.current.threats) continue
      const meta = getTypeMeta(threat.type)
      const oblastName = nameByKey.get(key) ?? key
      pushAlert(
        `${meta.shortLabel} · ${oblastName}`,
        threat.title || `Загроза зайшла в «${oblastName}»`,
        `oblast-enter-${key}-${threat.id}`,
      )
    }

    for (const id of [...insideRef.current.keys()]) {
      if (!seen.has(id)) insideRef.current.delete(id)
    }
  }, [threats, watched, list, pushAlert, seedSilent])

  // Official UA air-alert status changes for watched oblasts only
  useEffect(() => {
    if (!watched.length || !list.length) {
      alertPrimedRef.current = false
      alertStateRef.current.clear()
      return
    }

    const next = buildWatchedAlertStates(watched, list, alertOblasts, alerts)
    const nameByKey = new Map(list.map((o) => [o.key, o.name]))

    if (!alertPrimedRef.current) {
      alertStateRef.current = next
      alertPrimedRef.current = true
      return
    }

    // Newly checked oblasts: baseline their current status silently.
    for (const key of watched) {
      if (!alertStateRef.current.has(key)) {
        alertStateRef.current.set(key, next.get(key) ?? 'clear')
      }
    }
    // Drop unwatched
    for (const key of [...alertStateRef.current.keys()]) {
      if (!watched.includes(key)) alertStateRef.current.delete(key)
    }

    for (const key of watched) {
      const prev = alertStateRef.current.get(key) ?? 'clear'
      const cur = next.get(key) ?? 'clear'
      if (prev === cur) continue
      alertStateRef.current.set(key, cur)
      if (!notifyKindsRef.current.alerts) continue
      const oblastName = nameByKey.get(key) ?? key
      if (prev === 'clear' && cur !== 'clear') {
        pushAlert(
          `Тривога · ${oblastName}`,
          `Оголошено: ${levelLabel(cur)}`,
          `oblast-alert-${key}`,
        )
      } else if (prev !== 'clear' && cur === 'clear') {
        pushAlert(`Відбій · ${oblastName}`, 'Повітряну тривогу скасовано', `oblast-alert-${key}`)
      } else {
        pushAlert(
          `Статус · ${oblastName}`,
          `${levelLabel(prev)} → ${levelLabel(cur)}`,
          `oblast-alert-${key}`,
        )
      }
    }
  }, [alertOblasts, alerts, watched, list, pushAlert])

  // Auto-dismiss toasts
  useEffect(() => {
    if (!toasts.length) return
    const timer = window.setTimeout(() => {
      const cutoff = Date.now() - 8000
      setToasts((prev) => prev.filter((t) => t.at > cutoff))
    }, 2000)
    return () => window.clearTimeout(timer)
  }, [toasts])

  return {
    oblasts: list,
    watched,
    watchedCount: watched.length,
    notifyKinds,
    setNotifyKinds,
    permission,
    toasts,
    toggleOblast,
    selectAll,
    clearAll,
    requestPermission,
    dismissToast,
  }
}
