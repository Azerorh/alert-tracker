import { useEffect, useState } from 'react'

/** Animation-friendly clock; throttled to ~10fps for React consumers. */
export function useNow(active = true): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!active) return
    let lastEmit = 0
    let raf = 0

    const tick = (t: number) => {
      if (t - lastEmit > 100) {
        lastEmit = t
        setNow(Date.now())
      }
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active])

  return now
}
