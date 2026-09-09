import mainnet from "@/data/tokens.mainnet.json"
import { activeChain, robinhood } from "./chain"

export type ChainToken = {
  address: string
  symbol: string
  name: string | null
  decimals: number
  /** Carries ERC-8056 `uiMultiplier`, which on this chain means a tokenized equity. */
  scaled: boolean
  icon: string | null
}

type Registry = {
  chain: string
  chainId: number
  explorer: string
  syncedAt: string
  scannedToBlock: number
  scannedBlocks: number
  tokens: ChainToken[]
}

const registry = mainnet as Registry

export const chainTokens = registry.tokens

export const tokenRegistry = {
  chainId: registry.chainId,
  explorer: registry.explorer,
  syncedAt: registry.syncedAt,
  scannedToBlock: registry.scannedToBlock,
  scannedBlocks: registry.scannedBlocks,
  /** The registry is read from mainnet; a testnet build says so rather than implying it applies. */
  describesActiveChain: registry.chainId === activeChain.id,
  chainName: robinhood.name
}

const bySymbol = new Map(registry.tokens.map(token => [token.symbol.toUpperCase(), token]))
const byAddress = new Map(registry.tokens.map(token => [token.address.toLowerCase(), token]))

export const tokenBySymbol = (symbol: string) => bySymbol.get(symbol.toUpperCase())
export const tokenByAddress = (address: string) => byAddress.get(address.toLowerCase())

/**
 * The ticker behind a wrapper symbol.
 *
 * Safix's own test assets are named after what they hold (`tBILL`, `bNVDA`, `tGOLD`), so the
 * leading letter is a prefix rather than part of the ticker. Stripping it is what lets a wrapper
 * find the underlying asset's logo in the registry.
 */
export const underlyingTicker = (symbol: string) => symbol.replace(/^[bt](?=[A-Z]{2,})/, "").toUpperCase()

export const equityTokens = registry.tokens.filter(token => token.scaled)
export const settlementTokens = registry.tokens.filter(token => !token.scaled)
