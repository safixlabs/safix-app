"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useAccount, usePublicClient } from "wagmi"
import { AssetMark, HealthBadge, HealthBar, PageHeader, Panel, Stat, UsdgMark } from "@/components/ui"
import { demoPositions, maxLtvFor, passport, usd } from "@/lib/demo"
import { distanceToLiquidation, healthStateOf, liquidationPrice1e18, priceToNumber } from "@/lib/risk"
import { ONE_1E18, erc8056Abi, fromUsdgUnits, isLive, liveAssets, poolAddress, safixPoolAbi, uiTokenAmount } from "@/lib/safix"

type PositionRow = {
  symbol: string
  locked: number
  value: number
  debt: number
  /** Current collateral price, as the pool values it. */
  price: number
  /** The price at which this position becomes liquidatable. */
  liquidationPrice: number
  /** The asset's own threshold. Health means nothing without it. */
  liqThresholdBps: number
}

const price = (value: number) => usd(value, value >= 100 ? 2 : 4)

function PositionLine({ row }: { row: PositionRow }) {
  const health = row.debt > 0 ? row.value / row.debt : 0
  const hasDebt = row.debt > 0
  const room = hasDebt ? distanceToLiquidation(health, row.liqThresholdBps) : 0
  // Once the price is already through the liquidation level there is no fall
  // left to quote, and quoting "0.0% away" reads as if there were room.
  const past = hasDebt && healthStateOf(health, row.liqThresholdBps, true) === "liquidatable"

  return (
    <li className="flex flex-col gap-3 py-4">
      <div className="grid grid-cols-2 items-center gap-3 sm:grid-cols-4">
        <div className="flex items-center gap-3">
          <AssetMark symbol={row.symbol} className="h-9 w-9" />
          <div>
            <p className="text-[15px] font-semibold tracking-[-0.01em] text-fog">{row.symbol}</p>
            <p className="mt-1 text-[12px] tracking-[-0.02em] text-haze">{row.locked.toFixed(4)} locked</p>
          </div>
        </div>
        <div>
          <p className="text-[12px] tracking-[-0.02em] text-haze">Value</p>
          <p className="mt-1 text-[14px] text-mist [font-variant-numeric:tabular-nums]">{usd(row.value)}</p>
        </div>
        <div>
          <p className="text-[12px] tracking-[-0.02em] text-haze">Debt</p>
          <p className="mt-1 text-[14px] text-mist [font-variant-numeric:tabular-nums]">{usd(row.debt)}</p>
        </div>
        {hasDebt ? (
          <div className="flex flex-col items-start gap-2">
            <HealthBadge health={health} liqThresholdBps={row.liqThresholdBps} hasDebt />
            <HealthBar ratio={health} liqThresholdBps={row.liqThresholdBps} hasDebt />
          </div>
        ) : (
          <span className="text-[13px] text-haze">No debt</span>
        )}
      </div>

      {hasDebt ? (
        <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12.5px] tracking-[-0.02em] text-haze">
          <span>
            {row.symbol} now{" "}
            <span className="text-mist [font-variant-numeric:tabular-nums]">{price(row.price)}</span>
          </span>
          <span>
            liquidates at{" "}
            <span className="text-mist [font-variant-numeric:tabular-nums]">{price(row.liquidationPrice)}</span>
          </span>
          {past ? (
            <span className="text-danger">already past it</span>
          ) : (
            <span>
              a{" "}
              <span className="text-mist [font-variant-numeric:tabular-nums]">{(room * 100).toFixed(1)}%</span> fall
              away
            </span>
          )}
        </p>
      ) : null}
    </li>
  )
}

function LiveDashboard() {
  const { address } = useAccount()
  const client = usePublicClient()
  const [rows, setRows] = useState<PositionRow[]>([])
  const [deposit, setDeposit] = useState(0)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const pool = poolAddress
      if (!client || !address || !pool) {
        setRows([])
        setDeposit(0)
        setLoaded(Boolean(address))
        return
      }
      const positionReads = await Promise.all(
        liveAssets.map(asset =>
          client.readContract({
            abi: safixPoolAbi,
            address: pool,
            functionName: "positions",
            args: [address, asset.address]
          })
        )
      )
      const valueReads = await Promise.all(
        liveAssets.map((asset, index) =>
          client.readContract({
            abi: safixPoolAbi,
            address: pool,
            functionName: "collateralValueStable",
            args: [asset.address, positionReads[index][0]]
          })
        )
      )
      // Health is meaningless without the asset's own liquidation threshold, and
      // the liquidation price cannot be stated without the price the pool uses.
      const configReads = await Promise.all(
        liveAssets.map(asset =>
          client.readContract({ abi: safixPoolAbi, address: pool, functionName: "assetConfig", args: [asset.address] })
        )
      )
      const priceReads = await Promise.all(
        liveAssets.map(asset =>
          client.readContract({ abi: safixPoolAbi, address: pool, functionName: "currentPrice", args: [asset.address] })
        )
      )
      const compounded = await client.readContract({
        abi: safixPoolAbi,
        address: pool,
        functionName: "compoundedDepositOf",
        args: [address]
      })
      const multipliers = await Promise.all(
        liveAssets.map(asset =>
          client
            .readContract({ abi: erc8056Abi, address: asset.address, functionName: "uiMultiplier" })
            .catch(() => ONE_1E18)
        )
      )
      if (cancelled) return
      setRows(
        liveAssets
          .map((asset, index) => {
            const collateral = positionReads[index][0]
            const debt = positionReads[index][1]
            const liqThresholdBps = configReads[index][2]
            return {
              symbol: asset.symbol,
              locked: uiTokenAmount(collateral, multipliers[index]),
              value: fromUsdgUnits(valueReads[index]),
              debt: fromUsdgUnits(debt),
              price: priceToNumber(priceReads[index][0]),
              liquidationPrice: priceToNumber(liquidationPrice1e18(debt, collateral, liqThresholdBps)),
              liqThresholdBps
            }
          })
          .filter(row => row.locked > 0 || row.debt > 0)
      )
      setDeposit(fromUsdgUnits(compounded))
      setLoaded(true)
    }
    load()
    const interval = setInterval(load, 15000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [client, address])

  const collateralValue = rows.reduce((sum, row) => sum + row.value, 0)
  const totalDebt = rows.reduce((sum, row) => sum + row.debt, 0)

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Collateral value"
          value={address ? usd(collateralValue) : "–"}
          hint={address ? `${rows.length} position${rows.length === 1 ? "" : "s"}` : "Connect a wallet"}
        />
        <Stat label="Active debt" value={address ? usd(totalDebt) : "–"} hint="Fixed since draw, no accrual" />
        <Stat
          label={<><UsdgMark className="h-3.5 w-3.5" />Pool deposit</>}
          value={address ? usd(deposit) : "–"}
          hint="Compounded after liquidations"
        />
        <Stat label="Network" value="Live" hint="Reading Safix contracts onchain" />
      </div>

      <Panel title="Positions">
        {rows.length === 0 ? (
          <p className="py-2 text-[14px] tracking-[-0.01em] text-haze">
            {address
              ? loaded
                ? "No open positions yet. Lock collateral on the borrow screen to open one."
                : "Loading positions…"
              : "Connect a wallet to see positions."}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {rows.map(row => (
              <PositionLine key={row.symbol} row={row} />
            ))}
          </ul>
        )}
      </Panel>
    </>
  )
}

function DemoDashboard() {
  const collateralValue = demoPositions.reduce((sum, position) => sum + position.value, 0)
  const totalDebt = demoPositions.reduce((sum, position) => sum + position.debt, 0)
  const capacity = demoPositions.reduce(
    (sum, position) => sum + position.value * maxLtvFor(position.symbol),
    0
  )
  const availableCredit = Math.max(0, capacity - totalDebt)

  const rows: PositionRow[] = demoPositions.map(position => {
    const liqThresholdBps = Math.round((maxLtvFor(position.symbol) + 0.1) * 10_000)
    const unitPrice = position.locked > 0 ? position.value / position.locked : 0
    const liquidationPrice =
      position.locked > 0 ? (position.debt * 10_000) / (position.locked * liqThresholdBps) : 0
    return {
      symbol: position.symbol,
      locked: position.locked,
      value: position.value,
      debt: position.debt,
      price: unitPrice,
      liquidationPrice,
      liqThresholdBps
    }
  })

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Collateral value" value={usd(collateralValue)} hint="2 assets locked" />
        <Stat label="Active debt" value={usd(totalDebt)} hint="Fixed since draw, no accrual" />
        <Stat label="Available credit" value={usd(availableCredit)} hint="Against current collateral" />
        <Stat label="Credit passport" value="Active" hint={`${passport.attestations} attestations in force`} />
      </div>

      <Panel title="Positions">
        <ul className="flex flex-col divide-y divide-line">
          {rows.map(row => (
            <PositionLine key={row.symbol} row={row} />
          ))}
        </ul>
      </Panel>
    </>
  )
}

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Overview"
        lead="Your collateral, your credit, and your passport in one place. Debt never grows with time here: what you drew is what you owe."
        badge={isLive ? "Live onchain" : "Demo data"}
      />
      {isLive ? <LiveDashboard /> : <DemoDashboard />}
      <p className="text-[13px] leading-[1.6] tracking-[-0.02em] text-haze">
        Credit here is interest-free by design: a one-time fee at origination, a fixed fee at
        redemption, nothing in between. The full model is described in the{" "}
        <Link
          href="https://safix-docs.vercel.app/financing/"
          className="text-mint transition-colors hover:text-mint-bright"
        >
          documentation
        </Link>
        .
      </p>
    </div>
  )
}
