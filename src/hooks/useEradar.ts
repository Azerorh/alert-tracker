import { useEffect, useState } from 'react'
import {
  fetchEradarSnapshot,
  type EradarPayload,
  type EradarZone,
} from '../lib/eradar'

const POLL_MS = 60_000

export function useEradar(enabled: boolean) {
  const [payload, setPayload] = useState<EradarPayload | null>(null)
  const [status, setStatus] = useState<'idle' | 'live' | 'error'>('idle')

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let timer = 0

    const pull = async () => {
      const next = await fetchEradarSnapshot()
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
    zones: (payload?.zones ?? []) as EradarZone[],
    status,
  }
}
