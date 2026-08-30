"use client"

import { useState } from "react"
import { Field, PageHeader, Panel, PrimaryButton, Stat } from "@/components/ui"
import { poolStats, usd } from "@/lib/demo"

export default function PoolPage() {
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit")
  const [amount, setAmount] = useState("")
  const [submitted, setSubmitted] = useState(false)

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Stability pool"
        lead="The pool funds every draw and absorbs every liquidation. Providers earn from real events, liquidation gains and protocol rewards, never from time."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Pool size" value={usd(poolStats.tvl, 0)} hint="USDC deposited by providers" />
        <Stat label="Your deposit" value={usd(poolStats.yourDeposit, 0)} hint={`${(poolStats.poolShare * 100).toFixed(2)}% of the pool`} />
        <Stat label="Liquidation gains" value={usd(poolStats.liquidationGains)} hint="Discounted collateral received" />
        <Stat label="Protocol rewards" value={usd(poolStats.rewards)} hint="Lifetime, claimable" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        <Panel title={mode === "deposit" ? "Deposit USDC" : "Withdraw USDC"}>
          <div className="flex flex-col gap-4">
            <div className="flex gap-2">
              {(["deposit", "withdraw"] as const).map(candidate => (
                <button
                  key={candidate}
                  onClick={() => {
                    setMode(candidate)
                    setSubmitted(false)
                  }}
                  className={`rounded-full px-4 py-2 text-[13px] font-medium tracking-[-0.01em] transition-colors ${
                    mode === candidate
                      ? "bg-mint text-carbon"
                      : "border border-line text-mist hover:text-fog"
                  }`}
                >
                  {candidate === "deposit" ? "Deposit" : "Withdraw"}
                </button>
              ))}
            </div>
            <Field
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={event => {
                setAmount(event.target.value)
                setSubmitted(false)
              }}
            />
            <PrimaryButton
              disabled={!(Number.parseFloat(amount) > 0)}
              onClick={() => setSubmitted(true)}
              className="w-full"
            >
              {mode === "deposit" ? "Deposit" : "Withdraw"}
            </PrimaryButton>
            <p className="text-center text-[12.5px] tracking-[-0.02em] text-haze">
              {submitted ? "Demo action recorded. Nothing moves onchain yet." : "Withdraw any time outside active liquidations."}
            </p>
          </div>
        </Panel>

        <Panel title="How the pool earns">
          <ul className="flex flex-col divide-y divide-line text-[14px] leading-[1.6] tracking-[-0.01em] text-mist">
            <li className="py-3">
              When a position falls below the required collateral level, the pool repays its debt and
              receives the collateral at a discount.
            </li>
            <li className="py-3">
              Protocol rewards are distributed to providers on top of liquidation gains.
            </li>
            <li className="py-3">
              There is no rate and no yield from time. A quiet market is a quiet pool, and that is by
              design.
            </li>
          </ul>
        </Panel>
      </div>
    </div>
  )
}
