"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useAccount, useReadContract, useReadContracts, useWaitForTransactionReceipt, useWriteContract } from "wagmi"
import LiquidationHistory from "@/components/LiquidationHistory"
import { TxToast } from "@/components/TxToast"
import {
  AmountField,
  AssetMark,
  Field,
  HealthBadge,
  HealthBar,
  PageHeader,
  Panel,
  PrimaryButton,
  QuickAmounts,
  SummaryRow,
  Usdg,
  UsdgMark
} from "@/components/ui"
import { track, type AnalyticsEvent } from "@/lib/analytics"
import { activeChain } from "@/lib/chain"
import { collateralAssets, originationFeeRate, redemptionFeeRate, usd } from "@/lib/demo"
import { humanError } from "@/lib/errors"
import { dropToLiquidation, healthStateOf, liquidationPrice1e18, priceToNumber } from "@/lib/risk"
import {
  erc20Abi,
  erc8056Abi,
  floorTo,
  fromUsdgUnits,
  isLive,
  liveAssets,
  poolAddress,
  safixPoolAbi,
  uiTokenAmount,
  usdgAddress,
  usdgUnits
} from "@/lib/safix"

const tokenUnits = (value: number) => BigInt(Math.round(value * 1e6)) * 10n ** 12n
const price = (value: number) => usd(value, value >= 100 ? 2 : 4)

function RiskPanel({
  collateralValue,
  debt,
  health,
  liqThresholdBps,
  currentPrice,
  liquidationPrice,
  symbol
}: {
  collateralValue: number
  debt: number
  health: number
  liqThresholdBps: number
  currentPrice: number
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
          <SummaryRow label={`${symbol ?? "Asset"} price now`} value={price(currentPrice)} />
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

  const asset = liveAssets[assetIndex]

  const poolReads = useReadContracts({
    contracts: [
      { chainId: activeChain.id, abi: safixPoolAbi, address: poolAddress, functionName: "assetConfig", args: asset ? [asset.address] : undefined },
      { chainId: activeChain.id, abi: safixPoolAbi, address: poolAddress, functionName: "currentPrice", args: asset ? [asset.address] : undefined },
      { chainId: activeChain.id, abi: safixPoolAbi, address: poolAddress, functionName: "availableLiquidity" },
      { chainId: activeChain.id, abi: safixPoolAbi, address: poolAddress, functionName: "originationFeeBps" },
      { chainId: activeChain.id, abi: safixPoolAbi, address: poolAddress, functionName: "redemptionFeeBps" }
    ],
    query: { enabled: Boolean(asset) }
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

  const { writeContract, data: txHash, isPending, error } = useWriteContract()
  const receipt = useWaitForTransactionReceipt({ hash: txHash })
  // The step to record if the transaction now in flight confirms.
  const pendingStep = useRef<AnalyticsEvent | undefined>(undefined)

  useEffect(() => {
    if (receipt.isSuccess) {
      if (pendingStep.current) track(pendingStep.current, { asset: asset?.symbol })
      pendingStep.current = undefined
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

  const maxLtvBps = config?.[1] ?? 0
  const liqThresholdBps = config?.[2] ?? 9000
  const price1e18 = priceResult?.[0] ?? 0n

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
  const needsRepayApproval = repayUnits > 0n && usdgAllowance < repayUnits
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
    if (overCapacity || overLiquidity || (needsAcknowledgement && !acceptedRisk)) {
      // A refusal is a step too: it is the one that says why the funnel ends.
      track("draw_blocked", {
        asset: asset.symbol,
        reason: overCapacity ? "capacity" : overLiquidity ? "liquidity" : "unacknowledged"
      })
      return
    }
    track("draw_started", { asset: asset.symbol })
    pendingStep.current = "draw_signed"
    writeContract({ chainId: activeChain.id, abi: safixPoolAbi, address: poolAddress, functionName: "draw", args: [asset.address, drawUnits] })
  }

  const repay = () => {
    if (!asset || !poolAddress || !usdgAddress || repayUnits === 0n) return
    if (needsRepayApproval) {
      writeContract({ chainId: activeChain.id, abi: erc20Abi, address: usdgAddress, functionName: "approve", args: [poolAddress, repayUnits] })
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
    writeContract({ chainId: activeChain.id, abi: erc20Abi, address: asset.address, functionName: "mint", args: [address, 10n * 10n ** 18n] })
  }

  const drawBlockedReason = overCapacity
    ? "Above what this collateral supports"
    : overLiquidity
      ? "More than the pool has available"
      : needsAcknowledgement && !acceptedRisk
        ? "Acknowledge the liquidation risk first"
        : null

  return (
    <div className="flex flex-col gap-4">
      <TxToast
        hash={txHash}
        isPending={isPending}
        isConfirming={receipt.isLoading && Boolean(txHash)}
        isSuccess={receipt.isSuccess}
        error={error}
      />

      <div className="grid items-start gap-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="flex flex-col gap-4">
          <Panel title="Collateral">
            <ul className="flex flex-col gap-2.5">
              {liveAssets.map((candidate, index) => (
                <li key={candidate.address}>
                  <button
                    aria-label={`Select ${candidate.symbol} as collateral`}
                    aria-pressed={index === assetIndex}
                    onClick={() => setAssetIndex(index)}
                    className={`flex w-full items-center justify-between gap-3 rounded-[3px] border px-4 py-3.5 text-left transition-colors ${
                      index === assetIndex ? "border-mint bg-carbon/60" : "border-line bg-carbon/30 hover:border-haze"
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
                <span className="text-mist [font-variant-numeric:tabular-nums]">
                  {uiTokenAmount(collateral, uiMultiplier.data).toFixed(4)} {asset?.symbol}
                </span>
              </div>
              <div className="flex items-baseline justify-between text-[13px] tracking-[-0.01em]">
                <span className="text-haze">In wallet</span>
                <span className="text-mist [font-variant-numeric:tabular-nums]">
                  {uiTokenAmount(tokenBalance, uiMultiplier.data).toFixed(4)} {asset?.symbol}
                </span>
              </div>
              <Field
                inputMode="decimal"
                placeholder={`Amount of ${asset?.symbol ?? ""} to lock`}
                value={lockAmount}
                onChange={event => setLockAmount(event.target.value)}
              />
              <QuickAmounts
                onPick={fraction => setLockAmount((uiTokenAmount(tokenBalance) * fraction).toFixed(4))}
                disabled={tokenBalance === 0n}
              />
              <PrimaryButton disabled={lockUnits === 0n || busy || !address} onClick={lock} className="w-full">
                {busy ? "Confirming…" : needsLockApproval ? `Approve ${asset?.symbol}` : "Lock collateral"}
              </PrimaryButton>
              <button
                onClick={mintTestAsset}
                disabled={busy || !address}
                className="rounded-[3px] border border-line px-5 py-2 text-[12.5px] font-medium tracking-[-0.01em] text-haze transition-colors hover:border-mint hover:text-mint disabled:opacity-50"
              >
                Mint 10 test {asset?.symbol}
              </button>
            </div>
          </Panel>

          <RiskPanel
            collateralValue={fromUsdgUnits(lockedValue)}
            debt={fromUsdgUnits(debt)}
            health={healthNow}
            liqThresholdBps={liqThresholdBps}
            currentPrice={currentPriceValue}
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
                <p className="text-[12px] leading-[1.5] tracking-[-0.02em] text-haze">
                  {binding === "liquidity"
                    ? "The pool is the tighter of the two right now, so that is the ceiling."
                    : binding === "collateral"
                      ? "Your collateral is the tighter of the two, so that is the ceiling. Lock more to raise it."
                      : collateral === 0n
                        ? "Lock collateral above to open a line of credit."
                        : "This collateral is already drawn to its limit. Repay, or lock more, to draw again."}
                </p>
              </div>
              <AmountField
                inputMode="decimal"
                placeholder="0.00"
                value={drawAmount}
                onChange={event => {
                  setDrawAmount(event.target.value)
                  setAcceptedRisk(false)
                }}
              />
              <QuickAmounts
                onPick={fraction => {
                  setDrawAmount(floorTo(fromUsdgUnits(maxDraw) * fraction, 2).toFixed(2))
                  setAcceptedRisk(false)
                }}
                disabled={maxDraw === 0n}
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
                    className="mt-0.5 h-3.5 w-3.5 accent-mint"
                  />
                  <span>
                    This draw leaves the position close to liquidation. A {(dropToLiquidation(currentPriceValue, liqAfter) * 100).toFixed(1)}%
                    fall in {asset?.symbol} would allow it to be liquidated. I understand the risk.
                  </span>
                </label>
              ) : null}

              <PrimaryButton
                disabled={drawUnits === 0n || Boolean(drawBlockedReason) || busy || !address}
                onClick={draw}
                className="w-full"
              >
                {busy ? "Confirming…" : drawBlockedReason ?? <span className="inline-flex items-center gap-1.5">Draw <Usdg /></span>}
              </PrimaryButton>
            </div>
          </Panel>

          <Panel title="Repay and close">
            <div className="flex flex-col gap-4">
              <div className="flex items-baseline justify-between text-[12.5px] tracking-[-0.02em] text-haze">
                <span>Wallet balance</span>
                <span className="text-mist [font-variant-numeric:tabular-nums]">{usd(fromUsdgUnits(usdgBalance))}</span>
              </div>
              <AmountField
                inputMode="decimal"
                placeholder="0.00"
                value={repayAmount}
                onChange={event => setRepayAmount(event.target.value)}
              />
              <QuickAmounts
                onPick={fraction => setRepayAmount((fromUsdgUnits(debt) * fraction).toFixed(2))}
                disabled={debt === 0n}
              />
              <PrimaryButton disabled={repayUnits === 0n || busy || !address} onClick={repay} className="w-full">
                {busy ? "Confirming…" : needsRepayApproval ? <span className="inline-flex items-center gap-1.5">Approve <Usdg /></span> : "Repay"}
              </PrimaryButton>

              {hasPosition ? (
                <div className="flex flex-col gap-2 border-t border-line pt-4">
                  <SummaryRow label={`Redemption fee (${Number(redeemBps) / 100}%)`} value={usd(fromUsdgUnits(closeOwed - debt))} />
                  <SummaryRow label="Total to close" value={usd(fromUsdgUnits(closeOwed))} />
                  <button
                    onClick={closeOut}
                    disabled={busy || !address}
                    className="rounded-[3px] border border-line px-5 py-2.5 text-[12.5px] font-medium tracking-[-0.01em] text-mist transition-colors hover:border-mint hover:text-mint disabled:opacity-50"
                  >
                    {needsCloseApproval ? `Approve ${usd(fromUsdgUnits(closeOwed))}` : "Close position and unlock collateral"}
                  </button>
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

function DemoBorrow() {
  const [assetId, setAssetId] = useState(collateralAssets[0].id)
  const [amount, setAmount] = useState("")
  const [acceptedRisk, setAcceptedRisk] = useState(false)

  const asset = collateralAssets.find(candidate => candidate.id === assetId) ?? collateralAssets[0]
  const collateralValue = asset.price * asset.balance
  const capacity = collateralValue * asset.maxLtv
  const maxDraw = Math.floor((capacity / (1 + originationFeeRate)) * 100) / 100
  const liqThresholdBps = Math.round((asset.maxLtv + 0.1) * 10_000)

  const draw = useMemo(() => {
    const parsed = Number.parseFloat(amount)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  }, [amount])

  const fee = draw * originationFeeRate
  const debtAfter = draw + fee
  const overCapacity = debtAfter > capacity + 0.01
  const healthAfter = debtAfter > 0 ? collateralValue / debtAfter : 0
  const liqAfter = debtAfter > 0 ? (debtAfter * 10_000) / (asset.balance * liqThresholdBps) : 0
  const stateAfter = healthStateOf(healthAfter, liqThresholdBps, debtAfter > 0)
  const needsAcknowledgement = draw > 0 && (stateAfter === "atRisk" || stateAfter === "liquidatable")

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1.1fr_1fr]">
      <Panel title="Collateral">
        <ul className="flex flex-col gap-2.5">
          {collateralAssets.map(candidate => (
            <li key={candidate.id}>
              <button
                aria-label={`Select ${candidate.symbol} as collateral`}
                aria-pressed={candidate.id === assetId}
                onClick={() => {
                  setAssetId(candidate.id)
                  setAcceptedRisk(false)
                }}
                className={`flex w-full items-center justify-between gap-3 rounded-[3px] border px-4 py-3.5 text-left transition-colors ${
                  candidate.id === assetId ? "border-mint bg-carbon/60" : "border-line bg-carbon/30 hover:border-haze"
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
                <span className="text-right">
                  <span className="block text-[13.5px] text-mist [font-variant-numeric:tabular-nums]">
                    {usd(candidate.price * candidate.balance)}
                  </span>
                  <span className="mt-0.5 block text-[12px] tracking-[-0.02em] text-haze">
                    max LTV {(candidate.maxLtv * 100).toFixed(0)}%
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title={<><UsdgMark className="h-[18px] w-[18px]" />Draw USDG</>}>
        <div className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between text-[12.5px] tracking-[-0.02em] text-haze">
            <span>Available to draw</span>
            <span className="text-mist [font-variant-numeric:tabular-nums]">{usd(maxDraw)}</span>
          </div>
          <AmountField
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={event => {
              setAmount(event.target.value)
              setAcceptedRisk(false)
            }}
          />
          <QuickAmounts
            onPick={fraction => {
              setAmount((maxDraw * fraction).toFixed(2))
              setAcceptedRisk(false)
            }}
          />

          <div className="flex flex-col divide-y divide-line border-y border-line">
            <SummaryRow label="Collateral locked" value={`${asset.balance} ${asset.symbol} · ${usd(collateralValue)}`} />
            <SummaryRow
              label={`One-time fee now (${(originationFeeRate * 100).toFixed(1)}%)`}
              value={usd(fee)}
            />
            <SummaryRow
              label={`Redemption fee at close (${(redemptionFeeRate * 100).toFixed(1)}%)`}
              value={usd(draw * redemptionFeeRate)}
            />
            <SummaryRow label="Interest" value="None, ever" />
            <SummaryRow label="Debt after draw" value={usd(debtAfter)} />
            <SummaryRow label="Liquidation price after" value={debtAfter > 0 ? price(liqAfter) : "No debt"} />
            <div className="flex items-center justify-between gap-4 py-2.5 text-[13.5px] tracking-[-0.01em]">
              <span className="text-haze">Health after</span>
              {debtAfter > 0 ? (
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
                className="mt-0.5 h-3.5 w-3.5 accent-mint"
              />
              <span>
                This draw leaves the position close to liquidation. A {(dropToLiquidation(asset.price, liqAfter) * 100).toFixed(1)}%
                fall in {asset.symbol} would allow it to be liquidated. I understand the risk.
              </span>
            </label>
          ) : null}

          <PrimaryButton
            disabled={draw <= 0 || overCapacity || (needsAcknowledgement && !acceptedRisk)}
            className="w-full"
          >
            {overCapacity ? "Above what this collateral supports" : <span className="inline-flex items-center gap-1.5">Draw <Usdg /></span>}
          </PrimaryButton>

          <p className="text-center text-[12.5px] tracking-[-0.02em] text-haze">
            Demo mode: no pool contract configured yet.
          </p>
        </div>
      </Panel>
    </div>
  )
}

export default function BorrowPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Borrow"
        lead="Lock a tokenized asset, draw USDG, pay one fee at the door. The debt you see at draw is the debt you repay."
        badge={isLive && liveAssets.length > 0 ? "Live onchain" : "Demo data"}
      />
      {isLive && liveAssets.length > 0 ? <LiveBorrow /> : <DemoBorrow />}
    </div>
  )
}
