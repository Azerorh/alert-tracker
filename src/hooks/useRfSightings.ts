import { useEffect, useState } from 'react'
import { fetchRfSightings, type RfSighting } from '../lib/rfSightings'

const POLL_MS = 5 * 60_000

export function useRfSightings(enabled: boolean) {
  const [sightings, setSightings] = useState<RfSighting[]>([])
  const [status, setStatus] = useState<'idle' | 'live' | 'error'>('idle')

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let timer = 0

    const pull = async () => {
      try {
        const next = await fetchRfSightings()
        if (cancelled) return
        setSightings(next)
        setStatus('live')
      } catch (err) {
        console.warn('RF sightings unavailable', err)
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

  return { sightings, status }
}
