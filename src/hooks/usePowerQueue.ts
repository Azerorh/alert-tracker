import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  clearSavedPowerQueue,
  loadSavedPowerQueue,
  resolveSavedQueue,
  savePowerQueue,
  type ResolvedPowerQueue,
  type SavedPowerQueue,
} from '../lib/powerQueue'
import type { PowerOutagesPayload } from '../lib/powerOutages'

export function usePowerQueue(payload: PowerOutagesPayload | null, enabled: boolean) {
  const [saved, setSaved] = useState<SavedPowerQueue | null>(null)

  useEffect(() => {
    if (!enabled) return
    setSaved(loadSavedPowerQueue())
  }, [enabled])

  const resolved: ResolvedPowerQueue | null = useMemo(
    () => (enabled ? resolveSavedQueue(payload, saved) : null),
    [enabled, payload, saved],
  )

  const setQueue = useCallback((next: SavedPowerQueue) => {
    savePowerQueue(next)
    setSaved(next)
  }, [])

  const clearQueue = useCallback(() => {
    clearSavedPowerQueue()
    setSaved(null)
  }, [])

  return { saved, resolved, setQueue, clearQueue }
}
