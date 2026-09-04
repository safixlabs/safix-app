"use client"

import { useEffect, useMemo, useState } from "react"
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi"
import { AmountField, AssetMark, ConfirmedLink, Field, HealthBar, PageHeader, Panel, PrimaryButton, Usdg, UsdgMark } from "@/components/ui"
import { collateralAssets, originationFeeRate, usd } from "@/lib/demo"
import { TxToast } from "@/components/TxToast"
import { humanError } from "@/lib/errors"
import {
  erc20Abi,
  erc8056Abi,
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

function LiveBorrow() {
  const { address } = useAccount()
  const [assetIndex, setAssetIndex] = useState(0)
  const [lockAmount, setLockAmount] = useState("")
  const [drawAmount, setDrawAmount] = useState("")
  const [repayAmount, setRepayAmount] = useState("")

  const asset = liveAssets[assetIndex]

  const config = useReadContract({
    abi: safixPoolAbi,
    address: poolAddress,
    functionName: "assetConfig",
    args: asset ? [asset.address] : undefined,
    query: { enabled: Boolean(asset) }
  })
  const position = useReadContract({
    abi: safixPoolAbi,
    address: poolAddress,
    functionName: "positions",
    args: address && asset ? [address, asset.address] : undefined,
    query: { enabled: Boolean(address && asset) }
  })
  const tokenBalance = useReadContract({
    abi: erc20Abi,
    address: asset?.address,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && asset) }
  })
  const tokenAllowance = useReadContract({
    abi: erc20Abi,
    address: asset?.address,
    functionName: "allowance",
    args: address && poolAddress ? [address, poolAddress] : undefined,
    query: { enabled: Boolean(address && asset) }
  })
  const usdgAllowance = useReadContract({
    abi: erc20Abi,
    address: usdgAddress,
    functionName: "allowance",
    args: address && poolAddress ? [address, poolAddress] : undefined,
    query: { enabled: Boolean(address) }
  })
  const feeBps = useReadContract({
    abi: safixPoolAbi,
    address: poolAddress,
    functionName: "originationFeeBps"
  })
  const redeemBps = useReadContract({
    abi: safixPoolAbi,
    address: poolAddress,
    functionName: "redemptionFeeBps"
  })
  const uiMultiplier = useReadContract({
    abi: erc8056Abi,
    address: asset?.address,
    functionName: "uiMultiplier",
    query: { enabled: Boolean(asset), retry: false }
  })

  const { writeContract, data: txHash, isPending, error } = useWriteContract()
  const receipt = useWaitForTransactionReceipt({ hash: txHash })

  useEffect(() => {
    if (receipt.isSuccess) {
      config.refetch()
      position.refetch()
      tokenBalance.refetch()
      tokenAllowance.refetch()
      usdgAllowance.refetch()
    }
  }, [receipt.isSuccess])

  const busy = isPending || (Boolean(txHash) && receipt.isLoading)

  const price1e18 = config.data?.[3] ?? 0n
  const maxLtvBps = config.data?.[1] ?? 0
  const collateral = position.data?.[0] ?? 0n
  const debt = position.data?.[1] ?? 0n
  const totalDrawn = position.data?.[2] ?? 0n
  const closeOwed = debt + (totalDrawn * BigInt(redeemBps.data ?? 30)) / 10_000n
  const hasPosition = collateral > 0n || debt > 0n
  const needsCloseApproval = closeOwed > 0n && (usdgAllowance.data ?? 0n) < closeOwed

  const lockedValueUsdg = (collateral * price1e18) / 10n ** 30n
  const capacity = (lockedValueUsdg * BigInt(maxLtvBps)) / 10_000n
  const headroom = capacity > debt ? capacity - debt : 0n

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

  const fee = (drawUnits * BigInt(feeBps.data ?? 50)) / 10_000n
  const debtAfter = debt + drawUnits + fee
  const overCapacity = drawUnits > 0n && debtAfter > capacity
  const needsLockApproval = lockUnits > 0n && (tokenAllowance.data ?? 0n) < lockUnits
  const needsRepayApproval = repayUnits > 0n && (usdgAllowance.data ?? 0n) < repayUnits
  const health = debtAfter > 0n ? Number((lockedValueUsdg * 100n) / debtAfter) / 100 : 0

  const lock = () => {
    if (!asset || !poolAddress || lockUnits === 0n) return
    if (needsLockApproval) {
      writeContract({ abi: erc20Abi, address: asset.address, functionName: "approve", args: [poolAddress, lockUnits] })
    } else {
      writeContract({ abi: safixPoolAbi, address: poolAddress, functionName: "lockCollateral", args: [asset.address, lockUnits] })
    }
  }

  const draw = () => {
    if (!asset || !poolAddress || drawUnits === 0n || overCapacity) return
    writeContract({ abi: safixPoolAbi, address: poolAddress, functionName: "draw", args: [asset.address, drawUnits] })
  }

  const repay = () => {
    if (!asset || !poolAddress || !usdgAddress || repayUnits === 0n) return
    if (needsRepayApproval) {
      writeContract({ abi: erc20Abi, address: usdgAddress, functionName: "approve", args: [poolAddress, repayUnits] })
    } else {
      writeContract({ abi: safixPoolAbi, address: poolAddress, functionName: "repay", args: [asset.address, repayUnits] })
    }
  }

  const closeOut = () => {
    if (!asset || !poolAddress || !usdgAddress || !hasPosition) return
    if (needsCloseApproval) {
      writeContract({ abi: erc20Abi, address: usdgAddress, functionName: "approve", args: [poolAddress, closeOwed] })
    } else {
      writeContract({ abi: safixPoolAbi, address: poolAddress, functionName: "closePosition", args: [asset.address] })
    }
  }

  const mintTestAsset = () => {
    if (!asset || !address) return
    writeContract({ abi: erc20Abi, address: asset.address, functionName: "mint", args: [address, 10n * 10n ** 18n] })
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
      <TxToast
        hash={txHash}
        isPending={isPending}
        isConfirming={receipt.isLoading && Boolean(txHash)}
        isSuccess={receipt.isSuccess}
        error={error}
      />
      <Panel title="Collateral">
        <ul className="flex flex-col gap-2.5">
          {liveAssets.map((candidate, index) => (
            <li key={candidate.address}>
              <button
                onClick={() => setAssetIndex(index)}
                className={`flex w-full items-center justify-between gap-3 rounded-[3px] border px-4 py-3.5 text-left transition-colors ${
                  index === assetIndex
                    ? "border-mint bg-carbon/60"
                    : "border-line bg-carbon/30 hover:border-haze"
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
              {uiTokenAmount(collateral, uiMultiplier.data).toFixed(4)} {asset?.symbol} · {usd(fromUsdgUnits(lockedValueUsdg))}
            </span>
          </div>
          <Field
            inputMode="decimal"
            placeholder={`Amount of ${asset?.symbol ?? ""} to lock`}
            value={lockAmount}
            onChange={event => setLockAmount(event.target.value)}
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
          <p className="text-center text-[12px] tracking-[-0.02em] text-haze">
            Wallet balance: {uiTokenAmount(tokenBalance.data ?? 0n, uiMultiplier.data).toFixed(4)} {asset?.symbol}
          </p>
        </div>
      </Panel>

      <Panel title={<><UsdgMark className="h-[18px] w-[18px]" />Draw USDG</>}>
        <div className="flex flex-col gap-4">
          <AmountField
            inputMode="decimal"
            placeholder="0.00"
            value={drawAmount}
            onChange={event => setDrawAmount(event.target.value)}
          />
          <dl className="flex flex-col divide-y divide-line text-[13.5px] tracking-[-0.01em]">
            <div className="flex items-baseline justify-between py-2.5">
              <dt className="text-haze">Borrow capacity</dt>
              <dd className="text-mist [font-variant-numeric:tabular-nums]">{usd(fromUsdgUnits(headroom))}</dd>
            </div>
            <div className="flex items-baseline justify-between py-2.5">
              <dt className="text-haze">One-time fee</dt>
              <dd className="text-mist [font-variant-numeric:tabular-nums]">{usd(fromUsdgUnits(fee))}</dd>
            </div>
            <div className="flex items-baseline justify-between py-2.5">
              <dt className="text-haze">Debt after draw</dt>
              <dd className="font-semibold text-fog [font-variant-numeric:tabular-nums]">
                {usd(fromUsdgUnits(debtAfter))}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-haze">Health after</dt>
              <dd>{debtAfter > 0n ? <HealthBar ratio={health} /> : <span className="text-haze">–</span>}</dd>
            </div>
          </dl>
          <PrimaryButton
            disabled={drawUnits === 0n || overCapacity || busy || !address}
            onClick={draw}
            className="w-full"
          >
            {overCapacity ? "Exceeds capacity" : busy ? "Confirming…" : <span className="inline-flex items-center gap-1.5">Draw <Usdg /></span>}
          </PrimaryButton>

          <div className="flex flex-col gap-3 border-t border-line pt-4">
            <div className="flex items-baseline justify-between text-[13px] tracking-[-0.01em]">
              <span className="text-haze">Current debt</span>
              <span className="text-mist [font-variant-numeric:tabular-nums]">{usd(fromUsdgUnits(debt))}</span>
            </div>
            <div className="flex gap-2.5">
              <AmountField
                inputMode="decimal"
                placeholder="Repay amount"
                value={repayAmount}
                onChange={event => setRepayAmount(event.target.value)}
              />
              <button
                onClick={repay}
                disabled={repayUnits === 0n || busy || !address}
                className="shrink-0 rounded-[3px] border border-line px-4 text-[13px] font-medium text-mist transition-colors hover:border-mint hover:text-mint disabled:opacity-50"
              >
                {needsRepayApproval ? "Approve" : "Repay"}
              </button>
            </div>
            {hasPosition ? (
              <button
                onClick={closeOut}
                disabled={busy || !address}
                className="rounded-[3px] border border-line px-5 py-2 text-[12.5px] font-medium tracking-[-0.01em] text-haze transition-colors hover:border-mint hover:text-mint disabled:opacity-50"
              >
                {needsCloseApproval
                  ? `Approve ${usd(fromUsdgUnits(closeOwed))} to close`
                  : `Close position, pay ${usd(fromUsdgUnits(closeOwed))}, unlock all collateral`}
              </button>
            ) : null}
          </div>

          <p className="text-center text-[12.5px] tracking-[-0.02em] text-haze">
            {error
              ? humanError(error)
              : receipt.isSuccess
                ? <ConfirmedLink hash={txHash} />
                : "No time-based cost. Repay whenever you choose."}
          </p>
        </div>
      </Panel>
    </div>
  )
}

function DemoBorrow() {
  const [assetId, setAssetId] = useState(collateralAssets[0].id)
  const [amount, setAmount] = useState("")
  const [drawn, setDrawn] = useState(false)

  const asset = collateralAssets.find(candidate => candidate.id === assetId) ?? collateralAssets[0]
  const collateralValue = asset.price * asset.balance
  const capacity = collateralValue * asset.maxLtv

  const draw = useMemo(() => {
    const parsed = Number.parseFloat(amount)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  }, [amount])

  const fee = draw * originationFeeRate
  const debtAfter = draw + fee
  const overCapacity = debtAfter > capacity
  const health = debtAfter > 0 ? collateralValue / debtAfter : 0

  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
      <Panel title="Collateral">
        <ul className="flex flex-col gap-2.5">
          {collateralAssets.map(candidate => {
            const selected = candidate.id === assetId
            return (
              <li key={candidate.id}>
                <button
                  onClick={() => {
                    setAssetId(candidate.id)
                    setDrawn(false)
                  }}
                  className={`flex w-full items-center justify-between gap-3 rounded-[3px] border px-4 py-3.5 text-left transition-colors ${
                    selected
                      ? "border-mint bg-carbon/60"
                      : "border-line bg-carbon/30 hover:border-haze"
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
            )
          })}
        </ul>
      </Panel>

      <Panel title={<><UsdgMark className="h-[18px] w-[18px]" />Draw USDG</>}>
        <div className="flex flex-col gap-4">
          <div className="flex gap-2.5">
            <AmountField
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={event => {
                setAmount(event.target.value)
                setDrawn(false)
              }}
            />
            <button
              onClick={() => {
                setAmount((capacity / (1 + originationFeeRate)).toFixed(2))
                setDrawn(false)
              }}
              className="shrink-0 rounded-[3px] border border-line px-4 text-[13px] font-medium text-mist transition-colors hover:border-mint hover:text-mint"
            >
              Max
            </button>
          </div>

          <dl className="flex flex-col divide-y divide-line text-[13.5px] tracking-[-0.01em]">
            <div className="flex items-baseline justify-between py-2.5">
              <dt className="text-haze">Collateral locked</dt>
              <dd className="text-mist [font-variant-numeric:tabular-nums]">
                {asset.balance} {asset.symbol} · {usd(collateralValue)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between py-2.5">
              <dt className="text-haze">Borrow capacity</dt>
              <dd className="text-mist [font-variant-numeric:tabular-nums]">{usd(capacity)}</dd>
            </div>
            <div className="flex items-baseline justify-between py-2.5">
              <dt className="text-haze">One-time fee (0.5%)</dt>
              <dd className="text-mist [font-variant-numeric:tabular-nums]">{usd(fee)}</dd>
            </div>
            <div className="flex items-baseline justify-between py-2.5">
              <dt className="text-haze">Debt after draw</dt>
              <dd className="font-semibold text-fog [font-variant-numeric:tabular-nums]">
                {usd(debtAfter)}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-haze">Health after</dt>
              <dd>{draw > 0 ? <HealthBar ratio={health} /> : <span className="text-haze">–</span>}</dd>
            </div>
          </dl>

          <PrimaryButton
            disabled={draw <= 0 || overCapacity}
            onClick={() => setDrawn(true)}
            className="w-full"
          >
            {overCapacity ? "Exceeds capacity" : <span className="inline-flex items-center gap-1.5">Draw <Usdg /></span>}
          </PrimaryButton>

          <p className="text-center text-[12.5px] tracking-[-0.02em] text-haze">
            {drawn
              ? "Demo draw recorded. Set the contract addresses to go live."
              : "Demo mode: no pool contract configured yet."}
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
