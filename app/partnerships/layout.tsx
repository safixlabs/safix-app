import type { ReactNode } from "react"
import { pageMetadata } from "@/lib/metadata"

// The screen itself is a client component and cannot export metadata, so the
// segment carries it.
export const metadata = pageMetadata(
  "/partnerships/",
  "For financing tied to a business, the pool acts as a partner instead of a creditor. Profit splits at a pre-agreed ratio; genuine losses fall on the capital."
)

export default function Layout({ children }: { children: ReactNode }) {
  return children
}
