"use client"

import { useEffect, useRef, useState } from "react"
import { useAccount, useReadContract, useReadContracts, useWaitForTransactionReceipt, useWriteContract } from "wagmi"
import {
  AmountField,
  AssetMark,
  ConfirmedLink,
  Meter,
  PageHeader,
  Panel,
  PrimaryButton,
  QuickAmounts,
  Segmented,
  Stat,
  SummaryRow,
  Usdg,
  UsdgMark
} from "@/components/ui"
import { track, type AnalyticsEvent } from "@/lib/analytics"
import { usd } from "@/lib/demo"
import { TxToast } from "@/components/TxToast"
import { humanError } from "@/lib/errors"
import {
  erc20Abi,
  fromTokenUnits,
  fromUsdgUnits,
  isLive,
  liveAssets,
  poolAddress,
  safixPoolAbi,
  usdgAddress,
  usdgUnits
} from "@/lib/safix"

type Mode = "deposit" | "withdraw"
type GainRow = { symbol: string; amount: number }

const modeOptions = [
  { value: "deposit" as Mode, label: "Deposit" },
  { value: "withdraw" as Mode, label: "Withdraw" }
]

function PoolStats({
  poolSize,
  available,
  yourDeposit,
  connected
}: {
  poolSize: number
  available: number
  yourDeposit: number
  connected: boolean
}) {
  const deployed = Math.max(0, poolSize - available)
  const utilisation = poolSize > 0 ? deployed / poolSize : 0
  const share = poolSize > 0 ? yourDeposit / poolSize : 0

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Stat
        label={<><UsdgMark className="h-3.5 w-3.5" />Pool size</>}
        value={usd(poolSize, 0)}
        hint="Deposited by liquidity providers"
      />
      <div className="rounded-[4px] border border-line bg-panel/80 p-5">
        <p className="text-[12.5px] tracking-[-0.02em] text-haze">Deployed to loans</p>
        <p className="mt-2 text-[24px] font-bold leading-none tracking-[-0.01em] text-fog [font-variant-numeric:tabular-nums] md:text-[27px]">
          {usd(deployed, 0)}
        </p>
        <div className="mt-4">
          <Meter value={utilisation} label={`${(utilisation * 100).toFixed(1)}% utilised · ${usd(available, 0)} idle`} />
        </div>
      </div>
      <Stat
        label="Your share"
        value={connected ? `${(share * 100).toFixed(2)}%` : "–"}
        hint={connected ? `${usd(yourDeposit)} of the pool` : "Connect a wallet"}
      />
    </div>
  )
}

function GainsCard({
  rows,
  onClaim,
  disabled,
  note
}: {
  rows: GainRow[]
  onClaim: () => void
  disabled: boolean
  note: string
}) {
  const claimable = rows.filter(row => row.amount > 0)

  return (
    <Panel title="Claimable gains">
      {claimable.length === 0 ? (
        <p className="py-2 text-[14px] leading-[1.6] tracking-[-0.01em] text-haze">
          No liquidation gains yet. When a position is liquidated, its collateral arrives here at a
          discount and can be claimed at any time.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {claimable.map(row => (
            <li key={row.symbol} className="flex items-center gap-3.5 py-3.5">
              <AssetMark symbol={row.symbol} className="h-9 w-9" />
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] font-semibold tracking-[-0.01em] text-fog">{row.symbol}</p>
                <p className="mt-0.5 text-[12px] tracking-[-0.02em] text-haze">Seized collateral</p>
              </div>
              <p className="text-[14px] tracking-[-0.01em] text-mist [font-variant-numeric:tabular-nums]">
                {row.amount.toFixed(4)}
              </p>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-5 flex flex-col gap-3">
        <PrimaryButton onClick={onClaim} disabled={disabled || claimable.length === 0} className="w-full">
          Claim all
        </PrimaryButton>
        <p className="text-center text-[12.5px] tracking-[-0.02em] text-haze">{note}</p>
      </div>
    </Panel>
  )
}

function EarnCard() {
  const points = [
    {
      title: "Liquidations",
      body: "When a position falls below its required level, the pool absorbs the debt and receives the collateral at a discount."
    },
    {
      title: "Protocol rewards",
      body: "Rewards are distributed to providers on top of liquidation gains once the token is live."
    },
    {
      title: "Never from time",
      body: "There is no rate and no yield from waiting. A quiet market is a quiet pool, and that is by design."
    }
  ]

  return (
    <Panel title="How the pool earns">
      <ul className="flex flex-col divide-y divide-line">
        {points.map(point => (
          <li key={point.title} className="py-3.5 first:pt-0 last:pb-0">
            <p className="text-[14px] font-semibold tracking-[-0.01em] text-fog">{point.title}</p>
            <p className="mt-1.5 text-[13.5px] leading-[1.6] tracking-[-0.01em] text-mist">{point.body}</p>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function LiquidityCard({
  mode,
  setMode,
  amount,
  setAmount,
  walletBalance,
  yourDeposit,
  poolSize,
  actionLabel,
  onSubmit,
  disabled,
  note,
  extra
}: {
  mode: Mode
  setMode: (next: Mode) => void
  amount: string
  setAmount: (next: string) => void
  walletBalance: number
  yourDeposit: number
  poolSize: number
  actionLabel: React.ReactNode
  onSubmit: () => void
  disabled: boolean
  note: React.ReactNode
  extra?: React.ReactNode
}) {
  const parsed = Number.parseFloat(amount)
  const value = Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  const ceiling = mode === "deposit" ? walletBalance : yourDeposit
  const depositAfter = mode === "deposit" ? yourDeposit + value : Math.max(0, yourDeposit - value)
  const poolAfter = mode === "deposit" ? poolSize + value : Math.max(0, poolSize - value)
  const shareAfter = poolAfter > 0 ? depositAfter / poolAfter : 0

  return (
    <Panel title={<><UsdgMark className="h-[18px] w-[18px]" />Manage liquidity</>}>
      <div className="flex flex-col gap-4">
        <Segmented options={modeOptions} value={mode} onChange={setMode} />

        <div className="flex items-baseline justify-between text-[12.5px] tracking-[-0.02em] text-haze">
          <span>{mode === "deposit" ? "Wallet balance" : "Available to withdraw"}</span>
          <span className="[font-variant-numeric:tabular-nums] text-mist">{usd(ceiling)}</span>
        </div>

        <AmountField
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={event => setAmount(event.target.value)}
        />
        <QuickAmounts onPick={fraction => setAmount((ceiling * fraction).toFixed(2))} disabled={ceiling <= 0} />

        <div className="flex flex-col divide-y divide-line border-y border-line">
          <SummaryRow label="Your deposit after" value={usd(depositAfter)} />
          <SummaryRow label="Share of pool after" value={`${(shareAfter * 100).toFixed(2)}%`} />
        </div>

        <PrimaryButton onClick={onSubmit} disabled={disabled} className="w-full">
          {actionLabel}
        </PrimaryButton>
        {extra}
        <p className="text-center text-[12.5px] tracking-[-0.02em] text-haze">{note}</p>
      </div>
    </Panel>
  )
}

function LivePool() {
  const { address } = useAccount()
  const [mode, setMode] = useState<Mode>("deposit")
  const [amount, setAmount] = useState("")

  const totals = useReadContracts({
    contracts: [
      { abi: safixPoolAbi, address: poolAddress, functionName: "totalDeposits" },
      { abi: safixPoolAbi, address: poolAddress, functionName: "availableLiquidity" }
    ]
  })
  const personal = useReadContracts({
    contracts: [
      { abi: safixPoolAbi, address: poolAddress, functionName: "compoundedDepositOf", args: address ? [address] : undefined },
      { abi: erc20Abi, address: usdgAddress, functionName: "balanceOf", args: address ? [address] : undefined },
      { abi: erc20Abi, address: usdgAddress, functionName: "allowance", args: address && poolAddress ? [address, poolAddress] : undefined }
    ],
    query: { enabled: Boolean(address) }
  })
  const gains = useReadContracts({
    contracts: liveAssets.map(asset => ({
      abi: safixPoolAbi,
      address: poolAddress,
      functionName: "gainOf" as const,
      args: address ? [address, asset.address] : undefined
    })),
    query: { enabled: Boolean(address) && liveAssets.length > 0 }
  })

  const { writeContract, data: txHash, isPending, error } = useWriteContract()
  const receipt = useWaitForTransactionReceipt({ hash: txHash })
  // The step to record if the transaction now in flight confirms.
  const pendingStep = useRef<AnalyticsEvent | undefined>(undefined)

  useEffect(() => {
    if (receipt.isSuccess) {
      if (pendingStep.current) track(pendingStep.current)
      pendingStep.current = undefined
      totals.refetch()
      personal.refetch()
      gains.refetch()
      setAmount("")
    }
  }, [receipt.isSuccess])

  const poolSize = fromUsdgUnits((totals.data?.[0]?.result as bigint | undefined) ?? 0n)
  const available = fromUsdgUnits((totals.data?.[1]?.result as bigint | undefined) ?? 0n)
  const yourDeposit = fromUsdgUnits((personal.data?.[0]?.result as bigint | undefined) ?? 0n)
  const walletBalance = fromUsdgUnits((personal.data?.[1]?.result as bigint | undefined) ?? 0n)
  const allowance = (personal.data?.[2]?.result as bigint | undefined) ?? 0n

  const gainRows: GainRow[] = liveAssets.map((asset, index) => ({
    symbol: asset.symbol,
    amount: fromTokenUnits((gains.data?.[index]?.result as bigint | undefined) ?? 0n)
  }))

  const parsed = Number.parseFloat(amount)
  const units = Number.isFinite(parsed) && parsed > 0 ? usdgUnits(parsed) : 0n
  const needsApproval = mode === "deposit" && units > 0n && allowance < units
  const busy = isPending || (Boolean(txHash) && receipt.isLoading)

  const submit = () => {
    if (!poolAddress || !usdgAddress || units === 0n) return
    if (mode === "deposit") {
      if (needsApproval) {
        writeContract({ abi: erc20Abi, address: usdgAddress, functionName: "approve", args: [poolAddress, units] })
      } else {
        track("deposit_started")
        pendingStep.current = "deposit_signed"
        writeContract({ abi: safixPoolAbi, address: poolAddress, functionName: "deposit", args: [units] })
      }
    } else {
      track("withdraw_started")
      pendingStep.current = "withdraw_signed"
      writeContract({ abi: safixPoolAbi, address: poolAddress, functionName: "withdraw", args: [units] })
    }
  }

  const claim = () => {
    if (!poolAddress || liveAssets.length === 0) return
    writeContract({
      abi: safixPoolAbi,
      address: poolAddress,
      functionName: "claimGains",
      args: [liveAssets.map(asset => asset.address)]
    })
  }

  const mintTestUsdg = () => {
    if (!usdgAddress || !address) return
    writeContract({ abi: erc20Abi, address: usdgAddress, functionName: "mint", args: [address, 10_000n * 10n ** 6n] })
  }

  const status = error ? (
    humanError(error)
  ) : receipt.isSuccess ? (
    <ConfirmedLink hash={txHash} />
  ) : address ? (
    "Withdraw any time outside active liquidations."
  ) : (
    "Connect a wallet to provide liquidity."
  )

  return (
    <>
      <TxToast
        hash={txHash}
        isPending={isPending}
        isConfirming={receipt.isLoading && Boolean(txHash)}
        isSuccess={receipt.isSuccess}
        error={error}
      />
      <PoolStats poolSize={poolSize} available={available} yourDeposit={yourDeposit} connected={Boolean(address)} />
      <div className="grid items-start gap-4 lg:grid-cols-[1.05fr_1fr]">
        <LiquidityCard
          mode={mode}
          setMode={setMode}
          amount={amount}
          setAmount={setAmount}
          walletBalance={walletBalance}
          yourDeposit={yourDeposit}
          poolSize={poolSize}
          disabled={units === 0n || busy || !address}
          onSubmit={submit}
          actionLabel={
            busy ? (
              "Confirming…"
            ) : mode === "withdraw" ? (
              "Withdraw"
            ) : needsApproval ? (
              <span className="inline-flex items-center gap-1.5">Approve <Usdg /></span>
            ) : (
              "Deposit"
            )
          }
          note={status}
          extra={
            <button
              onClick={mintTestUsdg}
              disabled={busy || !address}
              className="rounded-[3px] border border-line px-5 py-2 text-[12.5px] font-medium tracking-[-0.01em] text-haze transition-colors hover:border-mint hover:text-mint disabled:opacity-50"
            >
              <span className="inline-flex items-center gap-1.5">Mint 10,000 test <Usdg /></span>
            </button>
          }
        />
        <div className="flex flex-col gap-4">
          <GainsCard
            rows={gainRows}
            onClaim={claim}
            disabled={busy || !address}
            note={address ? "Gains accrue per asset and never expire." : "Connect a wallet to see your gains."}
          />
          <EarnCard />
        </div>
      </div>
    </>
  )
}

function DemoPool() {
  const [mode, setMode] = useState<Mode>("deposit")
  const [amount, setAmount] = useState("")
  const [submitted, setSubmitted] = useState(false)

  const poolSize = 2_412_000
  const available = 903_400
  const yourDeposit = 5_000
  const walletBalance = 12_400
  const gainRows: GainRow[] = [
    { symbol: "tBILL", amount: 1.482 },
    { symbol: "bNVDA", amount: 0.3125 },
    { symbol: "tGOLD", amount: 0.0164 }
  ]

  return (
    <>
      <PoolStats poolSize={poolSize} available={available} yourDeposit={yourDeposit} connected />
      <div className="grid items-start gap-4 lg:grid-cols-[1.05fr_1fr]">
        <LiquidityCard
          mode={mode}
          setMode={next => {
            setMode(next)
            setSubmitted(false)
          }}
          amount={amount}
          setAmount={next => {
            setAmount(next)
            setSubmitted(false)
          }}
          walletBalance={walletBalance}
          yourDeposit={yourDeposit}
          poolSize={poolSize}
          disabled={!(Number.parseFloat(amount) > 0)}
          onSubmit={() => setSubmitted(true)}
          actionLabel={mode === "deposit" ? "Deposit" : "Withdraw"}
          note={
            submitted
              ? "Demo action recorded. Set the contract addresses to go live."
              : "Demo mode: no pool contract configured yet."
          }
        />
        <div className="flex flex-col gap-4">
          <GainsCard
            rows={gainRows}
            onClaim={() => setSubmitted(true)}
            disabled={false}
            note="Demo balances from three liquidations."
          />
          <EarnCard />
        </div>
      </div>
    </>
  )
}

export default function PoolPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Stability pool"
        lead="The pool funds every draw and absorbs every liquidation. Providers earn from real events, liquidation gains and protocol rewards, never from time."
        badge={isLive ? "Live onchain" : "Demo data"}
      />
      {isLive ? <LivePool /> : <DemoPool />}
    </div>
  )
}
