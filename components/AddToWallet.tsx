"use client"

import { useEffect, useState } from "react"
import type { Address } from "viem"
import { explorerAddressUrl } from "@/lib/chain"
import { markOffered, useWalletAsset } from "@/lib/wallet-assets"
import { GhostButton } from "./ui"

const shortAddress = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`

/**
 * The token's address, readable and copyable.
 *
 * This is the part that must survive everything else failing: a wallet that
 * refuses the request, or was never able to receive one, still needs the
 * address, and it is right here rather than on an explorer somewhere.
 */
function AddressLine({ address, name }: { address: Address; name: string }) {
  const [copied, setCopied] = useState(false)
  const url = explorerAddressUrl(address)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
    } catch {
      // No clipboard, no change: the address is still on screen and the
      // explorer link still opens it in full.
    }
  }

  // A paragraph, so the link is a link inside a sentence rather than a
  // target of its own: the buttons beside it are the targets.
  return (
    <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <span className="text-haze">{name} contract</span>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          title={address}
          className="text-mist transition-colors hover:text-mint [font-variant-numeric:tabular-nums]"
        >
          {shortAddress(address)} <span aria-hidden>↗</span>
          <span className="sr-only">, {address}, opens in a new tab</span>
        </a>
      ) : (
        <span title={address} className="text-mist [font-variant-numeric:tabular-nums]">
          {shortAddress(address)}
          <span className="sr-only">, {address}</span>
        </span>
      )}
      <GhostButton size="xs" onClick={copy} aria-label={copied ? `${name} address copied` : `Copy the ${name} address`}>
        {copied ? "Copied" : "Copy"}
      </GhostButton>
    </p>
  )
}

/**
 * The quiet control: one line with the address and the button that hands the
 * token to the wallet, for a wallet that already holds it.
 *
 * `symbol` is only what the button says until the contract has answered; the
 * request itself carries the token's own symbol and decimals, never this one.
 */
export function TokenHandle({ address, symbol: fallback }: { address: Address; symbol: string }) {
  const { symbol, ready, add, isPending } = useWalletAsset(address)
  const name = symbol ?? fallback

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[12.5px] tracking-[-0.02em]">
      <AddressLine address={address} name={name} />
      <GhostButton size="xs" onClick={() => void add()} disabled={!ready || isPending}>
        Add {name} to wallet
      </GhostButton>
    </div>
  )
}

/**
 * The offer that follows a draw or a faucet mint, made once.
 *
 * Either answer ends it: the wallet's own prompt is where the question is
 * decided, and a person who said no there is not asked again by this screen.
 * A wallet that refused, or could not be asked, changes nothing here beyond
 * the offer going away — the address stays on screen. It is part of the offer
 * unless the panel already carries it on a line of its own (`showAddress`).
 */
export function WalletOffer({
  address,
  symbol: fallback,
  showAddress = true,
  onDone
}: {
  address: Address
  symbol: string
  showAddress?: boolean
  onDone: () => void
}) {
  const { symbol, ready, add, isPending } = useWalletAsset(address)
  const name = symbol ?? fallback

  const accept = async () => {
    await add()
    onDone()
  }

  const decline = () => {
    markOffered(address)
    onDone()
  }

  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-[3px] border border-line bg-carbon/30 p-3.5 text-[12.5px] leading-[1.5] tracking-[-0.01em]"
    >
      <p className="text-mist">
        {name} is in your wallet now, but most wallets do not list a token until they are told its
        address. Adding it shows the balance there; nothing here changes either way.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 tracking-[-0.02em]">
        <span className="flex flex-wrap items-center gap-2">
          <GhostButton size="xs" onClick={() => void accept()} disabled={!ready || isPending}>
            Add {name} to wallet
          </GhostButton>
          <GhostButton size="xs" onClick={decline} disabled={isPending}>
            Not now
          </GhostButton>
        </span>
        {showAddress ? <AddressLine address={address} name={name} /> : null}
      </div>
    </div>
  )
}
