"use client"

import { useEffect, useState } from "react"
import { useAccount, usePublicClient } from "wagmi"
import { explorerTxUrl } from "@/lib/chain"
import { usd } from "@/lib/demo"
import { readLiquidations, type LiquidationRow } from "@/lib/history"
import { fromTokenUnits, fromUsdgUnits, liveAssets, poolAddress } from "@/lib/safix"
import { AssetMark, Panel } from "./ui"

const symbolFor = (asset: string) =>
  liveAssets.find(candidate => candidate.address.toLowerCase() === asset.toLowerCase())?.symbol ?? "Collateral"

const when = (timestamp?: number) =>
  timestamp
    ? new Date(timestamp * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "Date unavailable"

export default function LiquidationHistory() {
  const { address } = useAccount()
  const client = usePublicClient()
  const [rows, setRows] = useState<LiquidationRow[]>([])
  const [state, setState] = useState<"idle" | "loading" | "ready" | "failed">("idle")

  useEffect(() => {
    let cancelled = false
    const pool = poolAddress
    setRows([])
    if (!client || !address || !pool) {
      setState("idle")
      return
    }
    setState("loading")
    readLiquidations(client, pool, address)
      .then(result => {
        if (cancelled) return
        setRows(result)
        setState("ready")
      })
      .catch(() => {
        if (!cancelled) setState("failed")
      })
    return () => {
      cancelled = true
    }
  }, [client, address])

  return (
    <Panel title="Liquidation history">
      {state === "idle" ? (
        <p className="py-2 text-[14px] leading-[1.6] tracking-[-0.01em] text-haze">
          Connect a wallet to see whether any of its positions have been liquidated.
        </p>
      ) : state === "loading" ? (
        <p className="py-2 text-[14px] tracking-[-0.01em] text-haze">Reading the chain…</p>
      ) : state === "failed" ? (
        <p className="py-2 text-[14px] leading-[1.6] tracking-[-0.01em] text-haze">
          The node would not return the event history. The rest of this screen is unaffected.
        </p>
      ) : rows.length === 0 ? (
        <p className="py-2 text-[14px] leading-[1.6] tracking-[-0.01em] text-haze">
          Nothing here. No position of this wallet has ever been liquidated.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {rows.map(row => {
            const url = explorerTxUrl(row.transactionHash)
            const symbol = symbolFor(row.asset)
            return (
              <li key={`${row.transactionHash}-${row.blockNumber}`} className="flex items-center gap-3.5 py-3.5">
                <AssetMark symbol={symbol} className="h-9 w-9" />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold tracking-[-0.01em] text-fog">
                    {fromTokenUnits(row.collateralSeized).toFixed(4)} {symbol} seized
                  </p>
                  <p className="mt-0.5 text-[12px] tracking-[-0.02em] text-haze">
                    {when(row.timestamp)} · cleared {usd(fromUsdgUnits(row.debtCleared))} of debt
                  </p>
                </div>
                {url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 text-[12.5px] text-mint transition-colors hover:text-mint-bright"
                  >
                    Explorer ↗
                  </a>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
