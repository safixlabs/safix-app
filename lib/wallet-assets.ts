"use client"

import { useCallback } from "react"
import type { Address } from "viem"
import { useAccount, useReadContracts, useWatchAsset } from "wagmi"
import { assetIconSrc } from "./assets"
import { activeChain } from "./chain"
import { erc20Abi } from "./safix"

/**
 * Tokens this browser has already been offered, per chain.
 *
 * The offer that follows a draw or a faucet mint is made once. A wallet that
 * accepted it lists the token; a wallet that refused, or could not be asked,
 * has the same control waiting on the screen with the address beside it. The
 * key carries no account: this is a preference of the browser, like the theme,
 * not state of the wallet, so a disconnect does not clear it and it never
 * records who was connected.
 */
const offeredKey = (token: Address) => `safix.offered.${activeChain.id}.${token.toLowerCase()}`

export function wasOffered(token: Address) {
  try {
    return window.localStorage.getItem(offeredKey(token)) === "1"
  } catch {
    return false
  }
}

export function markOffered(token: Address) {
  try {
    window.localStorage.setItem(offeredKey(token), "1")
  } catch {
    // A storage that refuses writes means the offer is made again next time,
    // which is the smaller fault.
  }
}

/**
 * The logo the wallet is handed, as an absolute URL. Wallets fetch it
 * themselves, so a path relative to this origin means nothing to them.
 */
/**
 * The raster a wallet is handed in place of a vector.
 *
 * `wallet_watchAsset` image support for SVG is uneven across wallets, and a
 * token that arrives with no image at all is the failure this avoids. The
 * interface keeps the vector, which stays crisp at every size it is drawn.
 */
const rasterFor: Record<string, string> = {
  "/usdg.svg": "/usdg.png"
}

const imageFor = (symbol: string) => {
  if (typeof window === "undefined") return undefined
  // An asset whose logo the circle cannot carry has none to hand over either. A
  // wallet showing no image is better than one showing an unreadable card.
  const icon = assetIconSrc(symbol)
  if (!icon) return undefined
  const src = rasterFor[icon] ?? icon
  try {
    return new URL(src, window.location.origin).href
  } catch {
    return undefined
  }
}

/**
 * `wallet_watchAsset` for one token.
 *
 * The symbol and decimals the wallet is told are read from the token contract,
 * never from a table here: a wallet that lists a token under a name or a scale
 * the contract does not carry is a wallet showing the wrong balance.
 *
 * Refusal is not an error. A wallet that declines, or that does not implement
 * the method at all — some WalletConnect sessions do not — leaves the screen
 * exactly as it was, with the address still there to copy.
 */
export function useWalletAsset(token: Address | undefined) {
  const { isConnected, chainId } = useAccount()
  const metadata = useReadContracts({
    contracts: [
      { chainId: activeChain.id, abi: erc20Abi, address: token, functionName: "symbol" },
      { chainId: activeChain.id, abi: erc20Abi, address: token, functionName: "decimals" }
    ],
    // Neither ever changes, so neither is ever worth reading twice.
    query: { enabled: Boolean(token), staleTime: Infinity }
  })
  const { mutateAsync, isPending } = useWatchAsset()

  const symbol = metadata.data?.[0]?.result as string | undefined
  const decimals = metadata.data?.[1]?.result as number | undefined

  // The request goes to whichever chain the wallet is on, so a wallet sitting
  // on another network would be handed an address that means nothing there.
  // Whatever holds the request back is said, rather than leaving the button grey.
  const reason = !isConnected
    ? "Connect a wallet first."
    : chainId !== activeChain.id
      ? `Switch the wallet to ${activeChain.name} first.`
      : token && symbol && decimals !== undefined
        ? null
        : metadata.isError
          ? "The token's details could not be read, so the wallet cannot be told what it is."
          : "Reading the token's details…"
  const ready = reason === null

  const add = useCallback(async () => {
    if (!token || !symbol || decimals === undefined) return false
    // Asking counts, whatever the answer: the wallet's own prompt is the one
    // place this should be decided, and it is not asked twice.
    markOffered(token)
    try {
      return await mutateAsync({
        type: "ERC20",
        options: { address: token, symbol, decimals, image: imageFor(symbol) }
      })
    } catch {
      return false
    }
  }, [token, symbol, decimals, mutateAsync])

  return { symbol, decimals, ready, reason, add, isPending }
}
