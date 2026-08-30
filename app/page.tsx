"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useAccount, usePublicClient } from "wagmi"
import { HealthBar, PageHeader, Panel, Stat } from "@/components/ui"
import { demoPositions, maxLtvFor, passport, usd } from "@/lib/demo"
import { fromUsdcUnits, isLive, liveAssets, poolAddress, safixPoolAbi } from "@/lib/safix"

type LiveRow = {
  symbol: string
  locked: number
  value: number
  debt: number
}

function LiveDashboard() {
  const { address } = useAccount()
  const client = usePublicClient()
  const [rows, setRows] = useState<LiveRow[]>([])
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
            functionName: "collateralValueUsdc",
            args: [asset.address, positionReads[index][0]]
          })
        )
      )
      const compounded = await client.readContract({
        abi: safixPoolAbi,
        address: pool,
        functionName: "compoundedDepositOf",
        args: [address]
      })
      if (cancelled) return
      setRows(
        liveAssets
          .map((asset, index) => ({
            symbol: asset.symbol,
            locked: Number(positionReads[index][0]) / 1e18,
            value: fromUsdcUnits(valueReads[index]),
            debt: fromUsdcUnits(positionReads[index][1])
          }))
          .filter(row => row.locked > 0 || row.debt > 0)
      )
      setDeposit(fromUsdcUnits(compounded))
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
        <Stat label="Pool deposit" value={address ? usd(deposit) : "–"} hint="Compounded after liquidations" />
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
              <li key={row.symbol} className="grid grid-cols-2 items-center gap-3 py-4 sm:grid-cols-4">
                <div>
                  <p className="text-[15px] font-semibold tracking-[-0.01em] text-fog">{row.symbol}</p>
                  <p className="mt-1 text-[12px] tracking-[-0.02em] text-haze">{row.locked.toFixed(4)} locked</p>
                </div>
                <div>
                  <p className="text-[12px] tracking-[-0.02em] text-haze">Value</p>
                  <p className="mt-1 text-[14px] text-mist [font-variant-numeric:tabular-nums]">{usd(row.value)}</p>
                </div>
                <div>
                  <p className="text-[12px] tracking-[-0.02em] text-haze">Debt</p>
                  <p className="mt-1 text-[14px] text-mist [font-variant-numeric:tabular-nums]">{usd(row.debt)}</p>
                </div>
                {row.debt > 0 ? <HealthBar ratio={row.value / row.debt} /> : <span className="text-[13px] text-haze">No debt</span>}
              </li>
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
          {demoPositions.map(position => (
            <li key={position.id} className="grid grid-cols-2 items-center gap-3 py-4 sm:grid-cols-4">
              <div>
                <p className="text-[15px] font-semibold tracking-[-0.01em] text-fog">{position.symbol}</p>
                <p className="mt-1 text-[12px] tracking-[-0.02em] text-haze">{position.locked} locked</p>
              </div>
              <div>
                <p className="text-[12px] tracking-[-0.02em] text-haze">Value</p>
                <p className="mt-1 text-[14px] text-mist [font-variant-numeric:tabular-nums]">{usd(position.value)}</p>
              </div>
              <div>
                <p className="text-[12px] tracking-[-0.02em] text-haze">Debt</p>
                <p className="mt-1 text-[14px] text-mist [font-variant-numeric:tabular-nums]">{usd(position.debt)}</p>
              </div>
              <HealthBar ratio={position.value / position.debt} />
            </li>
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
