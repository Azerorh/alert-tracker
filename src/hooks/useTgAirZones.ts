import { useEffect, useState } from 'react'
import { fetchMergedTgAirZones, type TgAirZone } from '../lib/tgAirZones'

const POLL_MS = 60_000

/** Merged eRadar + UA monitor TG place buffers (one map layer). */
export function useTgAirZones(enabled: boolean) {
  const [zones, setZones] = useState<TgAirZone[]>([])
  const [eradarCount, setEradarCount] = useState(0)
  const [uaTgCount, setUaTgCount] = useState(0)
  const [status, setStatus] = useState<'idle' | 'live' | 'error'>('idle')

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let timer = 0

    const pull = async () => {
      const next = await fetchMergedTgAirZones()
      if (cancelled) return
      if (next.ok || next.zones.length > 0) {
        setZones(next.zones)
        setEradarCount(next.eradarCount)
        setUaTgCount(next.uaTgCount)
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

  return { zones, eradarCount, uaTgCount, status }
}
