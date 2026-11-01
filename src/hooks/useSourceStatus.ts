import { useEffect, useState } from 'react'
import { apiUrl, type StatusPayload } from '../lib/api'

const POLL_MS = 10_000

export function useSourceStatus() {
  const [status, setStatus] = useState<StatusPayload | null>(null)
  const [available, setAvailable] = useState(false)

  useEffect(() => {
    let cancelled = false
    let timer = 0

    const pull = async () => {
      try {
        const res = await fetch(apiUrl('/api/status'))
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = (await res.json()) as StatusPayload
        if (cancelled) return
        setStatus(json)
        setAvailable(true)
      } catch {
        if (!cancelled) setAvailable(false)
      }
    }

    void pull()
    timer = window.setInterval(pull, POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  return { status, available }
}
