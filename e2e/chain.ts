import {
  type Transport,
  createPublicClient,
  createTestClient,
  createWalletClient,
  defineChain,
  http,
  type Address,
  type Hex
} from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { CHAIN_ID, RPC_URL, accounts, deployment } from "./deployment"

export const chain = defineChain({
  id: CHAIN_ID,
  name: "Safix e2e",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } }
})

export const publicClient = createPublicClient({ chain, transport: http(RPC_URL) })
const testClient = createTestClient({ chain, mode: "anvil", transport: http(RPC_URL) })

export const poolAbi = [
  { type: "function", name: "compoundedDepositOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalDeposits", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "availableLiquidity", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "gainOf", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "positions", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }] },
  { type: "function", name: "assetConfig", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "bool" }, { type: "uint16" }, { type: "uint16" }, { type: "uint256" }] },
  { type: "function", name: "isLiquidatable", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "setPrice", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [] },
  { type: "function", name: "liquidate", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "address" }, { type: "uint256" }], outputs: [] },
  { type: "function", name: "deposit", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [] },
  { type: "function", name: "lockCollateral", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [] },
  { type: "function", name: "draw", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [] },
  { type: "function", name: "withdraw", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [] },
  { type: "function", name: "minPositionDebt", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "originationFeeBps", stateMutability: "view", inputs: [], outputs: [{ type: "uint16" }] },
  { type: "function", name: "priceStatus", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint8" }, { type: "uint256" }, { type: "uint256" }] },
  { type: "function", name: "priceGuards", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint64" }, { type: "uint16" }, { type: "uint256" }, { type: "uint256" }] }
] as const

export const erc20Abi = [
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "transferFrom", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] }
] as const

export const deskAbi = [
  { type: "function", name: "partnerships", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "address" }, { type: "uint16" }, { type: "uint64" }, { type: "uint8" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "bool" }] },
  { type: "function", name: "contributions", stateMutability: "view", inputs: [{ type: "uint256" }, { type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "funderPayoutOf", stateMutability: "view", inputs: [{ type: "uint256" }, { type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "cancel", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [] },
  { type: "function", name: "partnershipCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "createPartnership", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint16" }, { type: "uint256" }, { type: "uint64" }, { type: "uint64" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "fund", stateMutability: "nonpayable", inputs: [{ type: "uint256" }, { type: "uint256" }], outputs: [] },
  { type: "function", name: "activate", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [] },
  { type: "function", name: "reportReturn", stateMutability: "nonpayable", inputs: [{ type: "uint256" }, { type: "uint256" }], outputs: [] },
  { type: "function", name: "declareDefault", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [] }
] as const

export const pool = deployment.pool as Address
export const usdgToken = deployment.usdg as Address
export const desk = deployment.desk as Address
export const tbill = deployment.tbill as Address
export const bnvda = deployment.bnvda as Address
export const tgold = deployment.tgold as Address

/**
 * A gas limit with room for the estimate behind it to be wrong.
 *
 * An estimate is made against the state at the time it is asked for, and the
 * transaction runs against the state it finds. The suite writes constantly, so a
 * storage slot the estimate touched warm can be cold again by the time the
 * transaction lands, and that difference is thousands of gas. Running out reverts
 * with no data at all, which reads as the protocol refusing the call rather than
 * as an estimate being short.
 *
 * Two paths need covering, because viem takes a different one per account kind.
 * An account this suite holds the key for is estimated client side, and the
 * estimate arrives as `eth_estimateGas`. An impersonated account is not: viem
 * sends `eth_sendTransaction` with no limit at all and lets the node fill it, so
 * no estimate is ever asked for and buffering one would miss exactly the setup
 * steps that arrange every money path. Those are estimated here instead, before
 * the send goes out.
 *
 * Nobody here is paying for gas, so the limit is doubled rather than nudged. A
 * margin that has to be guessed right is a margin that will be guessed wrong.
 */
const withGasHeadroom = (url: string): Transport => {
  const inner = http(url)
  const headroom = (value: string) => `0x${(BigInt(value) * 2n).toString(16)}`
  return (config) => {
    const transport = inner(config)
    return {
      ...transport,
      async request(args: { method: string; params?: unknown }) {
        if (args.method === "eth_sendTransaction") {
          const [transaction] = (args.params ?? []) as [{ gas?: string }]
          if (transaction && !transaction.gas) {
            const estimate = await transport.request({ method: "eth_estimateGas", params: [transaction] } as never)
            const params = [{ ...transaction, gas: headroom(estimate as string) }]
            return transport.request({ method: "eth_sendTransaction", params } as never)
          }
        }
        const result = await transport.request(args as never)
        if (args.method === "eth_estimateGas") return headroom(result as string)
        return result
      }
    } as ReturnType<Transport>
  }
}

export const walletFor = (key: Hex) =>
  createWalletClient({ account: privateKeyToAccount(key), chain, transport: withGasHeadroom(RPC_URL) })

/**
 * Acts as an address the test does not hold the key for.
 *
 * A fork lets the suite step into the protocol owner or a partnership operator
 * to arrange the state a money path needs — a liquidation to claim gains from,
 * a cancelled partnership to claim a contribution back — without those setup
 * steps having to be money paths of their own.
 */
export async function asAccount(address: Address) {
  await testClient.impersonateAccount({ address })
  await testClient.setBalance({ address, value: 10n ** 20n })
  return createWalletClient({ account: address, chain, transport: withGasHeadroom(RPC_URL) })
}

export const stopImpersonating = (address: Address) => testClient.stopImpersonatingAccount({ address })

/**
 * Waits for a transaction and fails loudly if the chain rejected it.
 *
 * A receipt is not a success: `status` says whether the call went through, and a
 * setup step that reverted and was taken for done leaves a test asserting against
 * a chain that never changed. The call is replayed against the block before the
 * one it landed in, so the failure carries the reason the chain gave.
 */
export async function waitFor(hash: Hex) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status === "success") return receipt
  const sent = await publicClient.getTransaction({ hash })
  // Gas exhaustion reverts with no data at all, and replaying the call with a
  // generous limit then succeeds, which reads as "no reason given" and sends the
  // reader looking for a contract bug that is not there. The receipt says which
  // it was: a transaction that used every unit it was given ran out.
  if (sent.gas === receipt.gasUsed) {
    throw new Error(
      `transaction ${hash} ran out of gas: used all ${receipt.gasUsed} it was given`
    )
  }
  const reason = await publicClient
    .call({ account: sent.from, to: sent.to ?? undefined, data: sent.input, blockNumber: receipt.blockNumber - 1n })
    .then(
      () =>
        // The same call succeeds one block earlier, so what refused it was the
        // state this block had rather than the call itself.
        `no reason given, and the same call succeeds at block ${receipt.blockNumber - 1n}, `
        + `so something in block ${receipt.blockNumber} refused it (used ${receipt.gasUsed} of ${sent.gas})`,
      (error: Error) => error.message.split("\n").find(line => line.includes("reverted")) ?? error.message.split("\n")[0]
    )
  throw new Error(`transaction ${hash} reverted: ${reason}`)
}

/** Stops or restarts mining each transaction as it arrives, so a test can put several in one block. */
export const setAutomine = (enabled: boolean) => testClient.setAutomine(enabled)

export const mineBlock = () => testClient.mine({ blocks: 1 })

/** Moves the fork's clock forward and mines a block at the new time. */
export async function passTime(seconds: number) {
  await testClient.increaseTime({ seconds })
  await testClient.mine({ blocks: 1 })
}

/** A point to return the fork to, for a test that changes protocol state the rest of the suite relies on. */
export const snapshotChain = () => testClient.snapshot()

export const revertChain = (id: Hex) => testClient.revert({ id })

/** Hashes of an account's transactions still waiting in the node's pool. */
export async function pendingHashesFrom(account: Address): Promise<Hex[]> {
  const content = await testClient.getTxpoolContent()
  const queued = Object.entries(content.pending).find(([sender]) => sender.toLowerCase() === account.toLowerCase())
  return queued ? Object.values(queued[1]).map(transaction => transaction.hash) : []
}

/**
 * The age this asset's price may reach before the pool stops acting on it, or
 * null on a deployment with no price guard at all.
 */
export async function maxPriceAgeOf(asset: Address): Promise<number | null> {
  try {
    const [maxPriceAge] = await publicClient.readContract({ abi: poolAbi, address: pool, functionName: "priceGuards", args: [asset] })
    return Number(maxPriceAge)
  } catch {
    return null
  }
}

export const depositOf = (who: Address) =>
  publicClient.readContract({ abi: poolAbi, address: pool, functionName: "compoundedDepositOf", args: [who] })

export const balanceOf = (token: Address, who: Address) =>
  publicClient.readContract({ abi: erc20Abi, address: token, functionName: "balanceOf", args: [who] })

export const positionOf = (who: Address, asset: Address) =>
  publicClient.readContract({ abi: poolAbi, address: pool, functionName: "positions", args: [who, asset] })

export const gainOf = (who: Address, asset: Address) =>
  publicClient.readContract({ abi: poolAbi, address: pool, functionName: "gainOf", args: [who, asset] })

export const contributionOf = (id: bigint, who: Address) =>
  publicClient.readContract({ abi: deskAbi, address: desk, functionName: "contributions", args: [id, who] })

export const partnership = (id: bigint) =>
  publicClient.readContract({ abi: deskAbi, address: desk, functionName: "partnerships", args: [id] })

/**
 * A transaction that reverted for a reason the chain would not give, which is
 * what a fork looks like when the node behind it no longer serves the state of
 * the block it was forked at. `waitFor` replays the call a block earlier and
 * reports "no reason given" when that replay succeeds, so this is the one shape
 * worth trying again: the call was sound, the node was not. Anything the chain
 * explains is a real failure and goes straight up. See safixlabs/safix-app#45.
 */
const nodeWouldNotSay = (error: unknown) =>
  error instanceof Error && error.message.includes("reverted: no reason given")

async function despiteTheNode<T>(what: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await what()
    } catch (error) {
      if (attempt >= attempts || !nodeWouldNotSay(error)) throw error
      await new Promise(resolve => setTimeout(resolve, 500 * attempt))
    }
  }
}

/**
 * Re-posts each asset's own price, as a keeper would. A fork starts from the
 * chain as it stands, where a manually priced asset can be older than its guard
 * allows, and the pool will not draw or liquidate against a stale price.
 */
export async function refreshPrices(assets: Address[]) {
  const owner = await publicClient.readContract({ abi: poolAbi, address: pool, functionName: "owner" })
  const asOwner = await asAccount(owner)
  for (const asset of assets) {
    const [, , , price] = await publicClient.readContract({ abi: poolAbi, address: pool, functionName: "assetConfig", args: [asset] })
    await despiteTheNode(async () =>
      waitFor(await asOwner.writeContract({ abi: poolAbi, address: pool, functionName: "setPrice", args: [asset, price] }))
    )
  }
  await stopImpersonating(owner)
}

/** The price the pool holds for an asset. */
export const priceOf = async (asset: Address) =>
  (await publicClient.readContract({ abi: poolAbi, address: pool, functionName: "assetConfig", args: [asset] }))[3]

/**
 * Moves an asset's price down to `target` in steps the pool's deviation guard
 * accepts, reading each one back rather than assuming it took: a step that does
 * not land would otherwise leave the test asserting against the old price.
 */
export async function lowerPrice(asset: Address, target: bigint) {
  const [, maxDeviationBps, floor] = await publicClient.readContract({ abi: poolAbi, address: pool, functionName: "priceGuards", args: [asset] })
  if (floor !== 0n && target < floor) throw new Error(`a price of ${target} is below the band this asset allows, ${floor}`)
  const owner = await publicClient.readContract({ abi: poolAbi, address: pool, functionName: "owner" })
  const asOwner = await asAccount(owner)
  try {
    let current = await priceOf(asset)
    for (let attempt = 0; current > target && attempt < 20; attempt += 1) {
      const step = maxDeviationBps === 0 ? current - target : (current * BigInt(maxDeviationBps)) / 10_000n
      const next = current - step < target ? target : current - step
      await waitFor(await asOwner.writeContract({ abi: poolAbi, address: pool, functionName: "setPrice", args: [asset, next] }))
      current = await priceOf(asset)
    }
    if (current > target) throw new Error(`${asset} would not come down to ${target}; it is at ${current}`)
  } finally {
    await stopImpersonating(owner)
  }
}

/**
 * Collateral locked in the borrower's position, so a screen has capacity to show.
 *
 * Prices are refreshed first. A fork starts from the chain as it stands, where a
 * manually posted price can already be past the age its guard allows, and the
 * borrow screen refuses a draw on a price the pool will not act on.
 */
export async function givenCollateral(asset: Address, amount?: bigint) {
  await refreshPrices([asset])
  // Enough that the pool's own minimum position is drawable against it. A fixed
  // amount here would be a number typed beside a minimum that lives on chain.
  amount ??= (await positionSizing(asset, 2n)).collateral
  const borrower = accounts.borrower.address as Address
  const wallet = walletFor(accounts.borrower.key)
  await waitFor(await wallet.writeContract({ abi: erc20Abi, address: asset, functionName: "mint", args: [borrower, amount] }))
  await waitFor(await wallet.writeContract({ abi: erc20Abi, address: asset, functionName: "approve", args: [pool, amount] }))
  await waitFor(await wallet.writeContract({ abi: poolAbi, address: pool, functionName: "lockCollateral", args: [asset, amount] }))
}

/** USDG in the wallet, so a deposit screen has something to offer. */
export async function givenUsdg(amount = 10_000_000_000n) {
  const borrower = accounts.borrower.address as Address
  const wallet = walletFor(accounts.borrower.key)
  await waitFor(await wallet.writeContract({ abi: erc20Abi, address: usdgToken, functionName: "mint", args: [borrower, amount] }))
}

/**
 * The same, with a draw against it, for a screen that has to show a live debt.
 *
 * The size is read from the pool rather than typed: the minimum position and the
 * asset's borrowing limit both live on chain and both can change, and a number
 * written here would be a second source of truth that silently goes stale.
 */
export async function givenDebt(asset: Address) {
  await refreshPrices([asset])
  const { drawn } = await positionSizing(asset, 2n)
  await givenCollateral(asset)
  const wallet = walletFor(accounts.borrower.key)
  await waitFor(await wallet.writeContract({ abi: poolAbi, address: pool, functionName: "draw", args: [asset, drawn] }))
}

/**
 * Sizes a position from what the pool says, not from numbers typed here: a draw
 * a fifth above the pool's minimum position, and collateral worth `cover` times
 * what the asset's borrowing limit needs for it.
 */
export async function positionSizing(asset: Address, cover: bigint) {
  const [[, maxLtvBps, liqThresholdBps, price], minDebt, feeBps] = await Promise.all([
    publicClient.readContract({ abi: poolAbi, address: pool, functionName: "assetConfig", args: [asset] }),
    publicClient.readContract({ abi: poolAbi, address: pool, functionName: "minPositionDebt" }),
    publicClient.readContract({ abi: poolAbi, address: pool, functionName: "originationFeeBps" })
  ])
  const drawn = minDebt + minDebt / 5n
  const debt = drawn + (drawn * BigInt(feeBps)) / 10_000n
  // Collateral value in stable units is collateral * price / 1e30, as the pool computes it.
  const needed = (debt * 10n ** 30n * 10_000n) / (price * BigInt(maxLtvBps))
  // Whole tokens, rounded up, so the amount can be typed into the screen as it is.
  const collateral = ((needed * cover) / 10n ** 18n + 1n) * 10n ** 18n
  return { drawn, debt, collateral, price, liqThresholdBps }
}

export const usd = (units: bigint) => Number(units) / 1e6
export const tokens = (units: bigint) => Number(units) / 1e18
