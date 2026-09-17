"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"
import type { Address } from "viem"
import { useAccount, useReadContract, useReadContracts, useWaitForTransactionReceipt, useWriteContract } from "wagmi"
import { TokenHandle, WalletOffer } from "@/components/AddToWallet"
import LiquidationHistory from "@/components/LiquidationHistory"
import { TxToast } from "@/components/TxToast"
import {
  AmountField,
  AssetMark,
  Field,
  GhostButton,
  HealthBadge,
  HealthBar,
  IN_PROGRESS,
  NotDeployed,
  PageHeader,
  Panel,
  PrimaryButton,
  QuickAmounts,
  Reason,
  SummaryRow,
  Usdg,
  UsdgMark
} from "@/components/ui"
import { track, type AnalyticsEvent } from "@/lib/analytics"
import { activeChain } from "@/lib/chain"
import { price, tokenAmount, usd } from "@/lib/format"
import { humanError } from "@/lib/errors"
import { useVisibleInterval } from "@/lib/polling"
import { priceAgeLine, priceFreshness, priceVerdict, reconcileFreshness } from "@/lib/price"
import { dropToLiquidation, healthStateOf, liquidationPrice1e18, priceToNumber } from "@/lib/risk"
import { useRecordSubmission } from "@/lib/submitted"
import {
  erc20Abi,
  erc8056Abi,
  floorTo,
  fromUsdgUnits,
  hasDeployment,
  deploymentLabel,
  collateralAssets,
  poolAddress,
  safixPoolAbi,
  uiTokenAmount,
  usdgAddress,
  usdgUnits
} from "@/lib/safix"
import { wasOffered } from "@/lib/wallet-assets"

const tokenUnits = (value: number) => BigInt(Math.round(value * 1e6)) * 10n ** 12n

function RiskPanel({
  collateralValue,
  debt,
  health,
  liqThresholdBps,
  currentPrice,
  priceLine,
  priceIsStale,
  liquidationPrice,
  symbol
}: {
  collateralValue: number
  debt: number
  health: number
  liqThresholdBps: number
  currentPrice: number
  /** How old this price is, in words, beside the number it qualifies. */
  priceLine: string
  priceIsStale: boolean
  liquidationPrice: number
  symbol?: string
}) {
  const hasDebt = debt > 0
  const drop = dropToLiquidation(currentPrice, liquidationPrice)

  return (
    <Panel title="Position">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <HealthBadge health={health} liqThresholdBps={liqThresholdBps} hasDebt={hasDebt} />
          <HealthBar ratio={health} liqThresholdBps={liqThresholdBps} hasDebt={hasDebt} />
        </div>
        <div className="flex flex-col divide-y divide-line border-y border-line">
          <SummaryRow label="Collateral value" value={usd(collateralValue)} />
          <SummaryRow label="Debt" value={usd(debt)} />
          <SummaryRow
            label={`${symbol ?? "Asset"} price now`}
            value={
              <span className="inline-flex flex-wrap items-baseline justify-end gap-x-2">
                <span>{price(currentPrice)}</span>
                <span className={`text-[12px] tracking-[-0.02em] ${priceIsStale ? "text-amber" : "text-haze"}`}>
                  {priceLine}
                </span>
              </span>
            }
          />
          <SummaryRow
            label="Liquidation price"
            value={hasDebt ? price(liquidationPrice) : "No debt drawn"}
          />
          {hasDebt ? (
            <SummaryRow
              label="Room before liquidation"
              value={`${(drop * 100).toFixed(1)}% price drop`}
            />
          ) : null}
        </div>
      </div>
    </Panel>
  )
}

function LiveBorrow() {
  const { address } = useAccount()
  const [assetIndex, setAssetIndex] = useState(0)
  const [lockAmount, setLockAmount] = useState("")
  const [drawAmount, setDrawAmount] = useState("")
  const [repayAmount, setRepayAmount] = useState("")
  const [acceptedRisk, setAcceptedRisk] = useState(false)
  // The token to offer the wallet once the transaction now in flight confirms,
  // and the offer itself while it is on screen.
  const pendingOffer = useRef<Address | undefined>(undefined)
  const [offer, setOffer] = useState<Address | undefined>(undefined)

  const asset = collateralAssets[assetIndex]

  const poolReads = useReadContracts({
    contracts: [
      { chainId: activeChain.id, abi: safixPoolAbi, address: poolAddress, functionName: "assetConfig", args: asset ? [asset.address] : undefined },
      { chainId: activeChain.id, abi: safixPoolAbi, address: poolAddress, functionName: "currentPrice", args: asset ? [asset.address] : undefined },
      { chainId: activeChain.id, abi: safixPoolAbi, address: poolAddress, functionName: "availableLiquidity" },
      { chainId: activeChain.id, abi: safixPoolAbi, address: poolAddress, functionName: "originationFeeBps" },
      { chainId: activeChain.id, abi: safixPoolAbi, address: poolAddress, functionName: "redemptionFeeBps" },
      // The age this asset's price may reach, and whether the pool will act on the
      // one it holds. Both are absent on an older pool, where the reads fail and
      // the screen quotes the age without claiming a limit or a refusal.
      { chainId: activeChain.id, abi: safixPoolAbi, address: poolAddress, functionName: "priceGuards", args: asset ? [asset.address] : undefined },
      { chainId: activeChain.id, abi: safixPoolAbi, address: poolAddress, functionName: "priceStatus", args: asset ? [asset.address] : undefined }
    ],
    query: { enabled: Boolean(asset) }
  })

  // A price ages while somebody reads the screen, so the age is recomputed and the
  // pool's verdict re-read on the same interval every other screen refreshes on.
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useVisibleInterval(() => {
    setNow(Math.floor(Date.now() / 1000))
    poolReads.refetch()
  })

  const walletReads = useReadContracts({
    contracts: [
      { chainId: activeChain.id, abi: safixPoolAbi, address: poolAddress, functionName: "positions", args: address && asset ? [address, asset.address] : undefined },
      { chainId: activeChain.id, abi: erc20Abi, address: asset?.address, functionName: "balanceOf", args: address ? [address] : undefined },
      { chainId: activeChain.id, abi: erc20Abi, address: asset?.address, functionName: "allowance", args: address && poolAddress ? [address, poolAddress] : undefined },
      { chainId: activeChain.id, abi: erc20Abi, address: usdgAddress, functionName: "allowance", args: address && poolAddress ? [address, poolAddress] : undefined },
      { chainId: activeChain.id, abi: erc20Abi, address: usdgAddress, functionName: "balanceOf", args: address ? [address] : undefined }
    ],
    query: { enabled: Boolean(address && asset) }
  })

  const uiMultiplier = useReadContract({
    chainId: activeChain.id,
    abi: erc8056Abi,
    address: asset?.address,
    functionName: "uiMultiplier",
    query: { enabled: Boolean(asset), retry: false }
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
      if (pendingStep.current) track(pendingStep.current, { asset: asset?.symbol })
      pendingStep.current = undefined
      const token = pendingOffer.current
      pendingOffer.current = undefined
      if (token && !wasOffered(token)) setOffer(token)
      poolReads.refetch()
      walletReads.refetch()
      setLockAmount("")
      setDrawAmount("")
      setRepayAmount("")
    }
  }, [receipt.isSuccess])

  const busy = isPending || (Boolean(txHash) && receipt.isLoading)

  const config = poolReads.data?.[0]?.result as readonly [boolean, number, number, bigint] | undefined
  const priceResult = poolReads.data?.[1]?.result as readonly [bigint, bigint] | undefined
  const availableLiquidity = (poolReads.data?.[2]?.result as bigint | undefined) ?? 0n
  const feeBps = BigInt((poolReads.data?.[3]?.result as number | undefined) ?? 50)
  const redeemBps = BigInt((poolReads.data?.[4]?.result as number | undefined) ?? 30)

  const guard = poolReads.data?.[5]?.result as readonly [bigint, number, bigint, bigint] | undefined
  const priceStatus = poolReads.data?.[6]?.result as readonly [number, bigint, bigint] | undefined

  const maxLtvBps = config?.[1] ?? 0
  const liqThresholdBps = config?.[2] ?? 9000
  const price1e18 = priceResult?.[0] ?? 0n

  // Read from the chain, never repeated here: the guards differ per asset and
  // change on chain. Absent means the pool has no age limit for this asset.
  const maxPriceAge = guard ? Number(guard[0]) : null
  const statusCode = priceStatus ? Number(priceStatus[0]) : null
  // The pool's own answer decides what is refused; this clock only says how old,
  // and the line never contradicts the refusal beside it.
  const freshness = reconcileFreshness(priceFreshness(Number(priceResult?.[1] ?? 0n), maxPriceAge, now), statusCode)
  const priceLine = priceAgeLine(freshness)
  const verdict = priceVerdict(statusCode)

  const position = walletReads.data?.[0]?.result as readonly [bigint, bigint, bigint] | undefined
  const collateral = position?.[0] ?? 0n
  const debt = position?.[1] ?? 0n
  const totalDrawn = position?.[2] ?? 0n
  const tokenBalance = (walletReads.data?.[1]?.result as bigint | undefined) ?? 0n
  const tokenAllowance = (walletReads.data?.[2]?.result as bigint | undefined) ?? 0n
  const usdgAllowance = (walletReads.data?.[3]?.result as bigint | undefined) ?? 0n
  const usdgBalance = (walletReads.data?.[4]?.result as bigint | undefined) ?? 0n

  const lockedValue = (collateral * price1e18) / 10n ** 30n
  const capacity = (lockedValue * BigInt(maxLtvBps)) / 10_000n
  const headroom = capacity > debt ? capacity - debt : 0n
  const closeOwed = debt + (totalDrawn * redeemBps) / 10_000n
  const hasPosition = collateral > 0n || debt > 0n

  const lockUnits = useMemo(() => {
    const parsed = Number.parseFloat(lockAmount)
    return Number.isFinite(parsed) && parsed > 0 ? tokenUnits(parsed) : 0n
  }, [lockAmount])

  const drawUnits = useMemo(() => {
    const parsed = Number.parseFloat(drawAmount)
    return Number.isFinite(parsed) && parsed > 0 ? usdgUnits(parsed) : 0n
  }, [drawAmount])

  const repayUnits = useMemo(() => {
    const parsed = Number.parseFloat(repayAmount)
    return Number.isFinite(parsed) && parsed > 0 ? usdgUnits(parsed) : 0n
  }, [repayAmount])

  // Three things cap a draw: the asset's own LTV, the origination fee that rides
  // on top of whatever is drawn, and the idle liquidity in the pool. The fee is
  // folded into the collateral ceiling because it is charged on the amount, so
  // what is left to compare is collateral against liquidity.
  const maxDrawByCapacity = (headroom * 10_000n) / (10_000n + feeBps)
  const maxDraw = maxDrawByCapacity < availableLiquidity ? maxDrawByCapacity : availableLiquidity
  const limitedByLiquidity = maxDrawByCapacity > availableLiquidity
  const binding: "collateral" | "liquidity" | "none" =
    maxDraw === 0n ? "none" : limitedByLiquidity ? "liquidity" : "collateral"

  const fee = (drawUnits * feeBps) / 10_000n
  const redemptionOnDraw = (drawUnits * redeemBps) / 10_000n
  const debtAfter = debt + drawUnits + fee
  const overCapacity = drawUnits > 0n && debtAfter > capacity
  const overLiquidity = drawUnits > availableLiquidity

  const healthNow = debt > 0n ? Number((lockedValue * 100n) / debt) / 100 : 0
  const healthAfter = debtAfter > 0n ? Number((lockedValue * 100n) / debtAfter) / 100 : 0
  const stateAfter = healthStateOf(healthAfter, liqThresholdBps, debtAfter > 0n)
  const needsAcknowledgement = drawUnits > 0n && (stateAfter === "atRisk" || stateAfter === "liquidatable")

  const currentPriceValue = priceToNumber(price1e18)
  const liqNow = priceToNumber(liquidationPrice1e18(debt, collateral, liqThresholdBps))
  const liqAfter = priceToNumber(liquidationPrice1e18(debtAfter, collateral, liqThresholdBps))

  const needsLockApproval = lockUnits > 0n && tokenAllowance < lockUnits
  // What the pool will actually pull for this repayment. The redemption fee is
  // charged on the principal the repayment retires, so it is more than the amount
  // typed, and an approval for the amount alone leaves the transfer short. The
  // pool is asked rather than the arithmetic repeated here. A pool too old to
  // answer charges no fee on a repayment, and the amount is the whole of it.
  const owedRead = useReadContract({
    chainId: activeChain.id,
    abi: safixPoolAbi,
    address: poolAddress,
    functionName: "repaymentOwed",
    args: address && asset && repayUnits > 0n ? [address, asset.address, repayUnits] : undefined,
    query: { enabled: Boolean(address && asset) && repayUnits > 0n }
  })
  const owed = owedRead.data as readonly [bigint, bigint] | undefined
  // What the repayment settles. The pool takes the whole debt rather than leave
  // less than a minimum position behind, so an amount typed just under that line
  // settles more than it says, and the screen has to say so before the signature.
  const repayRetired = owed?.[0] ?? repayUnits
  const repayFee = owed?.[1] ?? 0n
  const repayOwed = repayRetired + repayFee

  const needsRepayApproval = repayOwed > 0n && usdgAllowance < repayOwed
  const needsCloseApproval = closeOwed > 0n && usdgAllowance < closeOwed

  const lock = () => {
    if (!asset || !poolAddress || lockUnits === 0n) return
    if (needsLockApproval) {
      writeContract({ chainId: activeChain.id, abi: erc20Abi, address: asset.address, functionName: "approve", args: [poolAddress, lockUnits] })
    } else {
      track("lock_started", { asset: asset.symbol })
      pendingStep.current = "lock_signed"
      writeContract({ chainId: activeChain.id, abi: safixPoolAbi, address: poolAddress, functionName: "lockCollateral", args: [asset.address, lockUnits] })
    }
  }

  const draw = () => {
    if (!asset || !poolAddress || drawUnits === 0n) return
    if (!verdict.usable || overCapacity || overLiquidity || (needsAcknowledgement && !acceptedRisk)) {
      // A refusal is a step too: it is the one that says why the funnel ends.
      track("draw_blocked", {
        asset: asset.symbol,
        reason: !verdict.usable
          ? "price"
          : overCapacity
            ? "capacity"
            : overLiquidity
              ? "liquidity"
              : "unacknowledged"
      })
      return
    }
    track("draw_started", { asset: asset.symbol })
    pendingStep.current = "draw_signed"
    // A draw is the moment USDG first reaches most wallets, and most wallets
    // will not show it until they are handed the address.
    pendingOffer.current = usdgAddress
    writeContract({ chainId: activeChain.id, abi: safixPoolAbi, address: poolAddress, functionName: "draw", args: [asset.address, drawUnits] })
  }

  const repay = () => {
    if (!asset || !poolAddress || !usdgAddress || repayUnits === 0n) return
    if (needsRepayApproval) {
      writeContract({ chainId: activeChain.id, abi: erc20Abi, address: usdgAddress, functionName: "approve", args: [poolAddress, repayOwed] })
    } else {
      pendingStep.current = "repay_signed"
      writeContract({ chainId: activeChain.id, abi: safixPoolAbi, address: poolAddress, functionName: "repay", args: [asset.address, repayUnits] })
    }
  }

  const closeOut = () => {
    if (!asset || !poolAddress || !usdgAddress || !hasPosition) return
    if (needsCloseApproval) {
      writeContract({ chainId: activeChain.id, abi: erc20Abi, address: usdgAddress, functionName: "approve", args: [poolAddress, closeOwed] })
    } else {
      pendingStep.current = "close_signed"
      writeContract({ chainId: activeChain.id, abi: safixPoolAbi, address: poolAddress, functionName: "closePosition", args: [asset.address] })
    }
  }

  const mintTestAsset = () => {
    if (!asset || !address) return
    pendingOffer.current = asset.address
    writeContract({ chainId: activeChain.id, abi: erc20Abi, address: asset.address, functionName: "mint", args: [address, 10n * 10n ** 18n] })
  }

  const offeredAsset = offer ? collateralAssets.find(candidate => candidate.address === offer) : undefined
  const dismissOffer = () => setOffer(undefined)

  const drawBlockedReason = verdict.label
    ? verdict.label
    : overCapacity
    ? "Above what this collateral supports"
    : overLiquidity
      ? "More than the pool has available"
      : needsAcknowledgement && !acceptedRisk
        ? "Acknowledge the liquidation risk first"
        : null

  // What each panel says when its action is unavailable. The draw refusal is
  // already the draw button's own label, so it is not said twice.
  const symbol = asset?.symbol ?? "collateral"
  const lockReasonId = useId()
  const lockQuickId = useId()
  const drawReasonId = useId()
  const drawCeilingId = useId()
  const repayReasonId = useId()
  const repayQuickId = useId()
  const lockReason = !address
    ? "Connect a wallet to lock collateral."
    : busy
      ? IN_PROGRESS
      : lockUnits === 0n
        ? `Enter an amount of ${symbol} to lock.`
        : null
  const lockQuickReason = tokenBalance > 0n ? null : !address ? lockReason : `This wallet holds no ${symbol} to lock.`
  // A price the pool will not act on refuses the draw for everyone, wallet or not,
  // so its explanation comes first.
  const drawReason = !verdict.usable
    ? verdict.note
    : !address
      ? "Connect a wallet to draw."
      : busy
      ? IN_PROGRESS
      : drawBlockedReason
        ? null
        : drawUnits === 0n
          ? "Enter an amount to draw."
          : null
  const repayReason = !address
    ? "Connect a wallet to repay."
    : busy
      ? IN_PROGRESS
      : repayUnits === 0n
        ? debt === 0n
          ? "There is no debt to repay."
          : "Enter an amount to repay."
        : null
  const repayQuickReason = debt > 0n ? null : !address ? repayReason : "There is no debt to repay."

  return (
    <div className="flex flex-col gap-4">
      <TxToast
        hash={txHash}
        isPending={isPending}
        isConfirming={receipt.isLoading && Boolean(txHash)}
        isSuccess={receipt.isSuccess}
        error={error}
      />

      <div className="grid items-start gap-4 lg:grid-cols-[1.1fr_1fr] [&>*]:min-w-0">
        <div className="flex flex-col gap-4">
          <Panel title="Collateral">
            <ul className="flex flex-col gap-2.5">
              {collateralAssets.map((candidate, index) => (
                <li key={candidate.address}>
                  <button
                    aria-label={`Select ${candidate.symbol} as collateral`}
                    aria-pressed={index === assetIndex}
                    onClick={() => setAssetIndex(index)}
                    className={`flex w-full items-center justify-between gap-3 rounded-[3px] border px-4 py-3.5 text-left transition-colors ${
                      index === assetIndex ? "border-mint bg-carbon/60" : "border-control bg-carbon/30 hover:border-mint"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <AssetMark symbol={candidate.symbol} className="h-9 w-9" />
                      <span className="min-w-0">
                        <span className="block text-[14.5px] font-semibold tracking-[-0.01em] text-fog">
                          {candidate.symbol}
                        </span>
                        <span className="mt-0.5 block truncate text-[12px] tracking-[-0.02em] text-haze">
                          {candidate.name} · {candidate.kind}
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            <div className="mt-5 flex flex-col gap-3 border-t border-line pt-5">
              <div className="flex items-baseline justify-between text-[13px] tracking-[-0.01em]">
                <span className="text-haze">Locked</span>
                <span className="text-mist">
                  {tokenAmount(uiTokenAmount(collateral, uiMultiplier.data))} {asset?.symbol}
                </span>
              </div>
              <div className="flex items-baseline justify-between text-[13px] tracking-[-0.01em]">
                <span className="text-haze">In wallet</span>
                <span className="text-mist">
                  {tokenAmount(uiTokenAmount(tokenBalance, uiMultiplier.data))} {asset?.symbol}
                </span>
              </div>
              {asset ? <TokenHandle address={asset.address} symbol={asset.symbol} /> : null}
              <Field
                inputMode="decimal"
                aria-label={`Amount of ${asset?.symbol ?? "collateral"} to lock`}
                placeholder={`Amount of ${asset?.symbol ?? ""} to lock`}
                value={lockAmount}
                onChange={event => setLockAmount(event.target.value)}
              />
              <QuickAmounts
                label={`${asset?.symbol ?? "collateral"} to lock`}
                onPick={fraction => setLockAmount(tokenAmount(uiTokenAmount(tokenBalance) * fraction))}
                disabled={tokenBalance === 0n}
                describedBy={
                  lockQuickReason === null ? undefined : lockQuickReason === lockReason ? lockReasonId : lockQuickId
                }
              />
              <Reason id={lockQuickId}>{lockQuickReason !== lockReason ? lockQuickReason : null}</Reason>
              <PrimaryButton
                disabled={lockUnits === 0n || busy || !address}
                aria-describedby={lockReason ? lockReasonId : undefined}
                onClick={lock}
                className="w-full"
              >
                {busy ? "Confirming…" : needsLockApproval ? `Approve ${asset?.symbol}` : "Lock collateral"}
              </PrimaryButton>
              <Reason id={lockReasonId}>{lockReason}</Reason>
              <GhostButton
                size="sm"
                onClick={mintTestAsset}
                disabled={busy || !address}
                aria-describedby={busy || !address ? lockReasonId : undefined}
              >
                Mint 10 test {asset?.symbol}
              </GhostButton>
              {offeredAsset ? (
                <WalletOffer
                  address={offeredAsset.address}
                  symbol={offeredAsset.symbol}
                  // The line above already shows the selected asset's address;
                  // only a token minted and then deselected needs its own.
                  showAddress={offeredAsset.address !== asset?.address}
                  onDone={dismissOffer}
                />
              ) : null}
            </div>
          </Panel>

          <RiskPanel
            collateralValue={fromUsdgUnits(lockedValue)}
            debt={fromUsdgUnits(debt)}
            health={healthNow}
            liqThresholdBps={liqThresholdBps}
            currentPrice={currentPriceValue}
            priceLine={priceLine}
            priceIsStale={!verdict.usable}
            liquidationPrice={liqNow}
            symbol={asset?.symbol}
          />

          <LiquidationHistory />
        </div>

        <div className="flex flex-col gap-4">
          <Panel title={<><UsdgMark className="h-[18px] w-[18px]" />Draw USDG</>}>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2.5 rounded-[3px] border border-line bg-carbon/30 p-3.5">
                <div className="flex items-baseline justify-between text-[13.5px] tracking-[-0.01em]">
                  <span className="text-fog">Available to draw</span>
                  <span className="font-semibold text-fog [font-variant-numeric:tabular-nums]">
                    {usd(floorTo(fromUsdgUnits(maxDraw), 2))}
                  </span>
                </div>
                <div className="flex items-baseline justify-between text-[12.5px] tracking-[-0.02em]">
                  <span className={binding === "collateral" ? "text-mist" : "text-haze"}>
                    Your collateral, capped at {Number(maxLtvBps) / 100}% LTV
                  </span>
                  <span className="text-haze [font-variant-numeric:tabular-nums]">
                    {usd(floorTo(fromUsdgUnits(maxDrawByCapacity), 2))}
                  </span>
                </div>
                <div className="flex items-baseline justify-between text-[12.5px] tracking-[-0.02em]">
                  <span className={binding === "liquidity" ? "text-mist" : "text-haze"}>
                    Idle in the pool
                  </span>
                  <span className="text-haze [font-variant-numeric:tabular-nums]">
                    {usd(fromUsdgUnits(availableLiquidity))}
                  </span>
                </div>
                <div className="flex items-baseline justify-between text-[12.5px] tracking-[-0.02em]">
                  <span className="text-haze">{asset?.symbol ?? "Asset"} price</span>
                  <span className={`[font-variant-numeric:tabular-nums] ${verdict.usable ? "text-haze" : "text-amber"}`}>
                    {price(currentPriceValue)} · {priceLine}
                  </span>
                </div>
                <p id={drawCeilingId} className="text-[12px] leading-[1.5] tracking-[-0.02em] text-haze">
                  {binding === "liquidity"
                    ? "The pool is the tighter of the two right now, so that is the ceiling."
                    : binding === "collateral"
                      ? "Your collateral is the tighter of the two, so that is the ceiling. Lock more to raise it."
                      : collateral === 0n
                        ? "Lock collateral above to open a line of credit."
                        : maxDrawByCapacity === 0n
                          ? "This collateral is already drawn to its limit. Repay, or lock more, to draw again."
                          : "The pool has no idle liquidity right now, so nothing can be drawn until providers deposit or borrowers repay."}
                </p>
              </div>
              <AmountField
                inputMode="decimal"
                aria-label="Amount of USDG to draw"
                placeholder="0.00"
                value={drawAmount}
                onChange={event => {
                  setDrawAmount(event.target.value)
                  setAcceptedRisk(false)
                }}
              />
              <QuickAmounts
                label="USDG to draw"
                onPick={fraction => {
                  setDrawAmount(floorTo(fromUsdgUnits(maxDraw) * fraction, 2).toFixed(2))
                  setAcceptedRisk(false)
                }}
                disabled={maxDraw === 0n}
                describedBy={drawCeilingId}
              />

              <div className="flex flex-col divide-y divide-line border-y border-line">
                <SummaryRow
                  label={`One-time fee now (${Number(feeBps) / 100}%)`}
                  value={usd(fromUsdgUnits(fee))}
                />
                <SummaryRow
                  label={`Redemption fee at close (${Number(redeemBps) / 100}%)`}
                  value={usd(fromUsdgUnits(redemptionOnDraw))}
                />
                <SummaryRow label="Interest" value="None, ever" />
                <SummaryRow label="Debt after draw" value={usd(fromUsdgUnits(debtAfter))} />
                <SummaryRow
                  label="Liquidation price after"
                  value={debtAfter > 0n ? price(liqAfter) : "No debt"}
                />
                <div className="flex items-center justify-between gap-4 py-2.5 text-[13.5px] tracking-[-0.01em]">
                  <span className="text-haze">Health after</span>
                  {debtAfter > 0n ? (
                    <HealthBadge health={healthAfter} liqThresholdBps={liqThresholdBps} hasDebt />
                  ) : (
                    <span className="text-haze">–</span>
                  )}
                </div>
              </div>

              {needsAcknowledgement ? (
                <label className="flex cursor-pointer items-start gap-2.5 rounded-[3px] border border-amber/60 bg-carbon/40 p-3 text-[12.5px] leading-[1.5] tracking-[-0.01em] text-mist">
                  <input
                    type="checkbox"
                    checked={acceptedRisk}
                    onChange={event => setAcceptedRisk(event.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-mint"
                  />
                  <span>
                    This draw leaves the position close to liquidation. A {(dropToLiquidation(currentPriceValue, liqAfter) * 100).toFixed(1)}%
                    fall in {asset?.symbol} would allow it to be liquidated. I understand the risk.
                  </span>
                </label>
              ) : null}

              <PrimaryButton
                disabled={drawUnits === 0n || Boolean(drawBlockedReason) || busy || !address}
                aria-describedby={drawReason ? drawReasonId : undefined}
                onClick={draw}
                className="w-full"
              >
                {busy ? "Confirming…" : drawBlockedReason ?? <span className="inline-flex items-center gap-1.5">Draw <Usdg /></span>}
              </PrimaryButton>
              <Reason id={drawReasonId}>{drawReason}</Reason>
              {usdgAddress && offer === usdgAddress ? (
                <WalletOffer address={usdgAddress} symbol="USDG" onDone={dismissOffer} />
              ) : null}
            </div>
          </Panel>

          <Panel title="Repay and close">
            <div className="flex flex-col gap-4">
              <div className="flex items-baseline justify-between text-[12.5px] tracking-[-0.02em] text-haze">
                <span>Wallet balance</span>
                <span className="text-mist">{usd(fromUsdgUnits(usdgBalance))}</span>
              </div>
              <AmountField
                inputMode="decimal"
                aria-label="Amount of USDG to repay"
                placeholder="0.00"
                value={repayAmount}
                onChange={event => setRepayAmount(event.target.value)}
              />
              <QuickAmounts
                label="USDG to repay"
                onPick={fraction => setRepayAmount((fromUsdgUnits(debt) * fraction).toFixed(2))}
                disabled={debt === 0n}
                describedBy={
                  repayQuickReason === null ? undefined : repayQuickReason === repayReason ? repayReasonId : repayQuickId
                }
              />
              <Reason id={repayQuickId}>{repayQuickReason !== repayReason ? repayQuickReason : null}</Reason>
              <PrimaryButton
                disabled={repayUnits === 0n || busy || !address}
                aria-describedby={repayReason ? repayReasonId : undefined}
                onClick={repay}
                className="w-full"
              >
                {busy ? "Confirming…" : needsRepayApproval ? <span className="inline-flex items-center gap-1.5">Approve <Usdg /></span> : "Repay"}
              </PrimaryButton>
              <Reason id={repayReasonId}>{repayReason}</Reason>

              {repayOwed > repayUnits ? (
                <div className="flex flex-col gap-2 border-t border-line pt-4">
                  {repayRetired > repayUnits ? (
                    <SummaryRow
                      label="Settles the whole debt"
                      value={usd(fromUsdgUnits(repayRetired))}
                    />
                  ) : null}
                  {repayFee > 0n ? (
                    <SummaryRow label={`Redemption fee (${Number(redeemBps) / 100}%)`} value={usd(fromUsdgUnits(repayFee))} />
                  ) : null}
                  <SummaryRow label="Total taken from the wallet" value={usd(fromUsdgUnits(repayOwed))} />
                </div>
              ) : null}

              {hasPosition ? (
                <div className="flex flex-col gap-2 border-t border-line pt-4">
                  <SummaryRow label={`Redemption fee (${Number(redeemBps) / 100}%)`} value={usd(fromUsdgUnits(closeOwed - debt))} />
                  <SummaryRow label="Total to close" value={usd(fromUsdgUnits(closeOwed))} />
                  <GhostButton
                    size="sm"
                    onClick={closeOut}
                    disabled={busy || !address}
                    aria-describedby={busy || !address ? repayReasonId : undefined}
                  >
                    {needsCloseApproval ? `Approve ${usd(fromUsdgUnits(closeOwed))}` : "Close position and unlock collateral"}
                  </GhostButton>
                </div>
              ) : null}

              <p className="text-center text-[12.5px] tracking-[-0.02em] text-haze">
                {error ? humanError(error) : "No time-based cost. Repay whenever you choose."}
              </p>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}

export default function BorrowPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Borrow"
        lead="Lock a tokenized asset, draw USDG, pay one fee at the door. The debt you see at draw is the debt you repay."
        badge={deploymentLabel}
      />
      {hasDeployment && collateralAssets.length > 0 ? (
        <LiveBorrow />
      ) : (
        <NotDeployed chainName={activeChain.name} />
      )}
    </div>
  )
}
