import { expect, test } from "@playwright/test"
import { parseAbiItem, type Address } from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { DEPLOY_BLOCK, accounts } from "./deployment"
import { connect, dropWatchAsset, installWallet, refuseSignatures, watchedAssets } from "./wallet"
import {
  asAccount,
  balanceOf,
  depositOf,
  desk,
  deskAbi,
  erc20Abi,
  partnership,
  passTime,
  pool,
  poolAbi,
  publicClient,
  revertChain,
  snapshotChain,
  stopImpersonating,
  tgold,
  usdgToken,
  waitFor,
  walletFor
} from "./chain"

const dollars = (units: bigint) =>
  (Number(units) / 1e6).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 })

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
    // Disabled, and saying why: to a screen reader through the description, on screen as text.
    await expect(draw).toHaveAccessibleDescription("Enter an amount to draw.")
    await expect(page.getByRole("button", { name: "Use the maximum USDG to draw" })).toHaveAccessibleDescription(
      "Lock collateral above to open a line of credit."
    )
    await expect(page.getByRole("button", { name: "Use the maximum USDG to repay" })).toHaveAccessibleDescription(
      "There is no debt to repay."
    )
    await expect(page.getByRole("button", { name: "Lock collateral" })).toHaveAccessibleDescription(
      "Enter an amount of tGOLD to lock."
    )
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

  test("no idle liquidity: the draw ceiling names the pool, not the collateral", async ({ page }) => {
    await installWallet(page)
    // Liquidity is taken out of the pool below; the rest of the suite needs it back.
    const snapshot = await snapshotChain()
    const impersonated: Address[] = []
    try {
      // Collateral in the position and no debt, so the collateral itself allows a draw.
      const wallet = walletFor(accounts.borrower.key)
      const amount = 10n ** 18n
      await waitFor(await wallet.writeContract({ abi: erc20Abi, address: tgold, functionName: "mint", args: [borrower, amount] }))
      await waitFor(await wallet.writeContract({ abi: erc20Abi, address: tgold, functionName: "approve", args: [pool, amount] }))
      await waitFor(await wallet.writeContract({ abi: poolAbi, address: pool, functionName: "lockCollateral", args: [tgold, amount] }))

      // The pool's own providers, read from its logs, take out what it can pay until nothing is idle.
      const deposits = await publicClient.getLogs({
        address: pool,
        event: parseAbiItem("event Deposited(address indexed provider, uint256 amount)"),
        fromBlock: DEPLOY_BLOCK,
        toBlock: "latest"
      })
      const idle = () => publicClient.readContract({ abi: poolAbi, address: pool, functionName: "availableLiquidity" })
      for (const provider of new Set(deposits.map(log => log.args.provider as Address))) {
        const available = await idle()
        if (available === 0n) break
        const held = await depositOf(provider)
        const take = held < available ? held : available
        if (take === 0n) continue
        const asProvider = await asAccount(provider)
        impersonated.push(provider)
        await waitFor(await asProvider.writeContract({ abi: poolAbi, address: pool, functionName: "withdraw", args: [take] }))
      }
      expect(await idle()).toBe(0n)

      await page.goto("/borrow/")
      await connect(page)
      await page.getByRole("button", { name: "Select tGOLD as collateral" }).click()
      const sentence =
        "The pool has no idle liquidity right now, so nothing can be drawn until providers deposit or borrowers repay."
      await expect(page.getByText(sentence)).toBeVisible({ timeout: 30_000 })
      await expect(page.getByRole("button", { name: "Use the maximum USDG to draw" })).toHaveAccessibleDescription(sentence)
    } finally {
      for (const address of impersonated) await stopImpersonating(address)
      await revertChain(snapshot)
    }
  })
})

test.describe("a partnership declared in default", () => {
  test.skip(!live, "run with npm run e2e:live")

  test("reads as defaulted and pays the funder what the operator returned", async ({ page }) => {
    await installWallet(page)
    // The clock is moved past a reporting deadline below; the rest of the suite needs it back.
    const snapshot = await snapshotChain()
    const operator = privateKeyToAccount(generatePrivateKey()).address
    const owner = await publicClient.readContract({ abi: deskAbi, address: desk, functionName: "owner" })
    try {
      const asOwner = await asAccount(owner)
      const asOperator = await asAccount(operator)
      const wallet = walletFor(accounts.borrower.key)
      const now = BigInt((await publicClient.getBlock()).timestamp)
      const id = await publicClient.readContract({ abi: deskAbi, address: desk, functionName: "partnershipCount" })
      await waitFor(
        await asOwner.writeContract({
          abi: deskAbi,
          address: desk,
          functionName: "createPartnership",
          args: [operator, 4000, 1_000_000_000n, now + 3_600n, now + 7_200n]
        })
      )

      const contributed = 400_000_000n
      await waitFor(await wallet.writeContract({ abi: erc20Abi, address: usdgToken, functionName: "mint", args: [borrower, contributed] }))
      await waitFor(await wallet.writeContract({ abi: erc20Abi, address: usdgToken, functionName: "approve", args: [desk, contributed] }))
      await waitFor(await wallet.writeContract({ abi: deskAbi, address: desk, functionName: "fund", args: [id, contributed] }))
      await waitFor(await asOwner.writeContract({ abi: deskAbi, address: desk, functionName: "activate", args: [id] }))

      // The operator brings some of it back, then goes quiet past the reporting deadline.
      const returned = 150_000_000n
      await waitFor(await asOperator.writeContract({ abi: erc20Abi, address: usdgToken, functionName: "mint", args: [operator, returned] }))
      await waitFor(await asOperator.writeContract({ abi: erc20Abi, address: usdgToken, functionName: "approve", args: [desk, returned] }))
      await waitFor(await asOperator.writeContract({ abi: deskAbi, address: desk, functionName: "reportReturn", args: [id, returned] }))
      await passTime(7_200 + 60)
      await waitFor(await asOperator.writeContract({ abi: deskAbi, address: desk, functionName: "declareDefault", args: [id] }))
      expect((await partnership(id))[3]).toBe(4)

      const payout = await publicClient.readContract({ abi: deskAbi, address: desk, functionName: "funderPayoutOf", args: [id, borrower] })
      expect(payout).toBeGreaterThan(0n)
      const held = await balanceOf(usdgToken, borrower)

      await page.goto("/partnerships/")
      await connect(page)
      const card = page.locator("section").filter({ has: page.getByRole("heading", { name: `Partnership #${id}`, exact: true }) })
      await expect(card.getByText("Defaulted", { exact: true })).toBeVisible({ timeout: 30_000 })
      await card.getByRole("button", { name: `Claim ${dollars(payout)}` }).click()
      await expect.poll(() => balanceOf(usdgToken, borrower), { timeout: 40_000 }).toBe(held + payout)
    } finally {
      await stopImpersonating(owner)
      await stopImpersonating(operator)
      await revertChain(snapshot)
    }
  })
})

/**
 * What the token says it is, read off the chain the same way the app reads it.
 * On the testnet the USDG contract calls itself tUSDG, which is the point: the
 * wallet has to be told what the contract says, not what the interface says.
 */
const usdgMetadata = async () => {
  const [symbol, decimals] = await Promise.all([
    publicClient.readContract({ abi: erc20Abi, address: usdgToken, functionName: "symbol" }),
    publicClient.readContract({ abi: erc20Abi, address: usdgToken, functionName: "decimals" })
  ])
  return { symbol, decimals }
}

test.describe("adding a token to the wallet", () => {
  test.skip(!live, "run with npm run e2e:live")

  const liquidity = (page: import("@playwright/test").Page) =>
    page.locator("section").filter({ hasText: "Manage liquidity" })

  test("the faucet offers the token once, and the quiet control stays", async ({ page }) => {
    await installWallet(page)
    const { symbol, decimals } = await usdgMetadata()

    await page.goto("/pool/")
    await connect(page)
    const panel = liquidity(page)
    const offer = panel.getByRole("status")
    const mint = panel.getByRole("button", { name: /Mint 10,000 test/ })

    // The first mint puts USDG in the wallet, so the offer follows it.
    await mint.click()
    await expect(offer).toBeVisible({ timeout: 40_000 })
    await expect(offer).toContainText(`${symbol} is in your wallet now`)
    await offer.getByRole("button", { name: "Not now" }).click()
    await expect(offer).toBeHidden()

    // Answered once is answered. The second mint confirms without it: the
    // button is busy until the receipt lands, so its coming back means the
    // screen has seen the confirmation and chosen not to ask.
    const held = await balanceOf(usdgToken, borrower)
    await expect(mint).toBeEnabled({ timeout: 30_000 })
    await mint.click()
    await expect
      .poll(async () => (await balanceOf(usdgToken, borrower)) > held, { timeout: 40_000, intervals: [500] })
      .toBe(true)
    await expect(mint).toBeEnabled({ timeout: 30_000 })
    await page.waitForTimeout(500)
    await expect(offer).toBeHidden()

    // A wallet that already holds the token still has the address and the
    // control on the panel, and what goes to the wallet is what the contract
    // answers, not the name the screen uses.
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"])
    await panel.getByRole("button", { name: `Copy the ${symbol} address` }).click()
    expect((await page.evaluate(() => navigator.clipboard.readText())).toLowerCase()).toBe(usdgToken)

    await panel.getByRole("button", { name: `Add ${symbol} to wallet` }).click()
    await expect.poll(() => watchedAssets(page).length, { timeout: 10_000 }).toBe(1)
    const [request] = watchedAssets(page)
    expect(request.type).toBe("ERC20")
    expect(request.options.address.toLowerCase()).toBe(usdgToken)
    expect(request.options.symbol).toBe(symbol)
    expect(request.options.decimals).toBe(decimals)
    expect(request.options.image).toMatch(/^https?:\/\/.+\/usdg\.png$/)
  })

  test("a wallet that refuses the token changes nothing on screen", async ({ page }) => {
    await installWallet(page)
    refuseSignatures(page)
    const errors: string[] = []
    page.on("pageerror", error => errors.push(String(error)))
    const { symbol } = await usdgMetadata()

    await page.goto("/pool/")
    await connect(page)
    const panel = liquidity(page)
    const control = panel.getByRole("button", { name: `Add ${symbol} to wallet` })
    // A link where the chain has an explorer, plain text where it does not;
    // the full address is the title either way.
    const address = panel.locator(`[title="${usdgToken}" i]`)
    await expect(address).toBeVisible()

    await control.click()
    await expect.poll(() => watchedAssets(page).length, { timeout: 10_000 }).toBe(1)

    // The wallet said no. Nothing failed, nothing was announced, and the
    // address never left the screen.
    await expect(control).toBeEnabled()
    await expect(address).toBeVisible()
    await expect(page.getByTestId("tx-status")).toHaveCount(0)
    // The app's own alert region, not Next's route announcer beside it.
    await expect(page.locator("#main").getByRole("alert")).toHaveText("")
    expect(errors).toEqual([])
  })

  test("a wallet without wallet_watchAsset changes nothing on screen", async ({ page }) => {
    await installWallet(page)
    dropWatchAsset(page)
    const errors: string[] = []
    page.on("pageerror", error => errors.push(String(error)))
    const { symbol } = await usdgMetadata()

    await page.goto("/pool/")
    await connect(page)
    const panel = liquidity(page)
    const control = panel.getByRole("button", { name: `Add ${symbol} to wallet` })
    const address = panel.locator(`[title="${usdgToken}" i]`)

    await control.click()
    await page.waitForTimeout(1500)

    expect(watchedAssets(page)).toEqual([])
    await expect(control).toBeEnabled()
    await expect(address).toBeVisible()
    await expect(page.getByTestId("tx-status")).toHaveCount(0)
    expect(errors).toEqual([])
  })
})
