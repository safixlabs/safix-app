import Link from "next/link"
import { HealthBar, PageHeader, Panel, Stat } from "@/components/ui"
import { demoPositions, maxLtvFor, passport, usd } from "@/lib/demo"

export default function DashboardPage() {
  const collateralValue = demoPositions.reduce((sum, position) => sum + position.value, 0)
  const totalDebt = demoPositions.reduce((sum, position) => sum + position.debt, 0)
  const capacity = demoPositions.reduce(
    (sum, position) => sum + position.value * maxLtvFor(position.symbol),
    0
  )
  const availableCredit = Math.max(0, capacity - totalDebt)

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Overview"
        lead="Your collateral, your credit, and your passport in one place. Debt never grows with time here: what you drew is what you owe."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Collateral value" value={usd(collateralValue)} hint="2 assets locked" />
        <Stat label="Active debt" value={usd(totalDebt)} hint="Fixed since draw, no accrual" />
        <Stat label="Available credit" value={usd(availableCredit)} hint="Against current collateral" />
        <Stat
          label="Credit passport"
          value="Active"
          hint={`${passport.attestations} attestations in force`}
        />
      </div>

      <Panel title="Positions">
        <ul className="flex flex-col divide-y divide-line">
          {demoPositions.map(position => (
            <li
              key={position.id}
              className="grid grid-cols-2 items-center gap-3 py-4 sm:grid-cols-4"
            >
              <div>
                <p className="text-[15px] font-semibold tracking-[-0.01em] text-fog">
                  {position.symbol}
                </p>
                <p className="mt-1 text-[12px] tracking-[-0.02em] text-haze">
                  {position.locked} locked
                </p>
              </div>
              <div>
                <p className="text-[12px] tracking-[-0.02em] text-haze">Value</p>
                <p className="mt-1 text-[14px] text-mist [font-variant-numeric:tabular-nums]">
                  {usd(position.value)}
                </p>
              </div>
              <div>
                <p className="text-[12px] tracking-[-0.02em] text-haze">Debt</p>
                <p className="mt-1 text-[14px] text-mist [font-variant-numeric:tabular-nums]">
                  {usd(position.debt)}
                </p>
              </div>
              <HealthBar ratio={position.value / position.debt} />
            </li>
          ))}
        </ul>
      </Panel>

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
