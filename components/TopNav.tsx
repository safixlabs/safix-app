"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi"
import { activeChain } from "@/lib/chain"
import { appLinks, normalizePath } from "./nav"

const shortAddress = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`

function WalletButton() {
  const { address, chainId, isConnected } = useAccount()
  const { connect, connectors, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending: switching } = useSwitchChain()

  const injectedConnector = connectors[0]
  const wrongNetwork = isConnected && chainId !== activeChain.id

  if (!isConnected) {
    return (
      <button
        onClick={() => injectedConnector && connect({ connector: injectedConnector })}
        disabled={!injectedConnector || isPending}
        className="hidden shrink-0 rounded-[3px] bg-mint px-4.5 py-2 text-[13px] font-semibold tracking-[-0.01em] text-carbon transition-colors hover:bg-mint-bright disabled:bg-line disabled:text-haze sm:block"
      >
        {isPending ? "Connecting…" : injectedConnector ? "Connect wallet" : "No wallet detected"}
      </button>
    )
  }

  if (wrongNetwork) {
    return (
      <button
        onClick={() => switchChain({ chainId: activeChain.id })}
        disabled={switching}
        className="hidden shrink-0 rounded-[3px] bg-mint px-4.5 py-2 text-[13px] font-semibold tracking-[-0.01em] text-carbon transition-colors hover:bg-mint-bright sm:block"
      >
        {switching ? "Switching…" : `Switch to ${activeChain.name}`}
      </button>
    )
  }

  return (
    <button
      onClick={() => disconnect()}
      title="Disconnect"
      className="hidden shrink-0 rounded-[3px] border border-line px-4.5 py-2 text-[13px] font-medium tracking-[-0.01em] text-mist transition-colors hover:border-mint hover:text-mint sm:block"
    >
      {address ? shortAddress(address) : "Connected"}
    </button>
  )
}

export default function TopNav() {
  const pathname = normalizePath(usePathname())

  return (
    <div className="sticky top-0 z-20 border-b border-line bg-carbon/80 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[1120px] items-center justify-between gap-4 px-6 py-4">
        <div className="flex shrink-0 items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5">
            <img src="/logo.png" alt="" className="h-7 w-7" />
            <span className="text-[19px] font-bold tracking-[-0.01em] text-fog">Safix</span>
          </Link>
          <span className="hidden whitespace-nowrap text-[11px] tracking-[-0.02em] text-haze lg:block">{activeChain.name}</span>
        </div>
        <nav className="flex items-center gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {appLinks.map(link => {
            const active = normalizePath(link.href) === pathname
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`whitespace-nowrap rounded-[3px] px-3.5 py-1.5 text-[13.5px] tracking-[-0.01em] transition-colors ${
                  active ? "bg-panel text-mint" : "text-mist hover:text-fog"
                }`}
              >
                {link.title}
              </Link>
            )
          })}
        </nav>
        <WalletButton />
      </div>
    </div>
  )
}
