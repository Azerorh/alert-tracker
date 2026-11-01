import { useEffect, useState } from 'react'
import {
  fetchRuAlertSnapshot,
  fetchRuAlertZones,
  type RuAlertZone,
  type RuTrajectory,
} from '../lib/ruAlerts'

/** TG channels move fast; Pages snapshot is hourly fallback. */
const POLL_MS = 60_000

export function useRuAlerts() {
  const [alerts, setAlerts] = useState<RuAlertZone[]>([])
  const [trajectories, setTrajectories] = useState<RuTrajectory[]>([])
  const [status, setStatus] = useState<'idle' | 'live' | 'error'>('idle')

  useEffect(() => {
    let cancelled = false
    let timer = 0

    const pull = async () => {
      try {
        const next = await fetchRuAlertZones()
        if (cancelled) return
        setAlerts(next.alerts)
        setTrajectories(next.trajectories)
        setStatus('live')
      } catch (err) {
        console.warn('RU alerts live unavailable, trying snapshot', err)
        const snap = await fetchRuAlertSnapshot()
        if (cancelled) return
        if (snap && snap.alerts.length > 0) {
          setAlerts(snap.alerts)
          setTrajectories(snap.trajectories)
          setStatus('live')
          return
        }
        setStatus('error')
      }
    }

    void pull()
    timer = window.setInterval(pull, POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  return { alerts, trajectories, status }
}
