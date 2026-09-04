import { expect, test } from "@playwright/test"
import { TEST_ACCOUNT, installWallet } from "./wallet"

const live = process.env.E2E_LIVE === "1"

test.describe("onchain", () => {
  test.skip(!live, "set E2E_LIVE=1 with a deployed local chain to run these")

  test.beforeEach(async ({ page }) => {
    await installWallet(page)
  })

  test("connects and reads pool state from the chain", async ({ page }) => {
    await page.goto("/pool/")
    await page.getByRole("button", { name: "Connect wallet" }).click()
    await expect(page.getByRole("button", { name: /0x7099/ })).toBeVisible()
    await expect(page.getByText("Live onchain")).toBeVisible()
    await expect(page.getByText(/Pool size/)).toBeVisible()
  })

  test("mint, approve and deposit move the pool", async ({ page }) => {
    await page.goto("/pool/")
    await page.getByRole("button", { name: "Connect wallet" }).click()
    await expect(page.getByRole("button", { name: /0x7099/ })).toBeVisible()

    await page.getByRole("button", { name: /Mint 10,000 test/ }).click()
    await expect(page.getByText("Confirmed onchain")).toBeVisible({ timeout: 20_000 })

    await page.getByRole("button", { name: "50%" }).click()
    const action = page.getByRole("button", { name: /^(Approve USDG|Deposit)$/ }).last()
    await action.click()
    await expect(page.getByText(/Confirmed onchain|Waiting for your wallet|Submitted/)).toBeVisible({
      timeout: 20_000
    })
  })

  test("locking collateral produces a liquidation price", async ({ page }) => {
    await page.goto("/borrow/")
    await page.getByRole("button", { name: "Connect wallet" }).click()
    await expect(page.getByRole("button", { name: /0x7099/ })).toBeVisible()

    await page.getByRole("button", { name: /Mint 10 test/ }).click()
    await expect(page.getByText("Confirmed onchain")).toBeVisible({ timeout: 20_000 })

    await page.getByRole("button", { name: "Max" }).first().click()
    const lockStep = page.getByRole("button", { name: /Approve tBILL|Lock collateral/ })
    await lockStep.click()
    await page.waitForTimeout(2500)
    const lockAgain = page.getByRole("button", { name: /Approve tBILL|Lock collateral/ })
    if (await lockAgain.isEnabled()) await lockAgain.click()

    await expect(page.getByText("Collateral value")).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/Room before liquidation|Liquidation price/)).toBeVisible()
  })

  test("a rejected signature reads as cancelled, not as an error", async ({ page }) => {
    await page.goto("/pool/")
    await page.getByRole("button", { name: "Connect wallet" }).click()
    await expect(page.getByRole("button", { name: /0x7099/ })).toBeVisible()

    await page.evaluate(() => {
      const provider = (window as unknown as { ethereum: { request: (args: { method: string }) => Promise<unknown> } }).ethereum
      const original = provider.request.bind(provider)
      provider.request = async (args: { method: string }) => {
        if (args.method === "eth_sendTransaction") {
          const error = new Error("User rejected the request.") as Error & { code?: number }
          error.code = 4001
          throw error
        }
        return original(args)
      }
    })

    await page.getByRole("button", { name: /Mint 10,000 test/ }).click()
    await expect(page.getByText("Request cancelled")).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText("You cancelled the request in your wallet.")).toBeVisible()
  })
})
