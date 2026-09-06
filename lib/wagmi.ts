import { fallback, http, createConfig } from "wagmi"
import { injected } from "wagmi/connectors"
import { activeChain, localChain, robinhood, robinhoodTestnet } from "./chain"

const batch = { batch: { batchSize: 24, wait: 16 } } as const

const transportFor = (urls: (string | undefined)[]) => {
  const endpoints = urls.filter((url): url is string => Boolean(url))
  // Patient enough to ride out a blip, not so patient that a screen sits blank
  // for a minute before anyone is told. Two endpoints at this setting still give
  // an outage 32 seconds to resolve itself before the notice appears.
  const transports = endpoints.map(url => http(url, { ...batch, retryCount: 1, timeout: 8_000 }))
  return transports.length > 1 ? fallback(transports, { rank: false }) : transports[0]
}

const remainingChains = [robinhoodTestnet, robinhood, localChain].filter(chain => chain.id !== activeChain.id)

/**
 * The endpoints the active chain is read through, in the order they are tried.
 * Exported so a health check can ask the same nodes the app asks, rather than
 * guessing at one.
 */
export const rpcEndpoints: string[] = (
  activeChain.id === localChain.id
    ? [localChain.rpcUrls.default.http[0]]
    : [
        process.env.NEXT_PUBLIC_RPC_OVERRIDE,
        process.env.NEXT_PUBLIC_RPC_FALLBACK,
        activeChain.rpcUrls.default.http[0]
      ]
).filter((url): url is string => Boolean(url))

export const wagmiConfig = createConfig({
  chains: [activeChain, ...remainingChains],
  connectors: [injected()],
  // Two layers of batching, and they compose. Multicall folds every `eth_call`
  // a screen makes into one call to Multicall3; the transport's own batching
  // then packs whatever is left, and the multicall itself, into one HTTP body.
  batch: { multicall: { batchSize: 1024, wait: 24 } },
  transports: {
    [robinhoodTestnet.id]: transportFor([
      process.env.NEXT_PUBLIC_RPC_OVERRIDE,
      process.env.NEXT_PUBLIC_RPC_FALLBACK,
      robinhoodTestnet.rpcUrls.default.http[0]
    ]),
    [robinhood.id]: transportFor([
      process.env.NEXT_PUBLIC_RPC_OVERRIDE,
      process.env.NEXT_PUBLIC_RPC_FALLBACK,
      robinhood.rpcUrls.default.http[0]
    ]),
    [localChain.id]: transportFor([localChain.rpcUrls.default.http[0]])
  },
  ssr: false
})
