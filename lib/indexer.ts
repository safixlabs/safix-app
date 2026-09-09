import type { Address } from "viem"

/**
 * Client for the Safix event index.
 *
 * The index is an enhancement and never a dependency. Every function here
 * returns `null` rather than throwing when the index is absent, unreachable or
 * slow, and every caller has a path that works from the chain alone. A history
 * screen that goes blank because a service the team runs is down is worse than
 * one that is simply slower.
 *
 * Configured with `NEXT_PUBLIC_INDEXER_URL`. Unset means the app never calls
 * it, which is the shipping default until an index is actually running.
 */

const base = process.env.NEXT_PUBLIC_INDEXER_URL?.trim().replace(/\/+$/, "")

/** Whether an index is configured at all. Screens use this to decide what to say, not what to show. */
export const indexerConfigured = Boolean(base)

/**
 * How far behind the head the index may be and still be used. Past this the app
 * prefers the chain: a stale index omits exactly the newest rows, which are the
 * ones a user has just made and is looking for.
 */
const MAX_LAG_BLOCKS = 20_000

/** Time the index gets to answer before the app stops waiting and reads the chain instead. */
const TIMEOUT_MS = 4_000

export type IndexedEvent = {
  block: number
  logIndex: number
  txHash: `0x${string}`
  timestamp: number | null
  source: "pool" | "desk" | "registry"
  contract: Address
  name: string
  asset: Address | null
  args: Record<string, string>
}

async function get<T>(path: string): Promise<T | null> {
  if (!base) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(`${base}${path}`, { signal: controller.signal, cache: "no-store" })
    if (!response.ok) return null
    return (await response.json()) as T
  } catch {
    // Unreachable, slow, blocked by CORS, serving nonsense — all the same answer
    // to the caller, which is "read the chain".
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Whether the index is up and current enough to be worth asking. Checked before
 * a history read so a lagging index is skipped rather than believed.
 */
export async function indexerUsable(): Promise<boolean> {
  const status = await get<{ cursor: number | null; blocksBehind: number | null }>("/status")
  if (!status || status.cursor === null) return false
  return status.blocksBehind === null || status.blocksBehind <= MAX_LAG_BLOCKS
}

/**
 * A wallet's history across the pool, the desk and the registry, newest first.
 *
 * Null means the index could not answer. It does not mean the wallet has no
 * history — an empty list means that, and the distinction is what lets a screen
 * say "nothing here" only when it knows.
 */
export async function fetchActivity(
  address: Address,
  limit = 100,
  before?: number
): Promise<{ events: IndexedEvent[]; nextBefore: number | null } | null> {
  const query = new URLSearchParams({ limit: String(limit) })
  if (before !== undefined) query.set("before", String(before))
  const body = await get<{ events: IndexedEvent[]; nextBefore: number | null }>(
    `/history/${address}?${query.toString()}`
  )
  if (!body || !Array.isArray(body.events)) return null
  return { events: body.events, nextBefore: body.nextBefore ?? null }
}

export type IndexedLiquidation = {
  block: number
  timestamp: number | null
  txHash: `0x${string}`
  borrower: Address | null
  asset: Address | null
  caller: Address
  debtCleared: string
  collateralSeized: string
  /** The asset's price when the pool acted, 18 decimals, or null when nothing records it. */
  price1e18: string | null
  priceSource: "feed" | "manual" | null
  collateralValue: string | null
}

/**
 * Liquidations, with the price the pool acted on.
 *
 * This is the one thing the chain cannot answer for on its own: the node keeps
 * state for about thirteen minutes, so by the time anyone looks, the price at
 * the liquidation's block is gone. The index keeps the feed's own log, which is
 * not pruned. Without an index the app still lists liquidations — it just
 * cannot say what the collateral was worth at the time.
 */
export async function fetchLiquidations(limit = 50): Promise<IndexedLiquidation[] | null> {
  const body = await get<{ liquidations: IndexedLiquidation[] }>(`/liquidations?limit=${limit}`)
  if (!body || !Array.isArray(body.liquidations)) return null
  return body.liquidations
}

export type PoolPoint = {
  block: number
  timestamp: number | null
  totalDeposits: string
  totalDebt: string
  utilisationBps: number
}

/** Pool size and utilisation over time. Chain reads give the latest value only. */
export async function fetchPoolHistory(limit = 200): Promise<PoolPoint[] | null> {
  const body = await get<{ points: PoolPoint[] }>(`/pool/history?limit=${limit}`)
  if (!body || !Array.isArray(body.points)) return null
  return body.points
}
