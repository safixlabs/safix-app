"use client"

import { useEffect, useState } from "react"
import type { Address } from "viem"
import { useAccount, usePublicClient } from "wagmi"
import { readActivity, type ActivityResult, type ActivityRow } from "@/lib/activity"
import { explorerTxUrl } from "@/lib/chain"
import { usd } from "@/lib/demo"
import { fromTokenUnits, fromUsdgUnits, liveAssets, poolAddress } from "@/lib/safix"
import { Panel } from "./ui"

const symbolFor = (asset: string | null) =>
  asset
    ? (liveAssets.find(candidate => candidate.address.toLowerCase() === asset.toLowerCase())?.symbol ?? "collateral")
    : "collateral"

const stable = (value: string | undefined) => usd(fromUsdgUnits(BigInt(value ?? "0")))
const token = (value: string | undefined) => fromTokenUnits(BigInt(value ?? "0")).toFixed(4)

/**
 * One line of plain English per event.
 *
 * The chain's own vocabulary is not the user's: "PositionClosed" and
 * "GainsClaimed" describe the contract's state machine, not what somebody did
 * with their money. Anything unrecognised falls through to its event name
 * rather than being hidden, so a new event shows up as soon as it is emitted
 * instead of waiting for this list to catch up.
 */
function describe(row: ActivityRow): string {
  const asset = symbolFor(row.asset)
  switch (row.name) {
    case "Deposited":
      return `Deposited ${stable(row.args.amount)} into the pool`
    case "Withdrawn":
      return `Withdrew ${stable(row.args.amount)} from the pool`
    case "GainsClaimed":
      return `Claimed ${token(row.args.amount)} ${asset} of liquidation gains`
    case "CollateralLocked":
      return `Locked ${token(row.args.amount)} ${asset} as collateral`
    case "CollateralWithdrawn":
      return `Withdrew ${token(row.args.amount)} ${asset} of collateral`
    case "Drawn":
      return `Drew ${stable(row.args.amount)}, plus ${stable(row.args.fee)} origination fee`
    case "Repaid":
      return `Repaid ${stable(row.args.amount)}`
    case "PositionClosed":
      return `Closed the ${asset} position, paying ${stable(row.args.redemptionFee)} redemption fee`
    case "Liquidated":
      return `Liquidated: ${token(row.args.collateralSeized)} ${asset} seized against ${stable(row.args.debtOffset)} of debt`
    case "Attested":
      return "Passport attested"
    case "CheckAttested":
      return "A passport check was renewed"
    case "CheckRevoked":
      return "A passport check was withdrawn"
    case "Revoked":
      return "Passport withdrawn"
    case "PartnershipCreated":
      return `Named as operator of partnership #${row.args.id}`
    case "Funded":
      return `Funded ${stable(row.args.amount)} into partnership #${row.args.id}`
    case "FunderClaimed":
      return `Claimed ${stable(row.args.amount)} from partnership #${row.args.id}`
    case "OperatorClaimed":
      return `Claimed ${stable(row.args.amount)} as operator of partnership #${row.args.id}`
    default:
      return row.name
  }
}

const when = (row: ActivityRow) =>
  row.timestamp
    ? new Date(row.timestamp * 1000).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      })
    : `Block ${row.block.toLocaleString("en-GB")}`

const LABELS: Record<ActivityRow["source"], string> = {
  pool: "Pool",
  desk: "Partnerships",
  registry: "Passport"
}

export default function ActivityHistory() {
  const { address } = useAccount()
  const client = usePublicClient()
  const [result, setResult] = useState<ActivityResult | null>(null)
  const [state, setState] = useState<"idle" | "loading" | "ready" | "failed">("idle")

  useEffect(() => {
    let cancelled = false
    setResult(null)
    if (!client || !address || !poolAddress) {
      setState("idle")
      return
    }
    setState("loading")
    readActivity(client as never, address as Address)
      .then(value => {
        if (cancelled) return
        setResult(value)
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
    <Panel title="Your history">
      {state === "idle" ? (
        <p className="py-2 text-[14px] leading-[1.6] tracking-[-0.01em] text-haze">
          Connect a wallet to see everything it has done: deposits, draws, repayments, liquidations, partnerships and
          passport changes, in one list.
        </p>
      ) : state === "loading" ? (
        <p className="py-2 text-[14px] tracking-[-0.01em] text-haze">Reading…</p>
      ) : state === "failed" ? (
        <p className="py-2 text-[14px] leading-[1.6] tracking-[-0.01em] text-haze">
          Neither the index nor the node would return this wallet&rsquo;s history. Nothing else on this screen depends
          on it.
        </p>
      ) : !result || result.rows.length === 0 ? (
        <p className="py-2 text-[14px] leading-[1.6] tracking-[-0.01em] text-haze">
          Nothing here yet. This wallet has not deposited, borrowed or funded anything.
        </p>
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-line">
            {result.rows.map(row => {
              const url = explorerTxUrl(row.txHash)
              return (
                <li key={`${row.txHash}-${row.logIndex}`} className="flex items-start gap-3.5 py-3.5">
                  <span className="mt-0.5 shrink-0 rounded-full border border-line px-2 py-0.5 text-[11px] tracking-[-0.01em] text-haze">
                    {LABELS[row.source]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold leading-[1.5] tracking-[-0.01em] text-fog">{describe(row)}</p>
                    <p className="mt-0.5 text-[12px] tracking-[-0.02em] text-haze">{when(row)}</p>
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
          {/* Where the rows came from. Worth saying, because the two paths differ in
              what they can show: the chain has no block timestamps behind it here. */}
          <p className="mt-3 text-[12px] tracking-[-0.02em] text-haze">
            {result.from === "index"
              ? "Read from the Safix index."
              : "Read straight from the chain. Dates need the index; block numbers are shown instead."}
          </p>
        </>
      )}
    </Panel>
  )
}
