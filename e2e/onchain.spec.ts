import { expect, test } from "@playwright/test"
import type { Address } from "viem"
import { accounts } from "./deployment"
import { connect, installWallet, refuseSignatures, watchedAssets } from "./wallet"
import {
  asAccount,
  balanceOf,
  bnvda,
  contributionOf,
  depositOf,
  desk,
  deskAbi,
  erc20Abi,
  gainOf,
  lowerPrice,
  partnership,
  pool,
  poolAbi,
  positionOf,
  positionSizing,
  publicClient,
  refreshPrices,
  stopImpersonating,
  tbill,
  tgold,
  usdgToken,
  waitFor,
  walletFor
} from "./chain"

const live = process.env.E2E_LIVE === "1"
const borrower = accounts.borrower.address as Address

/** Waits for a figure read off the chain to move, rather than for a toast. */
const settles = async (read: () => Promise<bigint>, from: bigint) => {
  await expect
    .poll(async () => (await read()) !== from, { timeout: 40_000, intervals: [500] })
    .toBe(true)
  return read()
}

type Page = import("@playwright/test").Page

/**
 * A panel, by its own heading.
 *
 * Matching on the section's text instead picks up every panel that merely
 * mentions the word: "Collateral" appears inside the draw panel's breakdown, so
 * a text match returns two sections and the action below resolves to the wrong
 * button.
 */
const panelOf = (page: Page, title: string) =>
  page.locator("section").filter({ has: page.getByRole("heading", { name: title, exact: true }) })

/** A partnership's card, by its heading. "Partnership #1" as text would also match #10. */
const partnershipCard = (page: Page, id: bigint) =>
  page.locator("section").filter({ has: page.getByRole("heading", { name: `Partnership #${id}`, exact: true }) })

/** The full-width action button at the foot of a panel. */
const actionOf = (page: Page, panel: string) => panelOf(page, panel).locator("button.w-full").last()

const enterAmount = async (page: Page, panel: string, value: string) => {
  await panelOf(page, panel).getByPlaceholder("0.00").first().fill(value)
}

/**
 * Carries a panel's action through to the transaction that moves money.
 *
 * Two things make this more than a click. The button only stops asking for an
 * approval once the new allowance has been read back off the chain, so the wait
 * is on the label rather than on a fixed delay. And the screen empties the
 * amount field whenever a transaction confirms, so the amount has to be typed
 * again after the approval or the action sits there disabled.
 */
const complete = async (page: Page, panel: string, amount: string, action: RegExp) => {
  const button = actionOf(page, panel)
  await enterAmount(page, panel, amount)
  await expect(button).toBeEnabled({ timeout: 30_000 })

  if (/Approve/i.test((await button.innerText()).trim())) {
    await button.click()
    await expect(button).toHaveText(action, { timeout: 90_000 })
    await enterAmount(page, panel, amount)
  }

  await expect(button).toHaveText(action, { timeout: 60_000 })
  await expect(button).toBeEnabled({ timeout: 30_000 })
  await button.click()
}

/** An action with no amount behind it. */
const press = async (page: Page, panel: string, label: RegExp) => {
  const button = panelOf(page, panel).locator("button").filter({ hasText: label }).last()
  await expect(button).toBeEnabled({ timeout: 30_000 })
  await button.click()
}

test.describe.serial("money paths", () => {
  test.skip(!live, "run with npm run e2e:live")

  /** The partnership the funding tests open, fund, cancel and claim from. */
  let openPartnership: bigint

  test.beforeAll(async () => {
    if (!live) return
    await refreshPrices([tbill, bnvda, tgold])
  })

  test.beforeEach(async ({ page }) => {
    await installWallet(page)
  })

  // ------------------------------------------------------------------- pool
  test("deposit moves USDG from the wallet into the pool", async ({ page }) => {
    const wallet = walletFor(accounts.borrower.key)
    await waitFor(
      await wallet.writeContract({ abi: erc20Abi, address: usdgToken, functionName: "mint", args: [borrower, 10_000_000000n] })
    )

    const before = await depositOf(borrower)
    await page.goto("/pool/")
    await connect(page)

    await complete(page, "Manage liquidity", "500", /^Deposit$/)

    const after = await settles(() => depositOf(borrower), before)
    expect(after).toBeGreaterThan(before)
  })

  test("withdraw moves USDG back out of the pool", async ({ page }) => {
    const before = await depositOf(borrower)
    expect(before).toBeGreaterThan(0n)
    const walletBefore = await balanceOf(usdgToken, borrower)

    await page.goto("/pool/")
    await connect(page)
    await page.getByRole("button", { name: "Withdraw" }).first().click()
    await complete(page, "Manage liquidity", "100", /^Withdraw$/)

    const after = await settles(() => depositOf(borrower), before)
    expect(after).toBeLessThan(before)
    expect(await balanceOf(usdgToken, borrower)).toBeGreaterThan(walletBefore)
  })

  test("claim takes the collateral a liquidation left in the pool", async ({ page }) => {
    // A liquidation has to have happened for there to be anything to claim, so
    // one is arranged: a second account borrows against bNVDA close to its
    // limit, the owner moves the price under it, and the position is liquidated.
    // The pool's providers are then owed the seized collateral.
    const second = walletFor(accounts.second.key)
    const victim = accounts.second.address as Address
    const { drawn, collateral, liqThresholdBps } = await positionSizing(bnvda, 1n)
    await waitFor(await second.writeContract({ abi: erc20Abi, address: bnvda, functionName: "mint", args: [victim, collateral] }))
    await waitFor(await second.writeContract({ abi: erc20Abi, address: bnvda, functionName: "approve", args: [pool, collateral] }))
    await waitFor(await second.writeContract({ abi: poolAbi, address: pool, functionName: "lockCollateral", args: [bnvda, collateral] }))
    await waitFor(await second.writeContract({ abi: poolAbi, address: pool, functionName: "draw", args: [bnvda, drawn] }))

    // Below the price at which the collateral stops covering the debt at the liquidation threshold.
    const [, debt] = await positionOf(victim, bnvda)
    const uncovered = (debt * 10n ** 30n * 10_000n) / (collateral * BigInt(liqThresholdBps))
    await lowerPrice(bnvda, (uncovered * 95n) / 100n)
    // isLiquidatable answers false for any price the pool will not act on, so say which it is first.
    const [priceStatus, price, updatedAt] = await publicClient.readContract({ abi: poolAbi, address: pool, functionName: "priceStatus", args: [bnvda] })
    const { timestamp } = await publicClient.getBlock()
    expect(priceStatus, `bNVDA price ${price} posted at ${updatedAt}, block time ${timestamp}: PriceStatus 0 is usable`).toBe(0)
    const [heldCollateral, heldDebt] = await positionOf(victim, bnvda)
    expect(
      await publicClient.readContract({ abi: poolAbi, address: pool, functionName: "isLiquidatable", args: [victim, bnvda] }),
      `position ${heldCollateral} collateral against ${heldDebt} debt (locked here ${collateral}, drawn ${drawn}) at ${price}, threshold ${liqThresholdBps} bps`
    ).toBe(true)

    const owner = await publicClient.readContract({ abi: poolAbi, address: pool, functionName: "owner" })
    const asOwner = await asAccount(owner)
    await waitFor(await asOwner.writeContract({ abi: poolAbi, address: pool, functionName: "liquidate", args: [victim, bnvda, debt] }))
    await stopImpersonating(owner)

    const owed = await gainOf(borrower, bnvda)
    expect(owed).toBeGreaterThan(0n)
    const held = await balanceOf(bnvda, borrower)

    await page.goto("/pool/")
    await connect(page)
    await page.getByRole("button", { name: "Claim all" }).click()

    const after = await settles(() => balanceOf(bnvda, borrower), held)
    expect(after).toBeGreaterThan(held)
    expect(await gainOf(borrower, bnvda)).toBe(0n)
  })

  // ----------------------------------------------------------------- borrow
  test("lock moves collateral into the position", async ({ page }) => {
    // Enough for the draw below with room to spare, so it stays clear of the liquidation warning.
    const { collateral } = await positionSizing(tbill, 2n)
    const typed = (collateral / 10n ** 18n).toString()
    const wallet = walletFor(accounts.borrower.key)
    await waitFor(await wallet.writeContract({ abi: erc20Abi, address: tbill, functionName: "mint", args: [borrower, collateral] }))

    const [before] = await positionOf(borrower, tbill)
    await page.goto("/borrow/")
    await connect(page)

    const panel = panelOf(page, "Collateral")
    const lock = actionOf(page, "Collateral")
    await panel.getByPlaceholder(/Amount of tBILL/).fill(typed)
    await expect(lock).toBeEnabled({ timeout: 30_000 })
    if (/Approve/i.test((await lock.innerText()).trim())) {
      await lock.click()
      await expect(lock).toHaveText(/Lock collateral/, { timeout: 90_000 })
      await panel.getByPlaceholder(/Amount of tBILL/).fill(typed)
    }
    await expect(lock).toBeEnabled({ timeout: 30_000 })
    await lock.click()

    const after = await settles(async () => (await positionOf(borrower, tbill))[0], before)
    expect(after).toBeGreaterThan(before)
  })

  test("draw takes USDG out against the locked collateral", async ({ page }) => {
    const [, before] = await positionOf(borrower, tbill)
    const held = await balanceOf(usdgToken, borrower)

    await page.goto("/borrow/")
    await connect(page)
    // At least the pool's minimum position, which is what the pool itself requires of a draw.
    const { drawn } = await positionSizing(tbill, 2n)
    await complete(page, "Draw USDG", (Number(drawn) / 1e6).toFixed(2), /^Draw/)

    const after = await settles(async () => (await positionOf(borrower, tbill))[1], before)
    expect(after).toBeGreaterThan(before)
    expect(await balanceOf(usdgToken, borrower)).toBeGreaterThan(held)

    // The USDG is in the wallet now, and the wallet is offered its address,
    // with the symbol and decimals the token itself reports rather than the
    // name the interface uses for it. On the testnet those differ: the
    // contract calls itself tUSDG.
    const [symbol, decimals] = await Promise.all([
      publicClient.readContract({ abi: erc20Abi, address: usdgToken, functionName: "symbol" }),
      publicClient.readContract({ abi: erc20Abi, address: usdgToken, functionName: "decimals" })
    ])
    const offer = panelOf(page, "Draw USDG").getByRole("status")
    await expect(offer).toBeVisible({ timeout: 20_000 })
    await offer.getByRole("button", { name: `Add ${symbol} to wallet` }).click()

    await expect.poll(() => watchedAssets(page).length, { timeout: 10_000 }).toBe(1)
    const [request] = watchedAssets(page)
    expect(request.type).toBe("ERC20")
    expect(request.options.address.toLowerCase()).toBe(usdgToken)
    expect(request.options.symbol).toBe(symbol)
    expect(request.options.decimals).toBe(decimals)
    // Answered, so it is gone. That it is not asked again is the states suite's.
    await expect(offer).toBeHidden()
  })

  test("repay puts USDG back against the debt", async ({ page }) => {
    const [, before] = await positionOf(borrower, tbill)
    expect(before).toBeGreaterThan(0n)

    await page.goto("/borrow/")
    await connect(page)
    await complete(page, "Repay and close", "5", /^Repay$/)

    const after = await settles(async () => (await positionOf(borrower, tbill))[1], before)
    expect(after).toBeLessThan(before)
  })

  test("close clears the debt and returns the collateral", async ({ page }) => {
    const [collateralBefore] = await positionOf(borrower, tbill)
    expect(collateralBefore).toBeGreaterThan(0n)
    const held = await balanceOf(tbill, borrower)

    await page.goto("/borrow/")
    await connect(page)
    await press(page, "Repay and close", /Approve \$|Close position/)
    await page.waitForTimeout(6000)
    await press(page, "Repay and close", /Close position/)

    const after = await settles(async () => (await positionOf(borrower, tbill))[0], collateralBefore)
    expect(after).toBe(0n)
    const [, debt] = await positionOf(borrower, tbill)
    expect(debt).toBe(0n)
    expect(await balanceOf(tbill, borrower)).toBeGreaterThan(held)
  })

  // ----------------------------------------------------------- partnerships
  test("fund moves USDG into a partnership", async ({ page }) => {
    // A partnership open for funding is arranged by the desk's owner: the ones
    // already on the chain may have closed, and this path needs one taking money.
    const owner = await publicClient.readContract({ abi: deskAbi, address: desk, functionName: "owner" })
    const asOwner = await asAccount(owner)
    const now = BigInt((await publicClient.getBlock()).timestamp)
    openPartnership = await publicClient.readContract({ abi: deskAbi, address: desk, functionName: "partnershipCount" })
    await waitFor(
      await asOwner.writeContract({
        abi: deskAbi,
        address: desk,
        functionName: "createPartnership",
        args: [accounts.second.address as Address, 4000, 1_000_000_000n, now + 86_400n, now + 172_800n]
      })
    )
    await stopImpersonating(owner)
    const before = await contributionOf(openPartnership, borrower)

    await page.goto("/partnerships/")
    await connect(page)
    const card = partnershipCard(page, openPartnership)
    await card.getByPlaceholder("0.00").fill("100")
    const fund = card.getByRole("button", { name: "Fund" })
    await fund.click()
    await page.waitForTimeout(5000)
    if (await fund.isEnabled().catch(() => false)) await fund.click()

    const after = await settles(() => contributionOf(openPartnership, borrower), before)
    expect(after).toBeGreaterThan(before)
  })

  test("claim returns the contribution once the partnership is cancelled", async ({ page }) => {
    // Cancelling is the shortest route to a claimable partnership; the money
    // path under test is the funder's claim, not the owner's cancel.
    const owner = await publicClient.readContract({ abi: deskAbi, address: desk, functionName: "owner" })
    const asOwner = await asAccount(owner)
    const [, , , status] = await partnership(openPartnership)
    if (status === 0) {
      await waitFor(await asOwner.writeContract({ abi: deskAbi, address: desk, functionName: "cancel", args: [openPartnership] }))
    }
    await stopImpersonating(owner)

    const held = await balanceOf(usdgToken, borrower)
    await page.goto("/partnerships/")
    await connect(page)
    const card = partnershipCard(page, openPartnership)
    await card.getByRole("button", { name: /^Claim/ }).click()

    const after = await settles(() => balanceOf(usdgToken, borrower), held)
    expect(after).toBeGreaterThan(held)
  })

  // ------------------------------------------------------------- signatures
  test("a rejected signature reads as cancelled, not as an error", async ({ page }) => {
    refuseSignatures(page)
    await page.goto("/pool/")
    await connect(page)
    await page.getByRole("button", { name: /Mint 10,000 test/ }).click()
    // Twice over, deliberately: once where it can be seen, once where it is
    // announced. Naming both is what keeps the live region from being dropped.
    const status = page.getByTestId("tx-status")
    await expect(status.getByText("Request cancelled")).toBeVisible({ timeout: 20_000 })
    await expect(status.getByText("You cancelled the request in your wallet.")).toBeVisible()
    await expect(page.locator('[role="status"][aria-live="polite"]')).toContainText("Request cancelled")
  })

  // ------------------------------------------------------------------ harness
  test("an impersonated send is given more gas than it spends", async () => {
    // viem does not estimate for an account the suite has no key for. It sends
    // eth_sendTransaction with no limit at all and lets the node fill one, and
    // anvil's fill was exact: a setup step that cost a gas more than the estimate
    // ran out, which reverts with no data and reads as the pool refusing the call
    // rather than as the harness being short. The limit is filled here now, and
    // the room it leaves is the property that says the filling happened.
    const owner = await publicClient.readContract({ abi: poolAbi, address: pool, functionName: "owner" })
    const asOwner = await asAccount(owner)
    try {
      const price = (await publicClient.readContract({ abi: poolAbi, address: pool, functionName: "assetConfig", args: [tbill] }))[3]
      const hash = await asOwner.writeContract({ abi: poolAbi, address: pool, functionName: "setPrice", args: [tbill, price] })
      const receipt = await waitFor(hash)
      const sent = await publicClient.getTransaction({ hash })
      expect(sent.gas).toBeGreaterThan(receipt.gasUsed)
    } finally {
      await stopImpersonating(owner)
    }
  })
})
