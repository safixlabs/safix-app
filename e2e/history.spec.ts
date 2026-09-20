import { expect, test, type Page } from "@playwright/test"
import type { Address, Hex } from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { localChain } from "../lib/chain"
import { contractMessages, humanError } from "../lib/errors"
import { REFRESH_MS } from "../lib/polling"
import { accounts } from "./deployment"
import {
  asAccount,
  balanceOf,
  erc20Abi,
  mineBlock,
  pendingHashesFrom,
  pool,
  poolAbi,
  publicClient,
  revertChain,
  setAutomine,
  snapshotChain,
  stopImpersonating,
  usdgToken,
  waitFor,
  walletFor
} from "./chain"
import { connect, installWallet } from "./wallet"

/**
 * The wallet's history is read from the node's logs, on the same terms as every
 * other read: kept current while the tab is on screen, left alone while it is
 * not, and a failure said out loud rather than left loading.
 */

const live = process.env.E2E_LIVE === "1"
const borrower = accounts.borrower.address as Address
/** The node the app itself reads from on the local chain, which is where its log queries go. */
const appRpc = localChain.rpcUrls.default.http[0]
/** Set in the environment when the app under test reports to Sentry. */
const monitored = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN?.trim())

const historyPanel = (page: Page) =>
  page.locator("section").filter({ has: page.getByRole("heading", { name: "Your history", exact: true }) })

type RpcCall = { id: number; method: string }

const callsIn = (body: string | null): RpcCall[] => {
  if (!body) return []
  try {
    const parsed = JSON.parse(body) as RpcCall | RpcCall[]
    return Array.isArray(parsed) ? parsed : [parsed]
  } catch {
    return []
  }
}

const isLogQuery = (url: string, body: string | null) =>
  url.startsWith(appRpc) && callsIn(body).some(call => call.method === "eth_getLogs")

/**
 * Makes the node refuse `eth_getLogs` while `refusing()` says so, and answers
 * everything else for real. Calls leave batched, so the real response is
 * fetched and only the log queries in it are replaced with an error.
 */
async function refuseLogQueries(page: Page, refusing: () => boolean) {
  const refused = { count: 0 }
  await page.route(
    url => url.href.startsWith(appRpc),
    async route => {
      const calls = callsIn(route.request().postData())
      if (!refusing() || !calls.some(call => call.method === "eth_getLogs")) return route.continue()
      refused.count += 1
      const response = await route.fetch()
      const answered = (await response.json()) as { id: number } | { id: number }[]
      const methods = new Map(calls.map(call => [call.id, call.method]))
      const replace = (item: { id: number }) =>
        methods.get(item.id) === "eth_getLogs"
          ? { jsonrpc: "2.0", id: item.id, error: { code: -32005, message: "query returned more than 10000 results" } }
          : item
      await route.fulfill({ response, json: Array.isArray(answered) ? answered.map(replace) : replace(answered) })
    }
  )
  return refused
}

const setVisibility = (page: Page, state: "visible" | "hidden") =>
  page.evaluate(next => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => next })
    document.dispatchEvent(new Event("visibilitychange"))
  }, state)

test.describe.serial("history", () => {
  test.skip(!live, "run with npm run e2e:live")

  test.beforeEach(async ({ page }) => {
    await installWallet(page)
  })

  test("a transaction sent from outside the page appears without a reload", async ({ page }) => {
    await page.goto("/activity/")
    await connect(page)
    const panel = historyPanel(page)
    await expect(panel.getByText("Reading…")).toBeHidden({ timeout: 30_000 })
    // Anything a reload would wipe.
    await page.evaluate(() => {
      ;(window as unknown as { kept?: boolean }).kept = true
    })

    // Straight to the chain, not through this page, so only the refresh can bring it in.
    const amount = 1_230_000n
    const wallet = walletFor(accounts.borrower.key)
    await waitFor(await wallet.writeContract({ abi: erc20Abi, address: usdgToken, functionName: "mint", args: [borrower, amount] }))
    await waitFor(await wallet.writeContract({ abi: erc20Abi, address: usdgToken, functionName: "approve", args: [pool, amount] }))
    await waitFor(await wallet.writeContract({ abi: poolAbi, address: pool, functionName: "deposit", args: [amount] }))

    await expect(panel.locator("li").first()).toContainText("Deposited $1.23 into the pool", {
      timeout: REFRESH_MS * 2 + 10_000
    })
    expect(await page.evaluate(() => (window as unknown as { kept?: boolean }).kept)).toBe(true)
  })

  test("a transaction that fails onchain is said as it happens and is still listed after a reload", async ({ page }) => {
    // A fresh account the borrower lets spend its USDG. Funds move below; the
    // rest of the suite needs them back where they were.
    const spender = privateKeyToAccount(generatePrivateKey()).address
    const snapshot = await snapshotChain()
    try {
      const amount = 2_340_000n
      const wallet = walletFor(accounts.borrower.key)
      await waitFor(await wallet.writeContract({ abi: erc20Abi, address: usdgToken, functionName: "mint", args: [borrower, amount] }))
      await waitFor(await wallet.writeContract({ abi: erc20Abi, address: usdgToken, functionName: "approve", args: [pool, amount] }))
      await waitFor(
        await wallet.writeContract({ abi: erc20Abi, address: usdgToken, functionName: "approve", args: [spender, 2n ** 256n - 1n] })
      )

      // Funded while blocks still mine on their own, so its gas is there when it is needed.
      const asSpender = await asAccount(spender)

      await page.goto("/pool/")
      await connect(page)
      const panel = page.locator("section").filter({ has: page.getByRole("heading", { name: "Manage liquidity", exact: true }) })
      await panel.getByPlaceholder("0.00").first().fill("2.34")
      const deposit = panel.locator("button.w-full").filter({ hasText: /^Deposit$/ })
      await expect(deposit).toBeEnabled({ timeout: 30_000 })

      // Sized against the chain as it stands. Once blocks are held, the node would
      // size it against the pending deposit instead, which is the state it breaks.
      const held = await balanceOf(usdgToken, borrower)
      const transferGas = await publicClient.estimateContractGas({
        account: spender,
        abi: erc20Abi,
        address: usdgToken,
        functionName: "transferFrom",
        args: [borrower, spender, held]
      })

      // The wallet accepts the deposit while the USDG is still there. Blocks are
      // held so that the spender's transfer lands in the same block, ordered ahead
      // of it by a higher fee: the deposit is submitted and then reverts onchain.
      await setAutomine(false)
      await deposit.click()
      let queued: Hex[] = []
      await expect
        .poll(async () => (queued = await pendingHashesFrom(borrower)).length, { timeout: 20_000 })
        .toBeGreaterThan(0)
      const [hash] = queued

      const fees = await publicClient.estimateFeesPerGas()
      const tip = fees.maxPriorityFeePerGas * 10n + 1_000_000_000n
      await asSpender.writeContract({
        abi: erc20Abi,
        address: usdgToken,
        functionName: "transferFrom",
        args: [borrower, spender, held],
        gas: transferGas * 2n,
        maxPriorityFeePerGas: tip,
        maxFeePerGas: fees.maxFeePerGas * 10n + tip
      })
      await mineBlock()
      await setAutomine(true)
      expect((await publicClient.getTransactionReceipt({ hash })).status).toBe("reverted")

      // The reason is whatever the deployed contracts revert with, read the way the
      // app reads it: the same call, replayed against the chain as it now stands.
      const sent = await publicClient.getTransaction({ hash })
      const replayed = await publicClient.call({ account: sent.from, to: sent.to!, data: sent.input }).then(
        () => null,
        (error: unknown) => error
      )
      expect(replayed, "the deposit should still revert when replayed").not.toBeNull()
      const sentence = humanError(replayed)
      expect(Object.values(contractMessages)).toContain(sentence)

      // As it happens: the status card says it failed and why.
      const status = page.getByTestId("tx-status")
      await expect(status.getByText("Transaction failed")).toBeVisible({ timeout: 30_000 })
      await expect(status.getByText(sentence)).toBeVisible()

      // After a reload: still in the wallet's history, with what the chain says became of it.
      await page.goto("/activity/")
      await page.reload()
      await connect(page)
      const row = historyPanel(page).locator("li").filter({ hasText: "Deposit $2.34 into the pool" })
      await expect(row).toContainText("Failed onchain", { timeout: 30_000 })
    } finally {
      await setAutomine(true)
      await stopImpersonating(spender)
      await revertChain(snapshot)
    }
  })

  test("every screen opened with a wallet already connected hydrates without a mismatch", async ({ page }) => {
    const mismatches: string[] = []
    page.on("pageerror", error => {
      if (/hydrat/i.test(error.message)) mismatches.push(`${page.url()}: ${error.message.split("\n")[0]}`)
    })
    await page.goto("/")
    await connect(page)
    for (const path of ["/", "/borrow/", "/pool/", "/partnerships/", "/passport/", "/assets/", "/activity/"]) {
      await page.goto(path)
      await page.reload()
      // The stored connection comes back after mount; the screen has to have finished hydrating first.
      await expect(page.locator("button").filter({ hasText: /0x[0-9a-fA-F]{4}/ }).first()).toBeVisible({ timeout: 20_000 })
    }
    expect(mismatches).toEqual([])
  })

  test("the activity screen lists the wallet's history once, in one panel", async ({ page }) => {
    await page.goto("/activity/")
    await connect(page)
    await expect(page.getByRole("heading", { name: "Your history", exact: true })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Liquidation history", exact: true })).toHaveCount(0)
    // The borrow screen keeps its own liquidation panel; only the duplicate on this screen is gone.
    await page.goto("/borrow/")
    await expect(page.getByRole("heading", { name: "Liquidation history", exact: true })).toBeVisible()
  })

  test("an endpoint that refuses the history's block range is not asked again", async ({ page }) => {
    const sent: number[] = []
    page.on("request", request => {
      if (isLogQuery(request.url(), request.postData())) sent.push(Date.now())
    })
    // The refusal a capped provider plan gives: the range, not the node, is the problem.
    await page.route(
      url => url.href.startsWith(appRpc),
      async route => {
        const calls = callsIn(route.request().postData())
        const logQuery = calls.find(call => call.method === "eth_getLogs")
        if (!logQuery) return route.continue()
        await route.fulfill({
          json: { jsonrpc: "2.0", id: logQuery.id, error: { code: -32615, message: "eth_getLogs is limited to a 5 range" } }
        })
      }
    )

    await page.goto("/activity/")
    await connect(page)
    await expect(historyPanel(page)).toContainText("Neither the index nor the node would return", { timeout: 45_000 })
    const asked = sent.length
    expect(asked).toBeGreaterThan(0)

    // Two refreshes later, still not asked: the refusal is remembered, not paid for again.
    await page.waitForTimeout(REFRESH_MS * 2 + 2_000)
    expect(sent.length).toBe(asked)
  })

  test("the history is read again only while the tab is visible", async ({ page }) => {
    // This one waits out two intervals with the tab hidden and polls across two
    // more, so its floor is set by REFRESH_MS rather than by anything it can
    // hurry: the suite's 90 second budget is below its own worst case. Budgeted
    // from the same constant, so changing the interval cannot silently put it
    // back over the edge.
    test.setTimeout(REFRESH_MS * 6 + 60_000)
    const sent: number[] = []
    page.on("request", request => {
      if (isLogQuery(request.url(), request.postData())) sent.push(Date.now())
    })

    await page.goto("/activity/")
    await connect(page)
    await expect.poll(() => sent.length, { timeout: 30_000 }).toBeGreaterThan(0)
    // Past the first refresh, so the interval is known to be running before the tab hides.
    const running = sent.length
    await expect.poll(() => sent.length, { timeout: REFRESH_MS + 10_000 }).toBeGreaterThan(running)

    await setVisibility(page, "hidden")
    const hidden = sent.length
    await page.waitForTimeout(REFRESH_MS * 2 + 2_000)
    expect(sent.length, "log queries sent while the tab was hidden").toBe(hidden)

    await setVisibility(page, "visible")
    // Coming back reads at once rather than waiting out the interval.
    await expect.poll(() => sent.length, { timeout: 5_000 }).toBeGreaterThan(hidden)
  })

  test("a history read the node refuses is said and reported, not left loading", async ({ page }) => {
    const envelopes: string[] = []
    // Whatever the app reports stays on this machine.
    await page.route(
      url => url.pathname.includes("/envelope/"),
      async route => {
        envelopes.push(route.request().postData() ?? "")
        await route.fulfill({ status: 200, body: "{}" })
      }
    )
    await refuseLogQueries(page, () => true)

    await page.goto("/activity/")
    await connect(page)
    await expect(historyPanel(page)).toContainText("Neither the index nor the node would return", { timeout: 45_000 })

    if (monitored) {
      await expect
        .poll(() => envelopes.some(body => body.includes('"panel":"activity"')), { timeout: 20_000 })
        .toBe(true)
    }
  })

  test("a refresh that fails keeps the rows already on screen", async ({ page }) => {
    let refusing = false
    const refused = await refuseLogQueries(page, () => refusing)

    await page.goto("/activity/")
    await connect(page)
    const rows = historyPanel(page).locator("li")
    await expect(rows.first()).toBeVisible({ timeout: 30_000 })
    const shown = await rows.count()

    refusing = true
    // At least one refresh has to have been refused, or this proves nothing.
    await expect.poll(() => refused.count, { timeout: REFRESH_MS * 2 + 10_000 }).toBeGreaterThan(0)
    await page.waitForTimeout(3_000)
    await expect(rows).toHaveCount(shown)
    await expect(historyPanel(page)).not.toContainText("Neither the index nor the node would return")
  })
})
