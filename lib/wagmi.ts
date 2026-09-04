import { fallback, http, createConfig } from "wagmi"
import { injected } from "wagmi/connectors"
import { activeChain, localChain, robinhood, robinhoodTestnet } from "./chain"

const batch = { batch: { batchSize: 24, wait: 16 } } as const

const transportFor = (urls: (string | undefined)[]) => {
  const endpoints = urls.filter((url): url is string => Boolean(url))
  const transports = endpoints.map(url => http(url, { ...batch, retryCount: 2, timeout: 12_000 }))
  return transports.length > 1 ? fallback(transports, { rank: false }) : transports[0]
}

const remainingChains = [robinhoodTestnet, robinhood, localChain].filter(chain => chain.id !== activeChain.id)

export const wagmiConfig = createConfig({
  chains: [activeChain, ...remainingChains],
  connectors: [injected()],
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
