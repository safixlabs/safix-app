"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { useAccount, usePublicClient } from "wagmi"
import { reportError } from "@/lib/monitoring"
import { AssetMark, HealthBadge, HealthBar, NotDeployed, PageHeader, Panel, Stat, UsdgMark } from "@/components/ui"
import { activeChain } from "@/lib/chain"
import { price, tokenAmount, usd } from "@/lib/format"
import { reportReadFailure, reportReadSuccess } from "@/lib/health"
import { useVisibleInterval } from "@/lib/polling"
import { priceAgeLine, priceFreshness } from "@/lib/price"
import { distanceToLiquidation, healthStateOf, liquidationPrice1e18, priceToNumber } from "@/lib/risk"
import { ONE_1E18, collateralAssets, deploymentLabel, erc8056Abi, fromUsdgUnits, hasDeployment, poolAddress, safixPoolAbi, uiTokenAmount } from "@/lib/safix"

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
  /** How old the price is, in words. A health figure is only as current as this. */
  priceLine: string
}

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
            <p className="mt-1 text-[12px] tracking-[-0.02em] text-haze">{tokenAmount(row.locked)} locked</p>
          </div>
        </div>
        <div>
          <p className="text-[12px] tracking-[-0.02em] text-haze">Value</p>
          <p className="mt-1 text-[14px] text-mist">{usd(row.value)}</p>
        </div>
        <div>
          <p className="text-[12px] tracking-[-0.02em] text-haze">Debt</p>
          <p className="mt-1 text-[14px] text-mist">{usd(row.debt)}</p>
        </div>
        {hasDebt ? (
          <div className="flex flex-col items-start gap-2">
            <HealthBadge health={health} liqThresholdBps={row.liqThresholdBps} hasDebt />
            <HealthBar ratio={health} liqThresholdBps={row.liqThresholdBps} hasDebt label={`${row.symbol} position health`} />
          </div>
        ) : (
          <span className="text-[13px] text-haze">No debt</span>
        )}
      </div>

      {hasDebt ? (
        <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12.5px] tracking-[-0.02em] text-haze">
          <span>
            {row.symbol} now{" "}
            <span className="text-mist">{price(row.price)}</span>
            {row.priceLine ? <span>, {row.priceLine}</span> : null}
          </span>
          <span>
            liquidates at{" "}
            <span className="text-mist">{price(row.liquidationPrice)}</span>
          </span>
          {past ? (
            <span className="text-danger">already past it</span>
          ) : (
            <span>
              a{" "}
              <span className="text-mist">{(room * 100).toFixed(1)}%</span> fall
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
  const [rows, setRows] = useState<PositionRow[]>([])
  const [deposit, setDeposit] = useState(0)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    // These reads belong to whoever was connected a moment ago. Drop them before
    // the new ones are in flight, so an account switch never leaves the previous
    // account's positions on screen for the length of a round trip.
    setRows([])
    setDeposit(0)
    setLoaded(false)
    const load = async () => {
      const pool = poolAddress
      if (!client || !address || !pool) {
        setRows([])
        setDeposit(0)
        setLoaded(Boolean(address))
        return
      }
      // Everything that does not depend on another read goes out together, so
      // multicall folds it into one call. Only the collateral values have to
      // wait, because they are asked per position size.
      const [positionReads, configReads, priceReads, guardReads, compounded, multipliers] = await Promise.all([
        Promise.all(
          collateralAssets.map(asset =>
            client.readContract({
              abi: safixPoolAbi,
              address: pool,
              functionName: "positions",
              args: [address, asset.address]
            })
          )
        ),
        Promise.all(
          collateralAssets.map(asset =>
            client.readContract({ abi: safixPoolAbi, address: pool, functionName: "assetConfig", args: [asset.address] })
          )
        ),
        Promise.all(
          collateralAssets.map(asset =>
            client.readContract({ abi: safixPoolAbi, address: pool, functionName: "currentPrice", args: [asset.address] })
          )
        ),
        Promise.all(
          collateralAssets.map(asset =>
            client
              .readContract({ abi: safixPoolAbi, address: pool, functionName: "priceGuards", args: [asset.address] })
              // A pool with no guard for this asset is not a broken read: the age is
              // still worth quoting, it simply has no limit to be measured against.
              .catch(() => null)
          )
        ),
        client.readContract({
          abi: safixPoolAbi,
          address: pool,
          functionName: "compoundedDepositOf",
          args: [address]
        }),
        Promise.all(
          collateralAssets.map(asset =>
            client
              .readContract({ abi: erc8056Abi, address: asset.address, functionName: "uiMultiplier" })
              .catch(() => ONE_1E18)
          )
        )
      ])
      const valueReads = await Promise.all(
        collateralAssets.map((asset, index) =>
          client.readContract({
            abi: safixPoolAbi,
            address: pool,
            functionName: "collateralValueStable",
            args: [asset.address, positionReads[index][0]]
          })
        )
      )
      if (cancelled) return
      const at = Math.floor(Date.now() / 1000)
      setRows(
        collateralAssets
          .map((asset, index) => {
            const collateral = positionReads[index][0]
            const debt = positionReads[index][1]
            const liqThresholdBps = configReads[index][2]
            const guard = guardReads[index]
            return {
              symbol: asset.symbol,
              locked: uiTokenAmount(collateral, multipliers[index]),
              value: fromUsdgUnits(valueReads[index]),
              debt: fromUsdgUnits(debt),
              price: priceToNumber(priceReads[index][0]),
              liquidationPrice: priceToNumber(liquidationPrice1e18(debt, collateral, liqThresholdBps)),
              liqThresholdBps,
              priceLine: priceAgeLine(
                priceFreshness(Number(priceReads[index][1]), guard ? Number(guard[0]) : null, at)
              )
            }
          })
          .filter(row => row.locked > 0 || row.debt > 0)
      )
      setDeposit(fromUsdgUnits(compounded))
      setLoaded(true)
      reportReadSuccess()
    }
    // A read that throws here would otherwise leave the screen loading for
    // ever, with nothing saying why. The failure is both recorded and shown.
    const run = () =>
      load().catch(error => {
        reportError(error, { screen: "dashboard" })
        reportReadFailure()
      })
    run()
    refresh.current = run
    return () => {
      cancelled = true
      refresh.current = undefined
    }
  }, [client, address])

  const collateralValue = rows.reduce((sum, row) => sum + row.value, 0)
  const totalDebt = rows.reduce((sum, row) => sum + row.debt, 0)

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Collateral value"
          value={address ? usd(collateralValue) : "N/A"}
          hint={address ? `${rows.length} position${rows.length === 1 ? "" : "s"}` : "Connect a wallet"}
        />
        <Stat label="Active debt" value={address ? usd(totalDebt) : "N/A"} hint="Fixed since draw, no accrual" />
        <Stat
          label={<><UsdgMark />Pool deposit</>}
          value={address ? usd(deposit) : "N/A"}
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

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Overview"
        lead="Your collateral, your credit, and your passport in one place. Debt never grows with time here: what you drew is what you owe."
        badge={deploymentLabel}
      />
      {hasDeployment ? <LiveDashboard /> : <NotDeployed chainName={activeChain.name} />}
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
