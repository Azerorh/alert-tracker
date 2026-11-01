import { useEffect, useState } from 'react'
import {
  fetchGeoConfirmedGround,
  type GcGroundMarker,
} from '../lib/geoConfirmedGround'

const POLL_MS = 15 * 60_000

export function useGeoConfirmedGround(enabled: boolean) {
  const [markers, setMarkers] = useState<GcGroundMarker[]>([])
  const [status, setStatus] = useState<'idle' | 'live' | 'error'>('idle')

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let timer = 0

    const pull = async () => {
      try {
        const next = await fetchGeoConfirmedGround()
        if (cancelled) return
        setMarkers(next)
        setStatus('live')
      } catch (err) {
        console.warn('GeoConfirmed ground unavailable', err)
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

  return { markers, status }
}
