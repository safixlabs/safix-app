"use client"

import { explorerTxUrl } from "@/lib/chain"
import { usd } from "@/lib/demo"
import { fromTokenUnits, fromUsdgUnits, liveAssets } from "@/lib/safix"
import { useWalletHistory } from "@/lib/wallet-history"
import { AssetMark, Panel } from "./ui"

/** The wallet's history, narrowed to the one event this panel is about. */
const LIQUIDATED = ["Liquidated"] as const

const symbolFor = (asset: string | null) =>
  (asset && liveAssets.find(candidate => candidate.address.toLowerCase() === asset.toLowerCase())?.symbol) ||
  "Collateral"

const when = (timestamp: number | null) =>
  timestamp
    ? new Date(timestamp * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "Date unavailable"

export default function LiquidationHistory() {
  const { result, state } = useWalletHistory("liquidations", { names: LIQUIDATED })
  const rows = result?.rows ?? []

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
            const url = explorerTxUrl(row.txHash)
            const symbol = symbolFor(row.asset)
            return (
              <li key={`${row.txHash}-${row.logIndex}`} className="flex items-center gap-3.5 py-3.5">
                <AssetMark symbol={symbol} className="h-9 w-9" />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold tracking-[-0.01em] text-fog">
                    {fromTokenUnits(BigInt(row.args.collateralSeized ?? "0")).toFixed(4)} {symbol} seized
                  </p>
                  <p className="mt-0.5 text-[12px] tracking-[-0.02em] text-haze">
                    {when(row.timestamp)} · cleared {usd(fromUsdgUnits(BigInt(row.args.debtOffset ?? "0")))} of debt
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
