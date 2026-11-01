import { useEffect, useState } from 'react'
import {
  fetchRuAlertSnapshot,
  fetchRuAlertZones,
  type RuAlertZone,
} from '../lib/ruAlerts'

const POLL_MS = 45_000

export function useRuAlerts() {
  const [alerts, setAlerts] = useState<RuAlertZone[]>([])
  const [status, setStatus] = useState<'idle' | 'live' | 'error'>('idle')

  useEffect(() => {
    let cancelled = false
    let timer = 0

    const pull = async () => {
      try {
        const next = await fetchRuAlertZones()
        if (cancelled) return
        setAlerts(next)
        setStatus('live')
      } catch (err) {
        console.warn('RU alerts live unavailable, trying snapshot', err)
        const snap = await fetchRuAlertSnapshot()
        if (cancelled) return
        if (snap && snap.length > 0) {
          setAlerts(snap)
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

  return { alerts, status }
}
