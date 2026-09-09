import type { ReactNode } from "react"
import { pageMetadata } from "@/lib/metadata"

// The screen itself is a client component and cannot export metadata, so the
// segment carries it.
export const metadata = pageMetadata(
  "/pool/",
  "The stability pool funds every draw and absorbs every liquidation. Providers earn from real events, liquidation gains and protocol rewards, never from time."
)

export default function Layout({ children }: { children: ReactNode }) {
  return children
}
