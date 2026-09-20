"use client"

import { useAccount, useSwitchChain } from "wagmi"
import { activeChain } from "@/lib/chain"
import { humanError } from "@/lib/errors"
import RobinhoodText from "./RobinhoodText"

/**
 * A wallet can sit on a chain Safix does not run on, and over WalletConnect it
 * often will: the session only carries the chains the wallet approved when it
 * connected, so a wallet that had never heard of this chain cannot be switched
 * into it after the fact. That case has to say so in words rather than leave a
 * button that quietly fails, which is why the switch lives here with room for
 * the network's name and for whatever the wallet said when it refused.
 */
export default function NetworkNotice() {
  const { isConnected, chainId } = useAccount()
  const { switchChain, isPending, error } = useSwitchChain()

  if (!isConnected || chainId === activeChain.id) return null

  return (
    <div role="status" className="border-b border-amber/40 bg-amber/10">
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-2.5 px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold tracking-[-0.01em] text-fog">
            Your wallet is on the wrong network
          </p>
          <p className="mt-0.5 text-[12.5px] leading-[1.5] tracking-[-0.01em] text-mist">
            {error ? (
              <>
                {humanError(error)} Add <RobinhoodText>{activeChain.name}</RobinhoodText> in your wallet, then reconnect.
              </>
            ) : (
              <>Safix runs on <RobinhoodText>{activeChain.name}</RobinhoodText>. Nothing on screen is yours until you switch.</>
            )}
          </p>
        </div>
        <button
          onClick={() => switchChain({ chainId: activeChain.id })}
          disabled={isPending}
          className={`${activeChain.name.startsWith("Robinhood") ? "robinhood-action " : ""}shrink-0 self-start rounded-[var(--corner-control)] bg-mint px-4 py-2 text-[12.5px] font-semibold tracking-[-0.01em] text-ink transition-colors hover:bg-mint-bright disabled:bg-line disabled:text-haze sm:self-auto`}
        >
          {isPending ? "Switching…" : `Switch to ${activeChain.name}`}
        </button>
      </div>
    </div>
  )
}
