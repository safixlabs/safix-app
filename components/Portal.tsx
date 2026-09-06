"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import type { ReactNode } from "react"

/**
 * Renders into `document.body`.
 *
 * The nav bar carries `backdrop-blur`, and a backdrop-filter establishes a
 * containing block for fixed-position descendants. Any overlay rendered from a
 * component inside the nav is therefore positioned against the nav strip rather
 * than the viewport, and gets clipped to it. Portalling out of the nav is what
 * makes `fixed inset-0` mean the viewport again.
 */
export default function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null
  return createPortal(children, document.body)
}
