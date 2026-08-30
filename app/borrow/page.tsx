"use client"

import { useMemo, useState } from "react"
import { Field, HealthBar, PageHeader, Panel, PrimaryButton } from "@/components/ui"
import { collateralAssets, originationFeeRate, usd } from "@/lib/demo"

export default function BorrowPage() {
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
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Borrow"
        lead="Lock a tokenized asset, draw USDC, pay one fee at the door. The debt you see at draw is the debt you repay."
      />

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
                    className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3.5 text-left transition-colors ${
                      selected
                        ? "border-mint bg-carbon/60"
                        : "border-line bg-carbon/30 hover:border-haze"
                    }`}
                  >
                    <span>
                      <span className="block text-[14.5px] font-semibold tracking-[-0.01em] text-fog">
                        {candidate.symbol}
                      </span>
                      <span className="mt-0.5 block text-[12px] tracking-[-0.02em] text-haze">
                        {candidate.name} · {candidate.kind}
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

        <Panel title="Draw USDC">
          <div className="flex flex-col gap-4">
            <div className="flex gap-2.5">
              <Field
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
                className="shrink-0 rounded-2xl border border-line px-4 text-[13px] font-medium text-mist transition-colors hover:border-mint hover:text-mint"
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
              {overCapacity ? "Exceeds capacity" : "Draw USDC"}
            </PrimaryButton>

            {drawn ? (
              <p className="text-center text-[12.5px] tracking-[-0.02em] text-mint">
                Demo draw recorded. Nothing moves onchain yet.
              </p>
            ) : (
              <p className="text-center text-[12.5px] tracking-[-0.02em] text-haze">
                No time-based cost. Repay {draw > 0 ? usd(debtAfter) : "the drawn amount"} whenever
                you choose.
              </p>
            )}
          </div>
        </Panel>
      </div>
    </div>
  )
}
