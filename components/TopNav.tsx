"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { appLinks, normalizePath } from "./nav"

export default function TopNav() {
  const pathname = normalizePath(usePathname())
  const [connected, setConnected] = useState(false)

  return (
    <div className="sticky top-0 z-20 border-b border-line bg-carbon/80 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[1120px] items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-baseline gap-2.5">
          <Link href="/" className="text-[19px] font-bold tracking-[-0.01em] text-fog">
            Safix<span className="text-mint">.</span>
          </Link>
          <span className="text-[11px] tracking-[-0.02em] text-haze">App</span>
        </div>
        <nav className="flex items-center gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {appLinks.map(link => {
            const active = normalizePath(link.href) === pathname
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13.5px] tracking-[-0.01em] transition-colors ${
                  active ? "bg-panel text-mint" : "text-mist hover:text-fog"
                }`}
              >
                {link.title}
              </Link>
            )
          })}
        </nav>
        <button
          onClick={() => setConnected(current => !current)}
          className={`hidden shrink-0 rounded-full px-4.5 py-2 text-[13px] font-semibold tracking-[-0.01em] transition-colors sm:block ${
            connected
              ? "border border-line text-mist hover:border-mint hover:text-mint"
              : "bg-mint text-carbon hover:bg-mint-bright"
          }`}
        >
          {connected ? "0xA3f1…9c2e" : "Connect wallet"}
        </button>
      </div>
    </div>
  )
}
