import { tokenBySymbol, underlyingTicker } from "./tokens"

/**
 * Where a symbol's logo comes from.
 *
 * The registry in `data/tokens.mainnet.json` is generated from the chain and its images are
 * committed, so the common case is a local file that needs no network at all. A symbol the
 * registry has never seen falls through to an equity logo host. A token whose logo the circle
 * cannot carry has no icon in the registry at all, and `AssetMark` shows its ticker instead:
 * `fit-token-logos` drops a wordmark rather than leave the interface pointing at an image
 * nobody can read at the size it is drawn.
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

export const assetTicker = (symbol: string) => standsFor[symbol] ?? underlyingTicker(symbol)

const registryEntry = (symbol: string) => tokenBySymbol(symbol) ?? tokenBySymbol(assetTicker(symbol))

/**
 * The logo itself, whatever shape it is.
 *
 * A wallet draws a token in a layout of its own, so a wordmark that cannot sit in
 * a circle is still worth handing over: an image nobody chose beats no image.
 */
export const assetIconSrc = (symbol: string): string | null => {
  const own = shipped[symbol]
  if (own) return own
  const entry = registryEntry(symbol)
  if (entry) return entry.icon
  return `https://financialmodelingprep.com/image-stock/${assetTicker(symbol)}.png`
}

/**
 * The logo where the interface draws it in a circle, which most wordmarks cannot
 * survive. `AssetMark` shows the ticker instead when this is null.
 */
export const assetMarkSrc = (symbol: string): string | null => {
  const own = shipped[symbol]
  if (own) return own
  const entry = registryEntry(symbol)
  if (entry) return entry.wideMark ? null : entry.icon
  return `https://financialmodelingprep.com/image-stock/${assetTicker(symbol)}.png`
}

/**
 * What a mark says when it carries no logo.
 *
 * The ticker whole where it fits the circle, and its first two letters where it does not, so the
 * mark names the asset rather than abbreviating it for the sake of abbreviating.
 */
export const assetInitials = (symbol: string) => {
  const ticker = assetTicker(symbol)
  return ticker.length <= 4 ? ticker : ticker.slice(0, 2)
}
