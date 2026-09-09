import type { ReactNode } from "react"
import { pageMetadata } from "@/lib/metadata"

// The screen itself is a client component and cannot export metadata, so the
// segment carries it.
export const metadata = pageMetadata(
  "/passport/",
  "A reusable private proof of your borrowing power. Counterparties see that the requirements are met, never the portfolio behind the proof."
)

export default function Layout({ children }: { children: ReactNode }) {
  return children
}
