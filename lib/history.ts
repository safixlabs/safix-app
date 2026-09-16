import { createPublicClient, http, pad, parseAbi, parseEventLogs, toEventSelector, type Address, type Log, type PublicClient } from "viem"
import { activeChain, rpcEndpoints } from "./chain"
import { fetchActivity, indexerUsable, type IndexedEvent } from "./indexer"
import { deployBlock, deskAddress, liquidatedEvent, poolAddress, registryAddress } from "./safix"

/**
 * A wallet's own history, from the index when there is one and from the chain
 * when there is not. The one place the app reads event logs: the full activity
 * list and the liquidation panel are both this read, the second one narrowed to
 * a single event.
 *
 * The chain path is not a degraded stub. Every pool and registry event carries
 * the wallet as its **first** indexed parameter, so the whole history is one
 * `eth_getLogs` with the address in topic 1 — the node does the filtering, and
 * one round trip covers every action the wallet has ever taken. The desk puts
 * the partnership id first and the wallet second, so it takes a second call.
 * Both ask for everything since the deployment block. The public testnet RPC
 * serves that range; a provider that caps it is skipped, see `walletLogs`.
 *
 * What the index adds is paging and the price behind a liquidation. What it must
 * never add is a reason for this list to be empty.
 */

export type HistoryRow = {
  block: number
  logIndex: number
  txHash: `0x${string}`
  /** Seconds since the epoch, or null when the block could not be read. */
  timestamp: number | null
  source: "pool" | "desk" | "registry"
  name: string
  asset: Address | null
  args: Record<string, string>
}

export type HistoryResult = {
  rows: HistoryRow[]
  /** Where the rows came from, so a screen can say what it is showing. */
  from: "index" | "chain"
  /** Block to page from, index path only. */
  nextBefore: number | null
}

/** Pool and registry events, all of which put the wallet in topic 1. */
const WALLET_FIRST = [
  ...parseAbi([
    "event Deposited(address indexed provider, uint256 amount)",
    "event Withdrawn(address indexed provider, uint256 amount)",
    "event GainsClaimed(address indexed provider, address indexed asset, uint256 amount)",
    "event CollateralLocked(address indexed borrower, address indexed asset, uint256 amount)",
    "event CollateralWithdrawn(address indexed borrower, address indexed asset, uint256 amount)",
    "event Drawn(address indexed borrower, address indexed asset, uint256 amount, uint256 fee)",
    "event Repaid(address indexed borrower, address indexed asset, uint256 amount)",
    "event PositionClosed(address indexed borrower, address indexed asset, uint256 redemptionFee)",
    "event Attested(address indexed subject, uint8 checkMask, uint64 expiry)",
    "event CheckAttested(address indexed subject, uint8 check, uint64 expiry)",
    "event CheckRevoked(address indexed subject, uint8 check)",
    "event Revoked(address indexed subject)"
  ]),
  liquidatedEvent
]

/** Desk events, which put the partnership id in topic 1 and the wallet in topic 2. */
const WALLET_SECOND = parseAbi([
  "event Funded(uint256 indexed id, address indexed funder, uint256 amount)",
  "event FunderClaimed(uint256 indexed id, address indexed funder, uint256 amount)",
  "event OperatorClaimed(uint256 indexed id, address indexed operator, uint256 amount)",
  "event PartnershipCreated(uint256 indexed id, address indexed operator, uint16 operatorShareBps, uint256 fundingGoal, uint64 fundingDeadline)"
])

type EventAbi = readonly { type: string; name?: string; inputs?: readonly { type: string }[] }[]

const selectors = (abi: EventAbi) =>
  abi.map(entry => toEventSelector(`${entry.name}(${(entry.inputs ?? []).map(input => input.type).join(",")})`))

const only = <T extends EventAbi>(abi: T, names?: readonly string[]) =>
  (names ? abi.filter(entry => entry.name && names.includes(entry.name)) : abi) as T

const REGISTRY_EVENTS = new Set(["Attested", "CheckAttested", "CheckRevoked", "Revoked"])

const sourceOf = (name: string): HistoryRow["source"] =>
  REGISTRY_EVENTS.has(name) ? "registry" : WALLET_SECOND.some(entry => entry.name === name) ? "desk" : "pool"

const stringify = (value: unknown): string => (typeof value === "bigint" ? value.toString() : String(value))

const fromIndexed = (event: IndexedEvent): HistoryRow => ({
  block: event.block,
  logIndex: event.logIndex,
  txHash: event.txHash,
  timestamp: event.timestamp,
  source: event.source,
  name: event.name,
  asset: event.asset,
  args: event.args
})

const decode = (logs: Log[], abi: EventAbi): HistoryRow[] =>
  parseEventLogs({ abi: abi as typeof WALLET_FIRST, logs })
    .filter(entry => entry.blockNumber !== null && entry.logIndex !== null)
    .map(entry => {
      const args = entry.args as Record<string, unknown>
      return {
        block: Number(entry.blockNumber),
        logIndex: Number(entry.logIndex),
        txHash: entry.transactionHash as `0x${string}`,
        timestamp: null,
        source: sourceOf(entry.eventName),
        name: entry.eventName,
        asset: (args.asset as Address | undefined) ?? null,
        args: Object.fromEntries(Object.entries(args).map(([key, value]) => [key, stringify(value)]))
      }
    })

/**
 * Block timestamps already read. A block's time never changes, so a list read
 * again on the refresh interval only pays for blocks it has not seen before.
 */
const blockTimes = new Map<number, number>()

/** When a block was produced, in seconds, or null when the node cannot say. */
export async function blockTimestamp(client: PublicClient, block: number): Promise<number | null> {
  const known = blockTimes.get(block)
  if (known !== undefined) return known
  try {
    const read = await client.getBlock({ blockNumber: BigInt(block) })
    blockTimes.set(block, Number(read.timestamp))
    return Number(read.timestamp)
  } catch {
    // A pruned or unavailable block costs the row its date, nothing more.
    return null
  }
}

async function withTimestamps(client: PublicClient, rows: HistoryRow[]): Promise<HistoryRow[]> {
  const blocks = [...new Set(rows.map(row => row.block))]
  const times = new Map(await Promise.all(blocks.map(async block => [block, await blockTimestamp(client, block)] as const)))
  return rows.map(row => ({ ...row, timestamp: times.get(row.block) ?? null }))
}

/**
 * Endpoints that have refused a log query over the history's range this session.
 *
 * Some providers cap `eth_getLogs` at a handful of blocks on their cheaper plans,
 * and the history asks for everything since the deployment. An endpoint that has
 * said so is not asked again: otherwise every refresh pays for the same refusal
 * before it reaches a node that answers. Any other failure is not remembered,
 * because a node that timed out once may well answer the next time.
 */
const refusesRange = new Set<string>()

const logReaders = new Map(
  rpcEndpoints.map(url => [
    url,
    createPublicClient({ chain: activeChain, transport: http(url, { retryCount: 1, timeout: 8_000 }) })
  ])
)

/** A provider saying the block range is more than it serves, as opposed to failing to answer. */
const isRangeRefusal = (error: unknown) => {
  const coded = (error as { walk?: (test: (cause: unknown) => boolean) => unknown }).walk?.(
    cause => typeof (cause as { code?: unknown }).code === "number"
  ) as { code?: number } | undefined
  const message = error instanceof Error ? error.message : String(error)
  return (
    coded?.code === -32615 ||
    /limited to (a )?\d+ (block )?range|block range|range (is )?too (large|wide)|too many blocks/i.test(message)
  )
}

/**
 * One `eth_getLogs` over the history's range, asked of each endpoint in turn
 * until one answers. Throws the last failure when none does.
 */
async function walletLogs(address: Address[], topics: (`0x${string}` | `0x${string}`[] | null)[]): Promise<Log[]> {
  const params = { address, topics, fromBlock: `0x${deployBlock.toString(16)}`, toBlock: "latest" }
  let lastError: unknown = new Error("No endpoint is configured to read logs from.")
  for (const url of rpcEndpoints) {
    const reader = logReaders.get(url)
    if (!reader || refusesRange.has(url)) continue
    try {
      return (await reader.request({ method: "eth_getLogs", params: [params] } as never)) as Log[]
    } catch (error) {
      if (isRangeRefusal(error)) refusesRange.add(url)
      lastError = error
    }
  }
  throw lastError
}

/**
 * Reads the wallet's history straight from the node, newest first. At most two
 * `eth_getLogs`, fewer when `names` narrows the events to one contract's.
 */
export async function readHistoryFromChain(wallet: Address, names?: readonly string[]): Promise<HistoryRow[]> {
  const walletTopic = pad(wallet.toLowerCase() as Address, { size: 32 })
  const first = only(WALLET_FIRST, names)
  const second = only(WALLET_SECOND, names)
  const rows: HistoryRow[] = []

  const firstContracts = [poolAddress, registryAddress].filter(Boolean) as Address[]
  if (first.length > 0 && firstContracts.length > 0) {
    rows.push(...decode(await walletLogs(firstContracts, [selectors(first), walletTopic]), first))
  }

  if (second.length > 0 && deskAddress) {
    // Topic 1 is the partnership id and could be anything; null matches every value.
    rows.push(...decode(await walletLogs([deskAddress], [selectors(second), null, walletTopic]), second))
  }

  return rows.sort((a, b) => (b.block === a.block ? b.logIndex - a.logIndex : b.block - a.block))
}

/**
 * The wallet's history. Prefers the index, falls back to the chain, and says
 * which it used so the screen can be honest about what it is showing.
 */
export async function readHistory(
  client: PublicClient,
  wallet: Address,
  { names, limit = 100, before }: { names?: readonly string[]; limit?: number; before?: number } = {}
): Promise<HistoryResult> {
  if (await indexerUsable()) {
    const indexed = await fetchActivity(wallet, limit, before)
    if (indexed) {
      const events = names ? indexed.events.filter(event => names.includes(event.name)) : indexed.events
      return { rows: events.map(fromIndexed), from: "index", nextBefore: indexed.nextBefore }
    }
  }
  // The chain path reads the whole history in one go; paging it would mean
  // re-reading the same logs, so it is returned complete and trimmed.
  const rows = await readHistoryFromChain(wallet, names)
  return { rows: await withTimestamps(client, rows.slice(0, limit)), from: "chain", nextBefore: null }
}
