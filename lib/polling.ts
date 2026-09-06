import { useEffect, useRef } from "react"

/**
 * How often a screen re-reads figures that change without the user acting:
 * the pool's size, somebody else's liquidation, a partnership being funded.
 */
export const REFRESH_MS = Number(process.env.NEXT_PUBLIC_REFRESH_MS ?? 15_000)

/**
 * How long a figure already read stays good enough to reuse. Shorter than the
 * refresh interval, so a deliberate refresh is never served from cache.
 */
export const STALE_MS = Number(process.env.NEXT_PUBLIC_STALE_MS ?? 12_000)

/**
 * Runs a callback on an interval, but only while the tab is being looked at.
 *
 * A hidden tab polling a rate-limited endpoint spends someone's quota to
 * refresh a screen nobody can see. Polling stops when the tab goes away and the
 * callback fires once the moment it comes back, so returning to a stale screen
 * shows current figures immediately rather than after the next tick.
 */
export function useVisibleInterval(callback: () => void, ms: number = REFRESH_MS) {
  const latest = useRef(callback)
  latest.current = callback

  useEffect(() => {
    if (typeof document === "undefined") return

    let timer: ReturnType<typeof setInterval> | undefined

    const stop = () => {
      if (timer) clearInterval(timer)
      timer = undefined
    }

    const start = () => {
      stop()
      timer = setInterval(() => latest.current(), ms)
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        latest.current()
        start()
      } else {
        stop()
      }
    }

    if (document.visibilityState === "visible") start()
    document.addEventListener("visibilitychange", onVisibilityChange)

    return () => {
      stop()
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [ms])
}
