import type { Page } from "@playwright/test"
import { createWalletClient, defineChain, http, type Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { CHAIN_ID, CHAIN_ID_HEX, RPC_URL, accounts } from "./deployment"

export const TEST_ACCOUNT = accounts.borrower.address

const chain = defineChain({
  id: CHAIN_ID,
  name: "Safix e2e",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } }
})

/** Pages that already carry a wallet, so a second install is a no-op. */
const installed = new WeakSet<Page>()
/** Pages whose wallet is currently refusing to sign. */
const refusing = new WeakSet<Page>()

/**
 * Makes the wallet decline the next signature, as a person does when they read
 * the prompt and change their mind.
 */
export const refuseSignatures = (page: Page) => refusing.add(page)
export const allowSignatures = (page: Page) => refusing.delete(page)

export type WalletOptions = {
  /** Which anvil account the wallet holds. */
  key?: Hex
  address?: string
  /** What the wallet claims to be on, for the wrong-network case. */
  chainIdHex?: string
  /** Refuse to sign, as a wallet does when the person declines. */
  reject?: boolean
  /** Skip the disclosure gate, which is not what most tests are about. */
  acknowledgeRisk?: boolean
}

/**
 * A wallet that signs.
 *
 * The page gets an EIP-1193 provider; the signing happens in the test process,
 * with viem and a real key, and the signed transaction is what reaches the
 * chain. Nothing about the money path is stubbed: the app builds the calldata,
 * the wallet signs it, the node executes it, and the assertions read the result
 * back off the chain.
 *
 * The earlier version forwarded `eth_sendTransaction` to the node and leaned on
 * anvil having the account unlocked, which signs nothing and only works against
 * a node willing to sign on the caller's behalf.
 */
export async function installWallet(page: Page, options: WalletOptions = {}) {
  if (installed.has(page)) {
    if (options.reject) refuseSignatures(page)
    return
  }
  installed.add(page)
  if (options.reject) refuseSignatures(page)
  const key = options.key ?? (accounts.borrower.key as Hex)
  const account = privateKeyToAccount(key)
  const client = createWalletClient({ account, chain, transport: http(RPC_URL) })

  await page.exposeFunction("__e2eSendTransaction", async (request: Record<string, string>) => {
    if (refusing.has(page)) {
      const error = new Error("User rejected the request.") as Error & { code?: number }
      error.code = 4001
      throw error
    }
    return client.sendTransaction({
      to: request.to as `0x${string}`,
      data: request.data as Hex | undefined,
      value: request.value ? BigInt(request.value) : undefined
    })
  })

  await page.addInitScript(
    ({ account, rpc, chainId, acknowledgeRisk }) => {
      const send = async (method: string, params: unknown[]) => {
        const response = await fetch(rpc, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params })
        }).then(res => res.json())
        if (response.error) {
          const error = new Error(response.error.message) as Error & { code?: number }
          error.code = response.error.code
          throw error
        }
        return response.result
      }

      const listeners = new Map<string, ((payload: unknown) => void)[]>()
      const provider = {
        isMetaMask: true,
        request: async ({ method, params }: { method: string; params?: unknown[] }) => {
          if (method === "eth_requestAccounts" || method === "eth_accounts") return [account]
          if (method === "eth_chainId") return chainId
          if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") return null
          if (method === "eth_sendTransaction") {
            const [request] = (params ?? []) as Record<string, string>[]
            return (window as unknown as {
              __e2eSendTransaction: (tx: Record<string, string>) => Promise<string>
            }).__e2eSendTransaction(request)
          }
          return send(method, params ?? [])
        },
        on: (event: string, handler: (payload: unknown) => void) => {
          listeners.set(event, [...(listeners.get(event) ?? []), handler])
        },
        removeListener: (event: string, handler: (payload: unknown) => void) => {
          listeners.set(event, (listeners.get(event) ?? []).filter(fn => fn !== handler))
        }
      }

      Object.defineProperty(window, "ethereum", { value: provider, writable: true })
      if (acknowledgeRisk) window.localStorage.setItem("safix.risk.acknowledged", "1")
    },
    {
      account: options.address ?? account.address,
      rpc: RPC_URL,
      chainId: options.chainIdHex ?? CHAIN_ID_HEX,
      acknowledgeRisk: options.acknowledgeRisk ?? true
    }
  )
}

export async function acceptRiskGate(page: Page) {
  await page.getByRole("checkbox").first().check()
  await page.getByRole("button", { name: "Continue" }).click()
}

/**
 * Connects through whatever the nav offers.
 *
 * The screen either connects straight away or opens a picker first, depending
 * on how many wallets it can see, so the helper handles both rather than
 * pinning the suite to one of them.
 */
export async function connect(page: Page) {
  const button = page.getByRole("button", { name: /^Connect/ })
  if (!(await button.isVisible().catch(() => false))) return
  await button.click()

  const gate = page.getByRole("dialog", { name: /Before you connect/i })
  if (await gate.isVisible({ timeout: 2000 }).catch(() => false)) await acceptRiskGate(page)

  const picker = page.getByRole("dialog", { name: /Connect a wallet/i })
  if (await picker.isVisible({ timeout: 2000 }).catch(() => false)) {
    // Name the wallet rather than trusting the order: Coinbase and
    // WalletConnect are in this list too, and neither can complete a connection
    // in a headless browser.
    const option = picker
      .locator("li button")
      .filter({ hasText: /injected|metamask|rabby|brave|browser/i })
      .first()
    await option.waitFor({ state: "visible", timeout: 10_000 })
    await option.click()
  }
  // A wallet on a chain the app does not serve is shown a switch control in
  // place of its address, so both count as connected.
  await page
    .locator("button")
    .filter({ hasText: /0x[0-9a-fA-F]{4}|Switch to|Wrong network/ })
    .first()
    .waitFor({ state: "visible", timeout: 30_000 })
}
