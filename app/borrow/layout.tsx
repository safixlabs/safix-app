import type { ReactNode } from "react"
import { pageMetadata } from "@/lib/metadata"

// The screen itself is a client component and cannot export metadata, so the
// segment carries it.
export const metadata = pageMetadata(
  "/borrow/",
  "Lock a tokenized asset, draw USDG, pay one fee at the door. The debt you see at draw is the debt you repay."
)

export default function Layout({ children }: { children: ReactNode }) {
  return children
}
