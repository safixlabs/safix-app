"use client"

import { useAccount, useBalance } from "wagmi"
import { activeChain, faucetUrl } from "@/lib/chain"

/**
 * A wallet with no gas cannot do anything here, and nothing else on the screen
 * says so.
 *
 * Every control the interface offers ends in a transaction, so an empty wallet
 * meets a chain of buttons that look ready and a wallet prompt that fails at the
 * last step. Someone arriving for the first time reads that as the app being
 * broken. It is cheaper to say it before they press anything.
 *
 * The balance is read rather than assumed, so this disappears the moment the
 * wallet is funded without anybody reloading the page.
 */
export default function GasNotice() {
  const { address, isConnected, chainId } = useAccount()
  const { data: balance } = useBalance({ address, query: { enabled: Boolean(address) } })

  if (!isConnected || chainId !== activeChain.id) return null
  // Undefined is a balance not read yet, which is not the same as empty.
  if (balance === undefined || balance.value > 0n) return null

  return (
    <div role="status" className="border-b border-line bg-carbon/60">
      <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center gap-x-3 gap-y-1 px-6 py-2.5">
        <span className="text-[13px] tracking-[-0.01em] text-fog">
          This wallet holds no {activeChain.nativeCurrency.symbol} on {activeChain.name}.
        </span>
        <span className="text-[13px] tracking-[-0.01em] text-haze">
          Every action here is a transaction, so it needs gas before anything will go through.
        </span>
        {faucetUrl ? (
          <a
            href={faucetUrl}
            target="_blank"
            rel="noreferrer"
            className="text-[13px] text-mint transition-colors hover:text-mint-bright"
          >
            Get test {activeChain.nativeCurrency.symbol} <span aria-hidden>↗</span>
            <span className="sr-only">, opens in a new tab</span>
          </a>
        ) : null}
      </div>
    </div>
  )
}
