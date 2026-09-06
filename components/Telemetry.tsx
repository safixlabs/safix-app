"use client"

import { useEffect } from "react"
import Script from "next/script"
import { analyticsReady, analyticsScript } from "@/lib/analytics"
import { startMonitoring } from "@/lib/monitoring"

/**
 * Starts error reporting, and loads the analytics script if one is configured.
 *
 * Both are absent unless their environment variable is set, so a fork, a
 * preview build or a local run reports nothing anywhere by default. The script
 * is cookieless and carries no identifier of its own; page views are counted by
 * the script, and the funnels are recorded by `track` at the point the step
 * happens.
 */
export default function Telemetry() {
  useEffect(() => {
    startMonitoring()
  }, [])

  if (!analyticsReady || !analyticsScript) return null

  return (
    <>
      <Script src={analyticsScript} strategy="afterInteractive" />
      <Script id="plausible-init" strategy="afterInteractive">
        {`window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)};window.plausible.init=window.plausible.init||function(i){plausible.o=i||{}};window.plausible.init()`}
      </Script>
    </>
  )
}
