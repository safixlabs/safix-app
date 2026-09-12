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
  },
  contracts: {
    // Canonical Multicall3, deployed at the same address on both chains. It is
    // what lets a screen's reads leave as one call instead of a dozen.
    multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" as const }
  }
})

export const robinhoodTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  testnet: true,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://rpc.testnet.chain.robinhood.com"],
      webSocket: ["wss://feed.testnet.chain.robinhood.com"]
    }
  },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://explorer.testnet.chain.robinhood.com" }
  },
  contracts: {
    // Canonical Multicall3, deployed at the same address on both chains. It is
    // what lets a screen's reads leave as one call instead of a dozen.
    multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" as const }
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

const explorers = (activeChain as { blockExplorers?: { default: { url: string } } }).blockExplorers

export const explorerTxUrl = (hash?: `0x${string}`) =>
  hash && explorers ? `${explorers.default.url}/tx/${hash}` : undefined

export const explorerAddressUrl = (address?: `0x${string}`) =>
  address && explorers ? `${explorers.default.url}/address/${address}` : undefined
