import { http, createConfig } from "wagmi"
import { injected } from "wagmi/connectors"
import { robinhood, robinhoodTestnet } from "./chain"

export const wagmiConfig = createConfig({
  chains: [robinhoodTestnet, robinhood],
  connectors: [injected()],
  transports: {
    [robinhoodTestnet.id]: http(robinhoodTestnet.rpcUrls.default.http[0]),
    [robinhood.id]: http(robinhood.rpcUrls.default.http[0])
  },
  ssr: false
})
