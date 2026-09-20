import { tokenBySymbol, underlyingTicker } from "./tokens"

/**
 * Where a symbol's logo comes from.
 *
 * The registry in `data/tokens.mainnet.json` is generated from the chain and its images are
 * committed, so the common case is a local file that needs no network at all. A symbol the
 * registry has never seen falls through to an equity logo host, and `AssetMark` falls through
 * again to initials when even that has nothing.
 */
const shipped: Record<string, string> = {
  USDG: "/usdg.svg",
  tUSDG: "/usdg.svg"
}

/**
 * What Safix's own test wrappers stand in for.
 *
 * `tBILL` and `tGOLD` are fixtures rather than tickers, so stripping the prefix finds nothing.
 * Each names an asset the chain actually carries, and borrowing that asset's mark is more honest
 * than a placeholder square: a treasury wrapper should look like a treasury fund.
 */
const standsFor: Record<string, string> = {
  tBILL: "SGOV",
  tGOLD: "GLD"
}

export const assetIconSrc = (symbol: string) => {
  const own = shipped[symbol]
  if (own) return own
  const exact = tokenBySymbol(symbol)
  if (exact?.icon) return exact.icon
  const ticker = standsFor[symbol] ?? underlyingTicker(symbol)
  const underlying = tokenBySymbol(ticker)
  if (underlying?.icon) return underlying.icon
  return `https://financialmodelingprep.com/image-stock/${ticker}.png`
}

export const assetInitials = (symbol: string) => underlyingTicker(symbol).slice(0, 2)
