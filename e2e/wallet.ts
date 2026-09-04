import type { Page } from "@playwright/test"

export const TEST_ACCOUNT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"

export async function installWallet(page: Page, rpcUrl = "http://127.0.0.1:8545", chainIdHex = "0x7a69") {
  await page.addInitScript(
    ({ account, rpc, chainId }) => {
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

      const provider = {
        isMetaMask: true,
        request: async ({ method, params }: { method: string; params?: unknown[] }) => {
          if (method === "eth_requestAccounts" || method === "eth_accounts") return [account]
          if (method === "eth_chainId") return chainId
          if (method === "wallet_switchEthereumChain") return null
          return send(method, params ?? [])
        },
        on: () => {},
        removeListener: () => {}
      }

      Object.defineProperty(window, "ethereum", { value: provider, writable: true })
      window.localStorage.setItem("safix.risk.acknowledged", "1")
    },
    { account: TEST_ACCOUNT, rpc: rpcUrl, chainId: chainIdHex }
  )
}

export async function acceptRiskGate(page: Page) {
  await page.getByRole("checkbox").first().check()
  await page.getByRole("button", { name: "Continue" }).click()
}
