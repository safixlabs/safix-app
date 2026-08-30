import { defineChain } from "viem"

export const robinhood = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://rpc.mainnet.chain.robinhood.com"],
      webSocket: ["wss://feed.mainnet.chain.robinhood.com"]
    }
  },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" }
  }
})

export const robinhoodTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  testnet: true,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_RPC_OVERRIDE ?? "https://rpc.testnet.chain.robinhood.com"],
      webSocket: ["wss://feed.testnet.chain.robinhood.com"]
    }
  },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://explorer.testnet.chain.robinhood.com" }
  }
})

export const localChain = defineChain({
  id: 31337,
  name: "Local Anvil",
  testnet: true,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["http://127.0.0.1:8545"] }
  }
})

export const activeChain =
  process.env.NEXT_PUBLIC_CHAIN === "mainnet"
    ? robinhood
    : process.env.NEXT_PUBLIC_CHAIN === "local"
      ? localChain
      : robinhoodTestnet
