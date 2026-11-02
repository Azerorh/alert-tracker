import { useEffect, useState } from 'react'
import {
  fetchPowerTgOutagesSnapshot,
  type PowerTgMarker,
  type PowerTgPayload,
} from '../lib/powerTgOutages'

const POLL_MS = 5 * 60_000

export function usePowerTgOutages(enabled: boolean) {
  const [payload, setPayload] = useState<PowerTgPayload | null>(null)
  const [status, setStatus] = useState<'idle' | 'live' | 'error'>('idle')

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let timer = 0

    const pull = async () => {
      const next = await fetchPowerTgOutagesSnapshot()
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

  return {
    payload,
    markers: (payload?.markers ?? []) as PowerTgMarker[],
    status,
  }
}
