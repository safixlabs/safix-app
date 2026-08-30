import { http, createConfig } from "wagmi"
import { injected } from "wagmi/connectors"
import { activeChain, localChain, robinhood, robinhoodTestnet } from "./chain"

const remainingChains = [robinhoodTestnet, robinhood, localChain].filter(
  chain => chain.id !== activeChain.id
)

export const wagmiConfig = createConfig({
  chains: [activeChain, ...remainingChains],
  connectors: [injected()],
  transports: {
    [robinhoodTestnet.id]: http(robinhoodTestnet.rpcUrls.default.http[0]),
    [robinhood.id]: http(robinhood.rpcUrls.default.http[0]),
    [localChain.id]: http(localChain.rpcUrls.default.http[0])
  },
  ssr: false
})
