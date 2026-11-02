import { useEffect, useState } from 'react'
import {
  fetchRfAviationSnapshot,
  type RfAviationEvent,
} from '../lib/rfAviation'

const POLL_MS = 60_000

export function useRfAviation(enabled: boolean) {
  const [events, setEvents] = useState<RfAviationEvent[]>([])
  const [status, setStatus] = useState<'idle' | 'live' | 'error'>('idle')

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let timer = 0

    const pull = async () => {
      const next = await fetchRfAviationSnapshot()
      if (cancelled) return
      if (next) {
        setEvents(next.events)
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

  return { events, status }
}
