import { createConfig, createStorage, fallback, http, noopStorage } from "wagmi"
import { coinbaseWallet, injected, walletConnect } from "wagmi/connectors"
import { activeChain, localChain, robinhood, robinhoodTestnet } from "./chain"
import { SUBMITTED_STORAGE_PREFIX } from "./submitted"

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
 * Prefix wagmi persists its state under in localStorage. Declared here rather
 * than left to the library default so disconnect can clear it deterministically.
 */
export const WAGMI_STORAGE_KEY = "wagmi"

const browserStorage = typeof window !== "undefined" ? window.localStorage : undefined

/**
 * Everything the wallet layer writes to localStorage.
 *
 * wagmi's own store is only part of it. The WalletConnect modal ships Reown's
 * AppKit, which keeps its own connection status and last namespace under
 * `@appkit/`, and holds the relay session under `wc@2:`. Coinbase's connector
 * pulls in the Base account SDK, which keeps a store of its own. All of it is
 * session state for an account that has just been disconnected, so all of it
 * goes.
 *
 * The transactions the app recorded as this wallet's, kept so its history can
 * list the ones that left no event, go too: on a shared machine they would say
 * which wallet was here.
 *
 * Nothing outside this list is touched. `localhost:3000` is a shared origin
 * across every local project, and the app's other preferences (`safix.`) are not
 * wallet state.
 */
const WALLET_STORAGE_PREFIXES = [
  `${WAGMI_STORAGE_KEY}.`,
  "@appkit/",
  "@w3m/",
  "wc@2:",
  "WALLETCONNECT_DEEPLINK_CHOICE",
  "WCM_",
  "base-acc-sdk.",
  "cbwsdk.",
  "-walletlink:",
  SUBMITTED_STORAGE_PREFIX
]

/**
 * Removes every trace of the disconnected session: the connection store, the
 * last used connector, the WalletConnect relay session and modal state, and the
 * Coinbase SDK store. Without this a disconnect leaves enough behind for the
 * next page load to silently reconnect the account the user just signed out of.
 */
export function clearWalletStorage() {
  if (!browserStorage) return
  const doomed: string[] = []
  for (let index = 0; index < browserStorage.length; index += 1) {
    const key = browserStorage.key(index)
    if (key && WALLET_STORAGE_PREFIXES.some(prefix => key.startsWith(prefix))) doomed.push(key)
  }
  for (const key of doomed) {
    try {
      browserStorage.removeItem(key)
    } catch {
      // A storage that refuses writes (private mode, blocked site data) has
      // nothing persisted to clear in the first place.
    }
  }
}

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim()

/** WalletConnect is only offered when a real project id is configured. */
export const walletConnectReady = Boolean(walletConnectProjectId)

const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || (typeof window !== "undefined" ? window.location.origin : undefined)

const metadata = appUrl
  ? {
      name: "Safix",
      description: "Borrow USDG against tokenized assets at zero interest.",
      url: appUrl,
      icons: [`${appUrl}/logo.png`]
    }
  : undefined

const connectors = [
  injected({ shimDisconnect: true }),
  coinbaseWallet({ appName: "Safix", appLogoUrl: appUrl ? `${appUrl}/logo.png` : undefined }),
  ...(walletConnectProjectId
    ? [
        walletConnect({
          projectId: walletConnectProjectId,
          showQrModal: true,
          ...(metadata ? { metadata } : {})
        })
      ]
    : [])
]

/** The endpoints the active chain is read through, in the order they are tried; see lib/chain.ts. */
export { rpcEndpoints } from "./chain"

export const wagmiConfig = createConfig({
  chains: [activeChain, ...remainingChains],
  connectors,
  // Two layers of batching, and they compose. Multicall folds every `eth_call`
  // a screen makes into one call to Multicall3; the transport's own batching
  // then packs whatever is left, and the multicall itself, into one HTTP body.
  batch: { multicall: { batchSize: 1024, wait: 24 } },
  storage: createStorage({
    key: WAGMI_STORAGE_KEY,
    storage: browserStorage ?? noopStorage
  }),
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
  // The pages are prerendered with no wallet. With `ssr: false` wagmi restores a
  // stored connection during the first client render, so that render names an
  // account the prerendered HTML never had and hydration fails. `ssr: true`
  // restores it just after mount instead, and reconnects from there.
  ssr: true
})
