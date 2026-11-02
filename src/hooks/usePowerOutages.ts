import { useEffect, useState } from 'react'
import {
  fetchPowerOutagesSnapshot,
  refreshPowerNow,
  type PowerOutagesPayload,
} from '../lib/powerOutages'

const POLL_MS = 5 * 60_000

export function usePowerOutages(enabled: boolean) {
  const [payload, setPayload] = useState<PowerOutagesPayload | null>(null)
  const [status, setStatus] = useState<'idle' | 'live' | 'error'>('idle')

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let timer = 0

    const pull = async () => {
      const next = await fetchPowerOutagesSnapshot()
      if (cancelled) return
      if (next) {
        setPayload(next)
        setStatus('live')
      } else {
        setStatus('error')
      }
    }

    void pull()
    timer = window.setInterval(pull, POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [enabled])

  // Refresh "now" flags every minute without re-fetching the whole snapshot.
  useEffect(() => {
    if (!enabled || !payload) return
    const timer = window.setInterval(() => {
      setPayload((prev) => (prev ? refreshPowerNow(prev) : prev))
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [enabled, payload?.fetchedAt])

  return { payload, oblasts: payload?.oblasts ?? [], status }
}
