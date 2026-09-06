"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useAccount, useConnect, useDisconnect } from "wagmi"
import { track } from "@/lib/analytics"
import { activeChain } from "@/lib/chain"
import { clearWalletStorage } from "@/lib/wagmi"
import { walletOptions } from "@/lib/wallets"
import RiskGate, { hasAcknowledgedRisk } from "./RiskGate"
import NetworkNotice from "./NetworkNotice"
import ThemeToggle from "./ThemeToggle"
import WalletDialog from "./WalletDialog"
import { appLinks, normalizePath } from "./nav"

const shortAddress = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`

const actionClass =
  "shrink-0 rounded-[3px] bg-mint px-3.5 py-2 text-[12.5px] font-semibold tracking-[-0.01em] text-ink transition-colors hover:bg-mint-bright disabled:bg-line disabled:text-haze sm:px-4.5 sm:text-[13px]"

function WalletButton() {
  const { address, isConnected } = useAccount()
  const { connectors } = useConnect()
  const { disconnectAsync } = useDisconnect()
  const queryClient = useQueryClient()
  const [gateOpen, setGateOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  const anyWallet = walletOptions(connectors).length > 0

  const disconnect = async () => {
    try {
      await disconnectAsync()
    } catch {
      // A connector that cannot be asked politely is dropped anyway: the state
      // below is what this app shows, and it must not outlive the account.
    }
    // The account is gone; so is every number that was read for it.
    queryClient.removeQueries()
    clearWalletStorage()
  }

  if (!isConnected) {
    return (
      <>
        <RiskGate
          open={gateOpen}
          onAccept={() => {
            setGateOpen(false)
            track("risk_acknowledged")
            track("connect_opened")
            setPickerOpen(true)
          }}
          onDismiss={() => setGateOpen(false)}
        />
        <WalletDialog open={pickerOpen} onClose={() => setPickerOpen(false)} />
        <button
          onClick={() => {
            if (hasAcknowledgedRisk()) {
              track("connect_opened")
              setPickerOpen(true)
            } else {
              setGateOpen(true)
            }
          }}
          className={actionClass}
        >
          {anyWallet ? "Connect wallet" : "Connect"}
        </button>
      </>
    )
  }

  return (
    <button
      onClick={disconnect}
      title="Disconnect"
      className="shrink-0 rounded-[3px] border border-line px-3.5 py-2 text-[12.5px] font-medium tracking-[-0.01em] text-mist transition-colors hover:border-mint hover:text-mint sm:px-4.5 sm:text-[13px]"
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
        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle />
          <WalletButton />
        </div>
      </div>
      <NetworkNotice />
    </div>
  )
}
