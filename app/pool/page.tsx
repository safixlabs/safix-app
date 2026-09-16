"use client"

import { useEffect, useId, useRef, useState } from "react"
import { useAccount, useReadContract, useReadContracts, useWaitForTransactionReceipt, useWriteContract } from "wagmi"
import { TokenHandle, WalletOffer } from "@/components/AddToWallet"
import {
  AmountField,
  AssetMark,
  ConfirmedLink,
  GhostButton,
  IN_PROGRESS,
  Meter,
  PageHeader,
  Panel,
  PrimaryButton,
  QuickAmounts,
  Reason,
  Segmented,
  Stat,
  SummaryRow,
  Usdg,
  UsdgMark
} from "@/components/ui"
import { track, type AnalyticsEvent } from "@/lib/analytics"
import { activeChain } from "@/lib/chain"
import { tokenAmount, usd } from "@/lib/demo"
import { TxToast } from "@/components/TxToast"
import { humanError } from "@/lib/errors"
import { useRecordSubmission } from "@/lib/submitted"
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
import { wasOffered } from "@/lib/wallet-assets"

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
        value={usd(poolSize)}
        hint="Deposited by liquidity providers"
      />
      <div className="rounded-[4px] border border-line bg-panel/80 p-5">
        <p className="text-[12.5px] tracking-[-0.02em] text-haze">Deployed to loans</p>
        <p className="mt-2 text-[24px] font-bold leading-none tracking-[-0.01em] text-fog md:text-[27px]">
          {usd(deployed)}
        </p>
        <div className="mt-4">
          <Meter
            value={utilisation}
            name="Share of the pool deployed to loans"
            label={`${(utilisation * 100).toFixed(1)}% utilised · ${usd(available)} idle`}
          />
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
  reason,
  note
}: {
  rows: GainRow[]
  onClaim: () => void
  /** Why claiming is unavailable, other than there being nothing to claim. */
  reason: string | null
  note: string
}) {
  const claimable = rows.filter(row => row.amount > 0)
  const emptyId = useId()
  const noteId = useId()
  // An empty list already says there is nothing to claim, so that sentence is the reason.
  const describedBy = reason ? noteId : claimable.length === 0 ? emptyId : undefined

  return (
    <Panel title="Claimable gains">
      {claimable.length === 0 ? (
        <p id={emptyId} className="py-2 text-[14px] leading-[1.6] tracking-[-0.01em] text-haze">
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
              <p className="text-[14px] tracking-[-0.01em] text-mist">
                {tokenAmount(row.amount)}
              </p>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-5 flex flex-col gap-3">
        <PrimaryButton
          onClick={onClaim}
          disabled={Boolean(reason) || claimable.length === 0}
          aria-describedby={describedBy}
          className="w-full"
        >
          Claim all
        </PrimaryButton>
        <p id={noteId} className="text-center text-[12.5px] tracking-[-0.02em] text-haze">
          {reason ?? note}
        </p>
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
  reason,
  quickReason,
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
  /** Why the action is unavailable. The action is enabled only when there is none. */
  reason: string | null
  /** Why the quick amounts are unavailable, when they are. */
  quickReason: string | null
  note: React.ReactNode
  /** Further controls, handed the id of the reason line so they can point at it. */
  extra?: (reasonId: string) => React.ReactNode
}) {
  const reasonId = useId()
  const quickId = useId()
  const parsed = Number.parseFloat(amount)
  const value = Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  const ceiling = mode === "deposit" ? walletBalance : yourDeposit
  const depositAfter = mode === "deposit" ? yourDeposit + value : Math.max(0, yourDeposit - value)
  const poolAfter = mode === "deposit" ? poolSize + value : Math.max(0, poolSize - value)
  const shareAfter = poolAfter > 0 ? depositAfter / poolAfter : 0

  return (
    <Panel title={<><UsdgMark className="h-[18px] w-[18px]" />Manage liquidity</>}>
      <div className="flex flex-col gap-4">
        <Segmented options={modeOptions} value={mode} onChange={setMode} label="Deposit or withdraw" />

        <div className="flex items-baseline justify-between text-[12.5px] tracking-[-0.02em] text-haze">
          <span>{mode === "deposit" ? "Wallet balance" : "Available to withdraw"}</span>
          <span className="text-mist">{usd(ceiling)}</span>
        </div>

        <AmountField
          inputMode="decimal"
          aria-label={mode === "deposit" ? "Amount of USDG to deposit" : "Amount of USDG to withdraw"}
          placeholder="0.00"
          value={amount}
          onChange={event => setAmount(event.target.value)}
        />
        <QuickAmounts
          label={mode === "deposit" ? "USDG to deposit" : "USDG to withdraw"}
          onPick={fraction => setAmount((ceiling * fraction).toFixed(2))}
          disabled={ceiling <= 0}
          describedBy={quickReason === null ? undefined : quickReason === reason ? reasonId : quickId}
        />
        <Reason id={quickId}>{quickReason !== reason ? quickReason : null}</Reason>

        <div className="flex flex-col divide-y divide-line border-y border-line">
          <SummaryRow label="Your deposit after" value={usd(depositAfter)} />
          <SummaryRow label="Share of pool after" value={`${(shareAfter * 100).toFixed(2)}%`} />
        </div>

        <PrimaryButton
          onClick={onSubmit}
          disabled={Boolean(reason)}
          aria-describedby={reason ? reasonId : undefined}
          className="w-full"
        >
          {actionLabel}
        </PrimaryButton>
        <Reason id={reasonId}>{reason}</Reason>
        {extra?.(reasonId)}
        <p className="text-center text-[12.5px] tracking-[-0.02em] text-haze">{note}</p>
      </div>
    </Panel>
  )
}

function LivePool() {
  const { address } = useAccount()
  const [mode, setMode] = useState<Mode>("deposit")
  const [amount, setAmount] = useState("")
  // Whether the transaction now in flight is one that puts USDG into the
  // wallet, and whether the offer to list it there is on screen.
  const pendingOffer = useRef(false)
  const [offer, setOffer] = useState(false)

  // Every read below is pinned to the chain Safix runs on. The wallet's chain
  // decides what it can sign, never which contracts get read: a wallet sitting
  // on another network must still see the real pool, not an empty one.
  const totals = useReadContracts({
    contracts: [
      { chainId: activeChain.id, abi: safixPoolAbi, address: poolAddress, functionName: "totalDeposits" },
      { chainId: activeChain.id, abi: safixPoolAbi, address: poolAddress, functionName: "availableLiquidity" }
    ]
  })
  const personal = useReadContracts({
    contracts: [
      { chainId: activeChain.id, abi: safixPoolAbi, address: poolAddress, functionName: "compoundedDepositOf", args: address ? [address] : undefined },
      { chainId: activeChain.id, abi: erc20Abi, address: usdgAddress, functionName: "balanceOf", args: address ? [address] : undefined },
      { chainId: activeChain.id, abi: erc20Abi, address: usdgAddress, functionName: "allowance", args: address && poolAddress ? [address, poolAddress] : undefined }
    ],
    query: { enabled: Boolean(address) }
  })
  const gains = useReadContracts({
    contracts: liveAssets.map(asset => ({
      chainId: activeChain.id,
      abi: safixPoolAbi,
      address: poolAddress,
      functionName: "gainOf" as const,
      args: address ? [address, asset.address] : undefined
    })),
    query: { enabled: Boolean(address) && liveAssets.length > 0 }
  })

  const { writeContract, data: txHash, isPending, error: writeError, variables } = useWriteContract()
  const receipt = useWaitForTransactionReceipt({ hash: txHash })
  // The wallet can accept a transaction that then reverts in its block. That
  // failure arrives on the receipt, and is as much a failure as a refused call.
  const error = writeError ?? receipt.error
  useRecordSubmission(txHash, variables, address)
  // The step to record if the transaction now in flight confirms.
  const pendingStep = useRef<AnalyticsEvent | undefined>(undefined)

  useEffect(() => {
    if (receipt.isSuccess) {
      if (pendingStep.current) track(pendingStep.current)
      pendingStep.current = undefined
      if (pendingOffer.current && usdgAddress && !wasOffered(usdgAddress)) setOffer(true)
      pendingOffer.current = false
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
        writeContract({ chainId: activeChain.id, abi: erc20Abi, address: usdgAddress, functionName: "approve", args: [poolAddress, units] })
      } else {
        track("deposit_started")
        pendingStep.current = "deposit_signed"
        writeContract({ chainId: activeChain.id, abi: safixPoolAbi, address: poolAddress, functionName: "deposit", args: [units] })
      }
    } else {
      track("withdraw_started")
      pendingStep.current = "withdraw_signed"
      writeContract({ chainId: activeChain.id, abi: safixPoolAbi, address: poolAddress, functionName: "withdraw", args: [units] })
    }
  }

  const claim = () => {
    if (!poolAddress || liveAssets.length === 0) return
    writeContract({
      chainId: activeChain.id,
      abi: safixPoolAbi,
      address: poolAddress,
      functionName: "claimGains",
      args: [liveAssets.map(asset => asset.address)]
    })
  }

  const mintTestUsdg = () => {
    if (!usdgAddress || !address) return
    pendingOffer.current = true
    writeContract({ chainId: activeChain.id, abi: erc20Abi, address: usdgAddress, functionName: "mint", args: [address, 10_000n * 10n ** 6n] })
  }

  const status = error ? (
    humanError(error)
  ) : receipt.isSuccess ? (
    <ConfirmedLink hash={txHash} />
  ) : address ? (
    "Withdraw any time outside active liquidations."
  ) : null

  const ceiling = mode === "deposit" ? walletBalance : yourDeposit
  const reason = !address
    ? "Connect a wallet to provide liquidity."
    : busy
      ? IN_PROGRESS
      : units === 0n
        ? `Enter an amount to ${mode}.`
        : null
  const quickReason =
    ceiling > 0
      ? null
      : !address
        ? reason
        : mode === "deposit"
          ? "This wallet holds no USDG to deposit."
          : "Nothing is deposited to withdraw."

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
      <div className="grid items-start gap-4 lg:grid-cols-[1.05fr_1fr] [&>*]:min-w-0">
        <LiquidityCard
          mode={mode}
          setMode={setMode}
          amount={amount}
          setAmount={setAmount}
          walletBalance={walletBalance}
          yourDeposit={yourDeposit}
          poolSize={poolSize}
          reason={reason}
          quickReason={quickReason}
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
          extra={reasonId => (
            <>
              <GhostButton
                size="sm"
                onClick={mintTestUsdg}
                disabled={busy || !address}
                aria-describedby={busy || !address ? reasonId : undefined}
              >
                <span className="inline-flex items-center gap-1.5">Mint 10,000 test <Usdg /></span>
              </GhostButton>
              {usdgAddress ? <TokenHandle address={usdgAddress} symbol="USDG" /> : null}
              {offer && usdgAddress ? (
                <WalletOffer address={usdgAddress} symbol="USDG" showAddress={false} onDone={() => setOffer(false)} />
              ) : null}
            </>
          )}
        />
        <div className="flex flex-col gap-4">
          <GainsCard
            rows={gainRows}
            onClaim={claim}
            reason={!address ? "Connect a wallet to see your gains." : busy ? IN_PROGRESS : null}
            note="Gains accrue per asset and never expire."
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
      <div className="grid items-start gap-4 lg:grid-cols-[1.05fr_1fr] [&>*]:min-w-0">
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
          reason={Number.parseFloat(amount) > 0 ? null : `Enter an amount to ${mode}.`}
          quickReason={null}
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
            reason={null}
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
