import { useEffect, useState } from 'react'
import {
  fetchDsmSnapshot,
  fetchRecentRuStrikes,
  fetchRuRefinerySites,
  pickBurningRefineries,
  type BurningRefinery,
  type DsmStrike,
} from '../lib/droneStrikeMap'

const POLL_MS = 10 * 60_000

export function useDroneStrikeLayer() {
  const [strikes, setStrikes] = useState<DsmStrike[]>([])
  const [burning, setBurning] = useState<BurningRefinery[]>([])
  const [status, setStatus] = useState<'idle' | 'live' | 'error'>('idle')

  useEffect(() => {
    let cancelled = false
    let timer = 0

    const pull = async () => {
      try {
        const [ruStrikes, sites] = await Promise.all([
          fetchRecentRuStrikes(),
          fetchRuRefinerySites(),
        ])
        if (cancelled) return
        setStrikes(ruStrikes)
        setBurning(pickBurningRefineries(sites, ruStrikes))
        setStatus('live')
      } catch (err) {
        console.warn('Drone Strike Map live unavailable, trying snapshot', err)
        const snap = await fetchDsmSnapshot()
        if (cancelled) return
        if (snap && (snap.strikes.length > 0 || snap.burning.length > 0)) {
          setStrikes(snap.strikes)
          setBurning(snap.burning)
          setStatus('live')
          return
        }
        setStatus('error')
      }
    }

    void pull()
    timer = window.setInterval(pull, POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  return { strikes, burning, status }
}
