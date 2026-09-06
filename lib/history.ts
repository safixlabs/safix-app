import type { Address, PublicClient } from "viem"
import { deployBlock, liquidatedEvent } from "./safix"

export type LiquidationRow = {
  transactionHash: `0x${string}`
  blockNumber: bigint
  /** Seconds since the epoch, absent if the block could not be read. */
  timestamp?: number
  asset: Address
  /** Debt the pool absorbed, in stable units. */
  debtCleared: bigint
  /** Collateral taken from the position, in token units. */
  collateralSeized: bigint
  /** Whoever called the liquidation. */
  caller: Address
}

/**
 * Every liquidation this wallet has been on the wrong end of, newest first.
 *
 * Read straight from the node. `Liquidated` indexes the borrower, so the filter
 * happens where the logs live and the whole chain can be asked at once — the
 * history needs no index in front of it. If one arrives later, only this
 * function changes; nothing that calls it knows where the rows came from.
 */
export async function readLiquidations(
  client: PublicClient,
  pool: Address,
  borrower: Address
): Promise<LiquidationRow[]> {
  const logs = await client.getLogs({
    address: pool,
    event: liquidatedEvent,
    args: { borrower },
    fromBlock: deployBlock,
    toBlock: "latest"
  })

  const rows = logs.map(log => ({
    transactionHash: log.transactionHash,
    blockNumber: log.blockNumber,
    asset: log.args.asset as Address,
    caller: log.args.caller as Address,
    debtCleared: (log.args.debtOffset ?? 0n) as bigint,
    collateralSeized: (log.args.collateralSeized ?? 0n) as bigint
  }))

  // Block timestamps are a second round trip, so only the blocks actually in
  // the list are fetched, and each one only once.
  const blocks = [...new Set(rows.map(row => row.blockNumber))]
  const times = new Map<bigint, number>()
  await Promise.all(
    blocks.map(async number => {
      try {
        const block = await client.getBlock({ blockNumber: number })
        times.set(number, Number(block.timestamp))
      } catch {
        // A pruned or unavailable block costs the row its date, nothing more.
      }
    })
  )

  return rows
    .map(row => ({ ...row, timestamp: times.get(row.blockNumber) }))
    .sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : b.blockNumber < a.blockNumber ? -1 : 0))
}
