"use client"

import { explorerTxUrl } from "@/lib/chain"
import { usd } from "@/lib/demo"
import type { HistoryRow as ActivityRow } from "@/lib/history"
import { deskAddress, fromTokenUnits, fromUsdgUnits, liveAssets, poolAddress, usdgAddress } from "@/lib/safix"
import type { SubmissionStatus, SubmittedRow } from "@/lib/submitted"
import { useWalletHistory } from "@/lib/wallet-history"
import { Panel } from "./ui"

const same = (a?: string | null, b?: string | null) => Boolean(a && b && a.toLowerCase() === b.toLowerCase())

const symbolFor = (asset: string | null | undefined) =>
  asset
    ? (liveAssets.find(candidate => same(candidate.address, asset))?.symbol ?? "collateral")
    : "collateral"

const tokenSymbol = (token: string) => (same(token, usdgAddress) ? "USDG" : symbolFor(token))

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

/**
 * One line per transaction sent from this browser, said as what was asked for.
 * Whether it happened is the status beside it, read from the receipt.
 */
function describeSubmission(row: SubmittedRow): string {
  const [first, second] = row.args
  switch (row.functionName) {
    case "approve":
      return `Approve ${tokenSymbol(row.to)} for ${same(first, deskAddress) ? "the partnership desk" : "the pool"}`
    case "mint":
      return `Mint test ${tokenSymbol(row.to)}`
    case "deposit":
      return `Deposit ${stable(first)} into the pool`
    case "withdraw":
      return `Withdraw ${stable(first)} from the pool`
    case "claimGains":
      return "Claim liquidation gains"
    case "lockCollateral":
      return `Lock ${token(second)} ${symbolFor(first)} as collateral`
    case "withdrawCollateral":
      return `Withdraw ${token(second)} ${symbolFor(first)} of collateral`
    case "draw":
      return `Draw ${stable(second)} against ${symbolFor(first)}`
    case "repay":
      return `Repay ${stable(second)} of ${symbolFor(first)} debt`
    case "closePosition":
      return `Close the ${symbolFor(first)} position`
    case "fund":
      return `Fund ${stable(second)} into partnership #${first}`
    case "claim":
      return `Claim from partnership #${first}`
    default:
      return row.functionName
  }
}

const STATUS: Record<SubmissionStatus, string> = {
  pending: "Not confirmed yet",
  confirmed: "Confirmed",
  reverted: "Failed onchain"
}

const dateOf = (seconds: number) =>
  new Date(seconds * 1000).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  })

const when = (timestamp: number | null, block: number) =>
  timestamp ? dateOf(timestamp) : `Block ${block.toLocaleString("en-GB")}`

const LABELS: Record<ActivityRow["source"] | "token", string> = {
  pool: "Pool",
  desk: "Partnerships",
  registry: "Passport",
  token: "Token"
}

type Entry = {
  key: string
  label: string
  text: string
  detail: string
  txHash: `0x${string}`
  /** Null while unconfirmed, which sorts it above everything that has landed. */
  block: number | null
  logIndex: number
}

const byNewest = (a: Entry, b: Entry) => {
  if (a.block === null || b.block === null) return a.block === b.block ? 0 : a.block === null ? -1 : 1
  return b.block === a.block ? b.logIndex - a.logIndex : b.block - a.block
}

function entriesOf(rows: ActivityRow[], submitted: SubmittedRow[]): Entry[] {
  const logged = new Set(rows.map(row => row.txHash.toLowerCase()))
  const fromLogs = rows.map(row => ({
    key: `${row.txHash}-${row.logIndex}`,
    label: LABELS[row.source],
    text: describe(row),
    detail: when(row.timestamp, row.block),
    txHash: row.txHash,
    block: row.block,
    logIndex: row.logIndex
  }))
  // A confirmed transaction whose events are already listed is said once, by its events.
  const fromSubmissions = submitted
    .filter(row => !(row.status === "confirmed" && logged.has(row.hash.toLowerCase())))
    .map(row => ({
      key: row.hash,
      label: LABELS[same(row.to, deskAddress) ? "desk" : same(row.to, poolAddress) ? "pool" : "token"],
      text: describeSubmission(row),
      detail: `${row.block === null ? `Sent ${dateOf(row.submittedAt / 1000)}` : when(row.timestamp, row.block)} · ${STATUS[row.status]}`,
      txHash: row.hash,
      block: row.block,
      logIndex: -1
    }))
  return [...fromLogs, ...fromSubmissions].sort(byNewest)
}

export default function ActivityHistory() {
  const { result, state } = useWalletHistory("activity", { withSubmitted: true })
  const entries = result ? entriesOf(result.rows, result.submitted) : []
  const listsSubmissions = entries.some(entry => entry.logIndex === -1)

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
      ) : !result || entries.length === 0 ? (
        <p className="py-2 text-[14px] leading-[1.6] tracking-[-0.01em] text-haze">
          Nothing here yet. This wallet has not deposited, borrowed or funded anything.
        </p>
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-line">
            {entries.map(entry => {
              const url = explorerTxUrl(entry.txHash)
              return (
                <li key={entry.key} className="flex items-start gap-3.5 py-3.5">
                  <span className="mt-0.5 shrink-0 rounded-full border border-line px-2 py-0.5 text-[11px] tracking-[-0.01em] text-haze">
                    {entry.label}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold leading-[1.5] tracking-[-0.01em] text-fog">{entry.text}</p>
                    <p className="mt-0.5 text-[12px] tracking-[-0.02em] text-haze">{entry.detail}</p>
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
              what they can show: only the index pages past the newest rows. */}
          <p className="mt-3 text-[12px] leading-[1.5] tracking-[-0.02em] text-haze">
            {result.from === "index" ? "Read from the Safix index." : "Read straight from the chain."}
            {listsSubmissions
              ? " Transactions that leave no event behind, such as approvals and ones that failed onchain, are listed from this browser by their hash and checked against the chain."
              : ""}
          </p>
        </>
      )}
    </Panel>
  )
}
