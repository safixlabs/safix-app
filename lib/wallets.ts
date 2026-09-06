import type { Connector } from "wagmi"

/**
 * Id wagmi gives the plain `injected()` connector when nothing announced itself.
 * Every other injected connector carries its EIP-6963 rdns as its id instead
 * (`io.rabby`, `io.metamask`, and so on), which is what separates the two.
 */
export const GENERIC_INJECTED_ID = "injected"

export type WalletKind = "browser" | "coinbase" | "walletconnect" | "generic"

export type WalletOption = {
  connector: Connector
  id: string
  name: string
  icon?: string
  kind: WalletKind
  detail: string
}

/**
 * Classification keys off `connector.type`, not `connector.id`. The ids are not
 * what they look like: the Coinbase connector is `coinbaseWalletSDK`, and every
 * wallet found over EIP-6963 carries its rdns as the id. `type` is the only
 * field that reliably separates the four cases.
 */
const kindOf = (connector: Connector): WalletKind => {
  if (connector.type === "walletConnect") return "walletconnect"
  if (connector.type === "coinbaseWallet") return "coinbase"
  return connector.id === GENERIC_INJECTED_ID ? "generic" : "browser"
}

const detailOf = (kind: WalletKind): string => {
  if (kind === "walletconnect") return "Scan a code, or open a wallet app on this phone"
  if (kind === "coinbase") return "App, extension or smart wallet"
  if (kind === "generic") return "The wallet injected into this browser"
  return "Detected in this browser"
}

/**
 * Wallets already in the browser first, then the remote options.
 *
 * The plain injected entry ranks second rather than last because it only
 * survives the filter below when nothing announced itself, and in that case it
 * is the wallet this person actually installed. Putting Coinbase above it
 * offers a download to somebody who is already holding a wallet.
 */
const rank: Record<WalletKind, number> = { browser: 0, generic: 1, coinbase: 2, walletconnect: 3 }

/**
 * Turns the raw wagmi connector list into what the picker should show.
 *
 * The only entry that needs dropping here is the plain `injected` connector: it
 * is a catch-all for wallets that never announced themselves, so it is noise
 * next to a wallet that did. Coinbase needs no such handling, because the
 * connector declares `rdns: com.coinbase.wallet` and wagmi already skips the
 * EIP-6963 announcement that would have duplicated it.
 */
export function walletOptions(connectors: readonly Connector[]): WalletOption[] {
  const hasDiscovered = connectors.some(connector => kindOf(connector) === "browser")

  return connectors
    .filter(connector => !(kindOf(connector) === "generic" && hasDiscovered))
    .map(connector => {
      const kind = kindOf(connector)
      return {
        connector,
        id: connector.id,
        name: connector.name,
        icon: connector.icon,
        kind,
        detail: detailOf(kind)
      }
    })
    .sort((a, b) => rank[a.kind] - rank[b.kind])
}

/**
 * True when this browser has a wallet of its own: one announced over EIP-6963,
 * or a plain injected provider. False on a phone browser, or a desktop browser
 * with no extension, where the only ways in are WalletConnect and Coinbase.
 */
export const hasBrowserWallet = (options: readonly WalletOption[]) =>
  options.some(option => option.kind === "browser" || option.kind === "generic")
