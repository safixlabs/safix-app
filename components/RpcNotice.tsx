"use client"

import { useEffect, useState } from "react"
import RobinhoodText from "./RobinhoodText"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { activeChain } from "@/lib/chain"
import { reportCacheHealth, useReadHealth } from "@/lib/health"
import { REFRESH_MS } from "@/lib/polling"
import { rpcEndpoints } from "@/lib/wagmi"

const PROBE_TIMEOUT_MS = 5_000

const age = (since: number) => {
  const seconds = Math.max(0, Math.round((Date.now() - since) / 1000))
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"} ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`
  const hours = Math.round(minutes / 60)
  return `${hours} hour${hours === 1 ? "" : "s"} ago`
}

/** Asks one endpoint for the block height, and gives up quickly. */
async function reachable(url: string): Promise<boolean> {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), PROBE_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
      signal: abort.signal
    })
    if (!response.ok) return false
    const body = await response.json()
    return typeof body?.result === "string"
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

const isContractRead = (key: readonly unknown[]) =>
  typeof key[0] === "string" && key[0].startsWith("readContract")

type MaybeResult = { status?: string }

/**
 * Whether a read came back empty because the chain would not answer.
 *
 * `useReadContracts` allows failures by default, so a total outage does not
 * throw: the query resolves successfully with every entry marked `failure`, and
 * the screens turn those into zeroes. Watching only for a rejected query is
 * exactly how a dead endpoint ends up displayed as an empty pool.
 */
const isFailing = (state: { fetchFailureCount: number; status: string; data: unknown }) => {
  if (state.fetchFailureCount > 0 || state.status === "error") return true
  return (
    Array.isArray(state.data) &&
    state.data.some(entry => (entry as MaybeResult | null)?.status === "failure")
  )
}

/**
 * Says so when the chain has stopped answering.
 *
 * It watches the reads the app already makes rather than polling on its own:
 * a healthy screen costs nothing extra, which is what keeps the pool screen to
 * the single round trip it is supposed to load in. Only once a read has failed
 * does it start asking the endpoints directly, and then only to work out how
 * widespread the outage is and to notice the moment it clears.
 *
 * The direct probe exists because the app's reads are deliberately stubborn —
 * each endpoint is retried on a twelve second timeout before the next is tried
 * — which is right for a figure somebody is waiting on and far too patient for
 * telling them something is wrong.
 */
export default function RpcNotice() {
  const queryClient = useQueryClient()
  const health = useReadHealth()

  useEffect(() => {
    const cache = queryClient.getQueryCache()
    const read = () => {
      const reads = cache
        .getAll()
        .filter(query => isContractRead(query.queryKey as readonly unknown[]))
        // A query that has never been run says nothing about the chain.
        .filter(
          query =>
            query.state.dataUpdatedAt > 0 ||
            query.state.fetchFailureCount > 0 ||
            query.state.status === "error"
        )
      if (reads.length === 0) return
      // Every read, not any read. Some are expected to fail on their own — the
      // ERC-8056 multiplier is absent from most tokens and is asked hopefully —
      // and one of those failing says nothing about the chain. A chain that has
      // stopped answering fails all of them at once.
      const failing = reads.every(query => isFailing(query.state))
      // Only a read that actually carried figures counts as a good moment.
      const lastGood = reads.reduce(
        (latest, query) => (isFailing(query.state) ? latest : Math.max(latest, query.state.dataUpdatedAt)),
        0
      )
      reportCacheHealth(failing, lastGood)
    }
    read()
    return cache.subscribe(read)
  }, [queryClient])

  const probe = useQuery({
    queryKey: ["rpc-health", activeChain.id, rpcEndpoints],
    queryFn: async () => {
      const results = await Promise.all(rpcEndpoints.map(reachable))
      return results.filter(Boolean).length
    },
    enabled: health.failing,
    refetchInterval: REFRESH_MS,
    refetchIntervalInBackground: false,
    retry: false,
    staleTime: 0
  })

  // The wording carries an age, so it has to be redrawn as that age grows.
  const [, tick] = useState(0)
  useEffect(() => {
    if (!health.failing) return
    const timer = setInterval(() => tick(value => value + 1), 10_000)
    return () => clearInterval(timer)
  }, [health.failing])

  if (!health.failing) return null

  const reached = probe.data
  const where =
    reached === undefined
      ? `${activeChain.name} is not answering.`
      : reached === 0
        ? rpcEndpoints.length > 1
          ? `None of the ${rpcEndpoints.length} ${activeChain.name} endpoints are answering.`
          : `${activeChain.name} is not answering.`
        : `${activeChain.name} is answering again; the screen is catching up.`

  return (
    <div role="status" className="border-b border-amber/40 bg-amber/10">
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-2.5 px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold tracking-[-0.01em] text-fog">Live data is not loading</p>
          <p className="mt-0.5 text-[12.5px] leading-[1.5] tracking-[-0.01em] text-mist">
            <RobinhoodText>{where}</RobinhoodText>{" "}
            {health.lastGood
              ? `Everything on screen was last confirmed ${age(health.lastGood)} and may have moved since.`
              : "Nothing on screen has been confirmed against the chain yet."}
          </p>
        </div>
        <button
          onClick={() => {
            probe.refetch()
            queryClient.refetchQueries({ type: "active" })
          }}
          disabled={probe.isFetching}
          className="shrink-0 self-start rounded-[var(--corner-control)] border border-line px-4 py-2 text-[12.5px] font-medium tracking-[-0.01em] text-mist transition-colors hover:border-mint hover:text-mint disabled:opacity-50 sm:self-auto"
        >
          {probe.isFetching ? "Retrying…" : "Retry"}
        </button>
      </div>
    </div>
  )
}
