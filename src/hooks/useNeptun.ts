import { useEffect, useState } from 'react'
import {
  NEPTUN_BASE,
  RealtimeClient,
  type RealtimeSnapshot,
} from '../lib/neptun'

const emptySnap: RealtimeSnapshot = {
  threats: [],
  alerts: [],
  alertOblasts: [],
  status: 'connecting',
  lastUpdatedAt: new Date().toISOString(),
  pulseKey: 0,
}

export function useNeptun(): RealtimeSnapshot {
  const [snap, setSnap] = useState<RealtimeSnapshot>(emptySnap)

  useEffect(() => {
    const client = new RealtimeClient(NEPTUN_BASE)
    const unsub = client.subscribe(setSnap)
    client.start()
    return () => {
      unsub()
      client.stop()
    }
  }, [])

  return snap
}
