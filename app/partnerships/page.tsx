"use client"

import { useEffect, useRef, useState } from "react"
import { useAccount, usePublicClient, useWaitForTransactionReceipt, useWriteContract } from "wagmi"
import { AmountField, ConfirmedLink, PageHeader, Panel, PrimaryButton } from "@/components/ui"
import { activeChain } from "@/lib/chain"
import { usd } from "@/lib/demo"
import { reportReadFailure, reportReadSuccess } from "@/lib/health"
import { useVisibleInterval } from "@/lib/polling"
import { TxToast } from "@/components/TxToast"
import { humanError } from "@/lib/errors"
import { reportError } from "@/lib/monitoring"
import { deskAbi, deskAddress, erc20Abi, fromUsdgUnits, usdgAddress, usdgUnits } from "@/lib/safix"

const statusLabels = ["Funding", "Active", "Settled", "Cancelled"] as const

type PartnershipRow = {
  id: number
  operator: string
  shareBps: number
  deadline: number
  status: number
  goal: number
  funded: number
  returned: number
  payout: number
  contribution: number
}

const shortAddress = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`

function StatusPill({ status }: { status: number }) {
  const label = statusLabels[status] ?? "Unknown"
  return (
    <span
      className={`rounded-[3px] border px-3 py-1 text-[12px] tracking-[-0.01em] ${
        status === 1
          ? "border-mint text-mint"
          : status === 2
            ? "border-line text-fog"
            : "border-line text-haze"
      }`}
    >
      {label}
    </span>
  )
}

function LivePartnerships() {
  const { address } = useAccount()
  // Reads are pinned to the chain Safix runs on, not to whatever chain the
  // wallet happens to sit on. The wallet's chain matters for signing; it must
  // never decide which contracts get read, or a wallet on another network sees
  // an empty pool instead of the real one.
  const client = usePublicClient({ chainId: activeChain.id })
  // The periodic refresh runs only while the tab is on screen; see
  // useVisibleInterval. `load` is held in a ref so the interval survives the
  // effect being torn down and rebuilt on every account change.
  const refresh = useRef<(() => void) | undefined>(undefined)
  useVisibleInterval(() => refresh.current?.())
  const [rows, setRows] = useState<PartnershipRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [amounts, setAmounts] = useState<Record<number, string>>({})

  const { writeContract, data: txHash, isPending, error } = useWriteContract()
  const receipt = useWaitForTransactionReceipt({ hash: txHash })
  const busy = isPending || (Boolean(txHash) && receipt.isLoading)

  // `payout` and `contribution` are read for one account. The rest of a row is
  // public, so only the account-specific figures are dropped on a switch: the
  // list stays put while the new wallet's numbers are fetched.
  useEffect(() => {
    setRows(current => current.map(row => ({ ...row, payout: 0, contribution: 0 })))
  }, [address])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const desk = deskAddress
      if (!client || !desk) return
      const count = Number(
        await client.readContract({ abi: deskAbi, address: desk, functionName: "partnershipCount" })
      )
      const ids = Array.from({ length: count }, (_, id) => id)
      // Once the count is known, the rest of the screen is one round: the terms,
      // this wallet's payout and its contribution for every partnership, asked
      // together so multicall can fold them into a single call.
      const [reads, payouts, contributions] = await Promise.all([
        Promise.all(
          ids.map(id =>
            client.readContract({ abi: deskAbi, address: desk, functionName: "partnerships", args: [BigInt(id)] })
          )
        ),
        address
          ? Promise.all(
              ids.map(id =>
                client.readContract({
                  abi: deskAbi,
                  address: desk,
                  functionName: "funderPayoutOf",
                  args: [BigInt(id), address]
                })
              )
            )
          : Promise.resolve(ids.map(() => 0n)),
        address
          ? Promise.all(
              ids.map(id =>
                client.readContract({
                  abi: deskAbi,
                  address: desk,
                  functionName: "contributions",
                  args: [BigInt(id), address]
                })
              )
            )
          : Promise.resolve(ids.map(() => 0n))
      ])
      if (cancelled) return
      setRows(
        ids.map(id => ({
          id,
          operator: reads[id][0],
          shareBps: Number(reads[id][1]),
          deadline: Number(reads[id][2]),
          status: Number(reads[id][3]),
          goal: fromUsdgUnits(reads[id][4]),
          funded: fromUsdgUnits(reads[id][5]),
          returned: fromUsdgUnits(reads[id][6]),
          payout: fromUsdgUnits(payouts[id]),
          contribution: fromUsdgUnits(contributions[id])
        }))
      )
      setLoaded(true)
      reportReadSuccess()
    }
    // A read that throws here would otherwise leave the screen loading for
    // ever, with nothing saying why. The failure is both recorded and shown.
    const run = () =>
      load().catch(error => {
        reportError(error, { screen: "partnerships" })
        reportReadFailure()
      })
    run()
    refresh.current = run
    return () => {
      cancelled = true
      refresh.current = undefined
    }
  }, [client, address, receipt.isSuccess])

  const fund = async (row: PartnershipRow) => {
    const desk = deskAddress
    const usdg = usdgAddress
    if (!desk || !usdg || !address || !client) return
    const parsed = Number.parseFloat(amounts[row.id] ?? "")
    if (!Number.isFinite(parsed) || parsed <= 0) return
    const units = usdgUnits(parsed)
    const allowance = await client.readContract({
      abi: erc20Abi,
      address: usdg,
      functionName: "allowance",
      args: [address, desk]
    })
    if (allowance < units) {
      writeContract({ chainId: activeChain.id, abi: erc20Abi, address: usdg, functionName: "approve", args: [desk, units] })
    } else {
      writeContract({ chainId: activeChain.id, abi: deskAbi, address: desk, functionName: "fund", args: [BigInt(row.id), units] })
    }
  }

  const claim = (row: PartnershipRow) => {
    if (!deskAddress) return
    writeContract({ chainId: activeChain.id, abi: deskAbi, address: deskAddress, functionName: "claim", args: [BigInt(row.id)] })
  }

  return (
    <div className="flex flex-col gap-4">
      <TxToast
        hash={txHash}
        isPending={isPending}
        isConfirming={receipt.isLoading && Boolean(txHash)}
        isSuccess={receipt.isSuccess}
        error={error}
      />
      {rows.length === 0 ? (
        <Panel title="Open partnerships">
          <p className="py-2 text-[14px] tracking-[-0.01em] text-haze">
            {loaded ? "No partnerships created yet." : "Loading partnerships…"}
          </p>
        </Panel>
      ) : (
        rows.map(row => (
          <Panel key={row.id} title={`Partnership #${row.id}`}>
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <StatusPill status={row.status} />
                  <span className="text-[13px] tracking-[-0.01em] text-haze">
                    Operator {shortAddress(row.operator)} · keeps {(row.shareBps / 100).toFixed(0)}% of profit
                  </span>
                </div>
                <span className="text-[13px] tracking-[-0.01em] text-haze">
                  Returned {usd(row.returned)}
                </span>
              </div>

              <div>
                <div className="flex items-baseline justify-between text-[13px] tracking-[-0.01em]">
                  <span className="text-haze">Funded</span>
                  <span className="text-mist">
                    {usd(row.funded)} / {usd(row.goal)}
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label={`Funding progress for partnership ${row.id}`}
                  aria-valuenow={Math.round(Math.min(100, (row.funded / row.goal) * 100))}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="mt-2 h-1.5 w-full overflow-hidden rounded-none bg-line"
                >
                  <div
                    className="h-full rounded-none bg-mint"
                    style={{ width: `${Math.min(100, (row.funded / row.goal) * 100)}%` }}
                  />
                </div>
              </div>

              {row.status === 0 ? (
                <div className="flex flex-col gap-2.5 sm:flex-row">
                  <AmountField
                    inputMode="decimal"
                    aria-label={`Amount of USDG to fund partnership ${row.id}`}
                    placeholder="0.00"
                    value={amounts[row.id] ?? ""}
                    onChange={event => setAmounts(current => ({ ...current, [row.id]: event.target.value }))}
                  />
                  <PrimaryButton
                    disabled={busy || !address}
                    onClick={() => fund(row)}
                    className="shrink-0"
                    aria-label={`Fund partnership ${row.id}`}
                  >
                    Fund
                  </PrimaryButton>
                </div>
              ) : null}

              {(row.status === 2 || row.status === 3) && row.payout > 0 ? (
                <PrimaryButton disabled={busy || !address} onClick={() => claim(row)} className="w-fit">
                  Claim {usd(row.payout)}
                </PrimaryButton>
              ) : null}

              {row.contribution > 0 ? (
                <p className="text-[12.5px] tracking-[-0.02em] text-haze">
                  Your contribution: {usd(row.contribution)}
                </p>
              ) : null}
            </div>
          </Panel>
        ))
      )}
      <p className="text-center text-[12.5px] tracking-[-0.02em] text-haze">
        {error ? humanError(error) : receipt.isSuccess ? <ConfirmedLink hash={txHash} /> : ""}
      </p>
    </div>
  )
}

function DemoPartnerships() {
  const demo = [
    {
      id: 0,
      operator: "0x7c41…e09b",
      share: 40,
      status: 1,
      goal: 100000,
      funded: 100000,
      returned: 36500,
      note: "Working capital for a tokenized invoice book. Profit split 60/40 in favor of capital."
    },
    {
      id: 1,
      operator: "0x2fa8…11cd",
      share: 35,
      status: 0,
      goal: 250000,
      funded: 84000,
      returned: 0,
      note: "Inventory financing against tokenized gold. Funding open."
    }
  ]

  return (
    <div className="flex flex-col gap-4">
      {demo.map(row => (
        <Panel key={row.id} title={`Partnership #${row.id}`}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <StatusPill status={row.status} />
                <span className="text-[13px] tracking-[-0.01em] text-haze">
                  Operator {row.operator} · keeps {row.share}% of profit
                </span>
              </div>
              <span className="text-[13px] tracking-[-0.01em] text-haze">Returned {usd(row.returned)}</span>
            </div>
            <div>
              <div className="flex items-baseline justify-between text-[13px] tracking-[-0.01em]">
                <span className="text-haze">Funded</span>
                <span className="text-mist">
                  {usd(row.funded)} / {usd(row.goal)}
                </span>
              </div>
              <div
                role="progressbar"
                aria-label={`Funding progress for partnership ${row.id}`}
                aria-valuenow={Math.round(Math.min(100, (row.funded / row.goal) * 100))}
                aria-valuemin={0}
                aria-valuemax={100}
                className="mt-2 h-1.5 w-full overflow-hidden rounded-none bg-line"
              >
                <div
                  className="h-full rounded-none bg-mint"
                  style={{ width: `${Math.min(100, (row.funded / row.goal) * 100)}%` }}
                />
              </div>
            </div>
            <p className="text-[13.5px] leading-[1.6] tracking-[-0.01em] text-mist">{row.note}</p>
          </div>
        </Panel>
      ))}
      <p className="text-center text-[12.5px] tracking-[-0.02em] text-haze">
        Demo mode: no partnership desk contract configured yet.
      </p>
    </div>
  )
}

export default function PartnershipsPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Partnerships"
        lead="For financing tied to a business, the pool acts as a partner instead of a creditor. Profit splits at a pre-agreed ratio; genuine losses fall on the capital."
        badge={deskAddress ? "Live onchain" : "Demo data"}
      />
      {deskAddress ? <LivePartnerships /> : <DemoPartnerships />}
    </div>
  )
}
