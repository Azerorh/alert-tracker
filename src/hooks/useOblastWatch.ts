import { useCallback, useEffect, useRef, useState } from 'react'
import {
  findOblastKey,
  loadOblastCatalog,
  type OblastMeta,
} from '../lib/oblasts'
import { getTypeMeta, predict } from '../lib/neptun'
import { isActiveTrack, type DisplayThreat } from '../lib/threatDisplay'
import type { Feature } from 'geojson'

const STORAGE_KEY = 'alert-tracker:watched-oblasts'

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

export type WatchToast = {
  id: string
  title: string
  body: string
  at: number
}

/**
 * Watch selected oblasts; fire browser Notification (+ in-app toast) when a live
 * threat newly enters a watched region.
 */
export function useOblastWatch(threats: DisplayThreat[], now: number) {
  const [list, setList] = useState<OblastMeta[]>([])
  const [watched, setWatched] = useState<string[]>(() =>
    typeof window !== 'undefined' ? readStored() : [],
  )
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'denied',
  )
  const [toasts, setToasts] = useState<WatchToast[]>([])
  const featuresRef = useRef<Feature[]>([])
  /** threatId → oblast key currently inside (watched only). */
  const insideRef = useRef(new Map<string, string>())
  /** Dedupe key: `${threatId}:${oblastKey}` already alerted while continuously inside. */
  const alertedRef = useRef(new Set<string>())

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

  const pushAlert = useCallback(
    (title: string, body: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      setToasts((prev) => [{ id, title, body, at: Date.now() }, ...prev].slice(0, 4))
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          new Notification(title, {
            body,
            tag: `oblast-${body.slice(0, 48)}`,
            silent: false,
          })
        } catch {
          /* ignore */
        }
      }
    },
    [],
  )

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
    alertedRef.current.clear()
  }, [persist])

  // Detect enter events
  useEffect(() => {
    if (!watched.length || !featuresRef.current.length) return
    const watchedSet = new Set(watched)
    const nameByKey = new Map(list.map((o) => [o.key, o.name]))
    const live = threats.filter((t) => isActiveTrack(t) && !t.areaOnly)
    const seen = new Set<string>()

    for (const threat of live) {
      seen.add(threat.id)
      const p = predict(threat, now)
      const key = findOblastKey(p.lon, p.lat, featuresRef.current)
      const prev = insideRef.current.get(threat.id)

      if (!key || !watchedSet.has(key)) {
        if (prev) {
          alertedRef.current.delete(`${threat.id}:${prev}`)
          insideRef.current.delete(threat.id)
        }
        continue
      }

      if (prev && prev !== key) {
        alertedRef.current.delete(`${threat.id}:${prev}`)
      }
      insideRef.current.set(threat.id, key)
      const dedupe = `${threat.id}:${key}`
      if (alertedRef.current.has(dedupe)) continue

      // First time this threat is seen inside this watched oblast
      alertedRef.current.add(dedupe)
      const meta = getTypeMeta(threat.type)
      const oblastName = nameByKey.get(key) ?? key
      pushAlert(
        `${meta.shortLabel} · ${oblastName}`,
        threat.title || `Загроза в області «${oblastName}»`,
      )
    }

    for (const id of [...insideRef.current.keys()]) {
      if (!seen.has(id)) {
        const prev = insideRef.current.get(id)
        if (prev) alertedRef.current.delete(`${id}:${prev}`)
        insideRef.current.delete(id)
      }
    }
  }, [threats, watched, now, list, pushAlert])

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
    permission,
    toasts,
    toggleOblast,
    selectAll,
    clearAll,
    requestPermission,
    dismissToast,
  }
}
