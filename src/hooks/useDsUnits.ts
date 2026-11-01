import { useEffect, useState } from 'react'
import { DS_UNITS_GEOJSON_URL } from '../lib/neptun'
import { parseDsUnitsGeoJson, type DsUnit } from '../lib/dsUnits'

export function useDsUnits(enabled: boolean) {
  const [units, setUnits] = useState<DsUnit[]>([])
  const [status, setStatus] = useState<'idle' | 'live' | 'error'>('idle')

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(DS_UNITS_GEOJSON_URL)
        if (!res.ok) throw new Error(`units ${res.status}`)
        const parsed = parseDsUnitsGeoJson(await res.json())
        if (cancelled) return
        setUnits(parsed)
        setStatus('live')
      } catch (err) {
        console.warn('DeepState units unavailable', err)
        if (!cancelled) setStatus('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [enabled])

  return { units, status }
}
