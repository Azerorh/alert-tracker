import { useEffect, useState } from 'react'
import { fetchGroundLosses, type GroundLoss } from '../lib/warspotting'

const POLL_MS = 15 * 60_000

export function useGroundLosses(enabled: boolean) {
  const [losses, setLosses] = useState<GroundLoss[]>([])
  const [status, setStatus] = useState<'idle' | 'live' | 'error'>('idle')

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let timer = 0

    const pull = async () => {
      try {
        const next = await fetchGroundLosses()
        if (cancelled) return
        setLosses(next)
        setStatus('live')
      } catch (err) {
        console.warn('WarSpotting unavailable', err)
        if (!cancelled) setStatus('error')
      }
    }

    void pull()
    timer = window.setInterval(pull, POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [enabled])

  return { losses, status }
}
