"use client"

import type { ReactNode } from "react"
import { useState } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { WagmiProvider } from "wagmi"
import { STALE_MS } from "@/lib/polling"
import { wagmiConfig } from "@/lib/wagmi"

export default function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Reads are cheap to keep and expensive to repeat against a rate
            // limited endpoint, so a figure read a moment ago is reused rather
            // than fetched again when a screen remounts or the tab regains
            // focus. Anything that actually changed arrives on the next refresh
            // or straight after the transaction that changed it.
            staleTime: STALE_MS,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
            // A hidden tab does not poll: nobody is reading the screen, and the
            // quota is shared with people who are.
            refetchIntervalInBackground: false,
            retry: 2,
            retryDelay: attempt => Math.min(1_000 * 2 ** attempt, 8_000)
          }
        }
      })
  )

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  )
}
