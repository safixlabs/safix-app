import { pad, parseAbi, parseEventLogs, toEventSelector, type Address, type Log, type PublicClient } from "viem"
import { fetchActivity, indexerUsable, type IndexedEvent } from "./indexer"
import { deployBlock, deskAddress, poolAddress, registryAddress } from "./safix"

/**
 * A wallet's own history, from the index when there is one and from the chain
 * when there is not.
 *
 * The chain path is not a degraded stub. Every pool and registry event carries
 * the wallet as its **first** indexed parameter, so the whole history is one
 * `eth_getLogs` with the address in topic 1 — the node does the filtering, and
 * one round trip covers every action the wallet has ever taken. The desk puts
 * the partnership id first and the wallet second, so it takes a second call.
 *
 * What the index adds is block timestamps, paging, and the price behind a
 * liquidation. What it must never add is a reason for this screen to be empty.
 */

export type ActivityRow = {
  block: number
  logIndex: number
  txHash: `0x${string}`
  /** Seconds since the epoch. Absent on the chain path, which does not pay for block reads. */
  timestamp: number | null
  source: "pool" | "desk" | "registry"
  name: string
  asset: Address | null
  args: Record<string, string>
}

export type ActivityResult = {
  rows: ActivityRow[]
  /** Where the rows came from, so a screen can say what it is showing. */
  from: "index" | "chain"
  /** Block to page from, index path only. */
  nextBefore: number | null
}

/** Pool and registry events, all of which put the wallet in topic 1. */
const WALLET_FIRST = parseAbi([
  "event Deposited(address indexed provider, uint256 amount)",
  "event Withdrawn(address indexed provider, uint256 amount)",
  "event GainsClaimed(address indexed provider, address indexed asset, uint256 amount)",
  "event CollateralLocked(address indexed borrower, address indexed asset, uint256 amount)",
  "event CollateralWithdrawn(address indexed borrower, address indexed asset, uint256 amount)",
  "event Drawn(address indexed borrower, address indexed asset, uint256 amount, uint256 fee)",
  "event Repaid(address indexed borrower, address indexed asset, uint256 amount)",
  "event PositionClosed(address indexed borrower, address indexed asset, uint256 redemptionFee)",
  "event Liquidated(address indexed borrower, address indexed asset, address indexed caller, uint256 debtOffset, uint256 collateralSeized)",
  "event Attested(address indexed subject, uint8 checkMask, uint64 expiry)",
  "event CheckAttested(address indexed subject, uint8 check, uint64 expiry)",
  "event CheckRevoked(address indexed subject, uint8 check)",
  "event Revoked(address indexed subject)"
])

/** Desk events, which put the partnership id in topic 1 and the wallet in topic 2. */
const WALLET_SECOND = parseAbi([
  "event Funded(uint256 indexed id, address indexed funder, uint256 amount)",
  "event FunderClaimed(uint256 indexed id, address indexed funder, uint256 amount)",
  "event OperatorClaimed(uint256 indexed id, address indexed operator, uint256 amount)",
  "event PartnershipCreated(uint256 indexed id, address indexed operator, uint16 operatorShareBps, uint256 fundingGoal, uint64 fundingDeadline)"
])

const selectors = (abi: readonly { name?: string; inputs?: readonly { type: string }[] }[]) =>
  abi.map(entry => toEventSelector(`${entry.name}(${(entry.inputs ?? []).map(input => input.type).join(",")})`))

const REGISTRY_EVENTS = new Set(["Attested", "CheckAttested", "CheckRevoked", "Revoked"])

const sourceOf = (name: string): ActivityRow["source"] =>
  REGISTRY_EVENTS.has(name) ? "registry" : WALLET_SECOND.some(entry => entry.name === name) ? "desk" : "pool"

const stringify = (value: unknown): string => (typeof value === "bigint" ? value.toString() : String(value))

const fromIndexed = (event: IndexedEvent): ActivityRow => ({
  block: event.block,
  logIndex: event.logIndex,
  txHash: event.txHash,
  timestamp: event.timestamp,
  source: event.source,
  name: event.name,
  asset: event.asset,
  args: event.args
})

const decode = (logs: Log[], abi: typeof WALLET_FIRST | typeof WALLET_SECOND): ActivityRow[] =>
  parseEventLogs({ abi, logs })
    .filter(entry => entry.blockNumber !== null && entry.logIndex !== null)
    .map(entry => {
      const args = entry.args as Record<string, unknown>
      return {
        block: Number(entry.blockNumber),
        logIndex: Number(entry.logIndex),
        txHash: entry.transactionHash as `0x${string}`,
        // The chain path does not fetch block timestamps: it would be one request
        // per block, and the ordering a history needs is already in the block number.
        timestamp: null,
        source: sourceOf(entry.eventName),
        name: entry.eventName,
        asset: (args.asset as Address | undefined) ?? null,
        args: Object.fromEntries(Object.entries(args).map(([key, value]) => [key, stringify(value)]))
      }
    })

/** Reads the wallet's history straight from the node. Two `eth_getLogs`, no index involved. */
export async function readActivityFromChain(client: PublicClient, wallet: Address): Promise<ActivityRow[]> {
  const walletTopic = pad(wallet.toLowerCase() as Address, { size: 32 })
  const rows: ActivityRow[] = []

  const first = [poolAddress, registryAddress].filter(Boolean) as Address[]
  if (first.length > 0) {
    const logs = (await client.request({
      method: "eth_getLogs",
      params: [
        {
          address: first,
          topics: [selectors(WALLET_FIRST) as `0x${string}`[], walletTopic],
          fromBlock: `0x${deployBlock.toString(16)}`,
          toBlock: "latest"
        }
      ]
    } as never)) as Log[]
    rows.push(...decode(logs, WALLET_FIRST))
  }

  if (deskAddress) {
    const logs = (await client.request({
      method: "eth_getLogs",
      params: [
        {
          address: [deskAddress],
          // Topic 1 is the partnership id and could be anything; null matches every value.
          topics: [selectors(WALLET_SECOND) as `0x${string}`[], null, walletTopic],
          fromBlock: `0x${deployBlock.toString(16)}`,
          toBlock: "latest"
        }
      ]
    } as never)) as Log[]
    rows.push(...decode(logs, WALLET_SECOND))
  }

  return rows.sort((a, b) => (b.block === a.block ? b.logIndex - a.logIndex : b.block - a.block))
}

/**
 * The wallet's history. Prefers the index, falls back to the chain, and says
 * which it used so the screen can be honest about what it is showing.
 */
export async function readActivity(
  client: PublicClient,
  wallet: Address,
  limit = 100,
  before?: number
): Promise<ActivityResult> {
  if (await indexerUsable()) {
    const indexed = await fetchActivity(wallet, limit, before)
    if (indexed) {
      return { rows: indexed.events.map(fromIndexed), from: "index", nextBefore: indexed.nextBefore }
    }
  }
  // The chain path reads the whole history in one go; paging it would mean
  // re-reading the same logs, so it is returned complete and trimmed.
  const rows = await readActivityFromChain(client, wallet)
  return { rows: rows.slice(0, limit), from: "chain", nextBefore: null }
}
