import { expect, test } from "@playwright/test"
import type { Address } from "viem"
import { accounts } from "./deployment"
import { connect, installWallet } from "./wallet"
import { balanceOf, erc20Abi, pool, tgold, usdgToken, waitFor, walletFor } from "./chain"

const live = process.env.E2E_LIVE === "1"
const borrower = accounts.borrower.address as Address

test.describe("states", () => {
  test.skip(!live, "run with npm run e2e:live")

  test("no wallet at all: the screen still works and offers a way in", async ({ page }) => {
    // Nothing is installed, so window.ethereum is absent.
    const errors: string[] = []
    page.on("pageerror", error => errors.push(String(error)))

    await page.goto("/pool/")
    await expect(page.getByRole("heading", { name: "Stability pool" })).toBeVisible()

    const connectControl = page.getByRole("button", { name: /^Connect|No wallet/ })
    await expect(connectControl).toBeVisible()
    await connectControl.click()

    // Whatever the screen decides to show, it must show something and must not
    // fall over: an unhandled error here means a visitor with no wallet is
    // looking at a broken page.
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 })
    expect(errors).toEqual([])
  })

  test("wrong network: the wallet is told to switch", async ({ page }) => {
    await installWallet(page, { chainIdHex: "0x1" })
    await page.goto("/pool/")
    await connect(page)
    await expect(page.getByText(/Switch to|wrong network/i).first()).toBeVisible({ timeout: 20_000 })
  })

  test("empty position: nothing is drawable and the screen says so", async ({ page }) => {
    await installWallet(page)
    await page.goto("/borrow/")
    await connect(page)

    // tGOLD is untouched by the money-path suite, so this position is empty.
    await page.getByRole("button", { name: /tGOLD/ }).first().click()
    await page.waitForTimeout(3000)

    await expect(page.getByText("Available to draw")).toBeVisible()
    await expect(page.getByText(/0\.0000 tGOLD/).first()).toBeVisible()
    const draw = page.locator("section").filter({ hasText: "Draw USDG" }).locator("button.w-full").last()
    await expect(draw).toBeDisabled()
  })

  test("insufficient balance: the chain refuses and the reason is in plain words", async ({ page }) => {
    await installWallet(page)
    // Approve generously so the refusal comes from the balance, not the allowance.
    const wallet = walletFor(accounts.borrower.key)
    await waitFor(
      await wallet.writeContract({
        abi: erc20Abi,
        address: usdgToken,
        functionName: "approve",
        args: [pool, 10n ** 30n]
      })
    )
    const held = await balanceOf(usdgToken, borrower)

    await page.goto("/pool/")
    await connect(page)
    const panel = page.locator("section").filter({ hasText: "Manage liquidity" })
    await panel.getByPlaceholder("0.00").first().fill(String(Number(held) / 1e6 + 1_000_000))
    await panel.locator("button.w-full").filter({ hasText: /Deposit/ }).last().click()

    await expect(page.getByText("That is more than the wallet holds.").first()).toBeVisible({ timeout: 30_000 })
  })

  test("capacity exceeded: the draw is refused before it is signed", async ({ page }) => {
    await installWallet(page)
    await page.goto("/borrow/")
    await connect(page)
    await page.waitForTimeout(3000)

    const panel = page.locator("section").filter({ hasText: "Draw USDG" })
    await panel.getByPlaceholder("0.00").first().fill("1000000")
    await page.waitForTimeout(1000)

    const draw = panel.locator("button.w-full").last()
    await expect(draw).toHaveText(/Above what this collateral supports/)
    await expect(draw).toBeDisabled()
  })
})
