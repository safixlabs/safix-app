import type { Metadata } from "next"
import { PageHeader, Panel } from "@/components/ui"

export const metadata: Metadata = { title: "Risk" }

const risks = [
  {
    title: "Liquidation",
    body: "Collateral is valued from a price feed. If its value falls below the required level, part of the collateral is sold into the pool at a discount to cover the debt. This can happen at any hour, without warning, and the loss is permanent."
  },
  {
    title: "Price feed failure",
    body: "Valuation depends on an external oracle. If a feed stalls, returns an invalid price, or the network sequencer is down, the protocol refuses to draw or liquidate until it recovers. Positions can be stuck in that window."
  },
  {
    title: "Smart contract risk",
    body: "The contracts are new. They carry tests, invariants and static analysis, and they have not completed an independent security audit. Assume software can fail and do not deposit funds you cannot afford to lose."
  },
  {
    title: "Collateral issuer risk",
    body: "Tokenized assets are claims on an issuer. If the issuer freezes transfers, fails to honour redemptions, or the legal wrapper breaks, the token can lose its value regardless of what the price feed reports."
  },
  {
    title: "Partnership losses fall on capital",
    body: "In profit and loss sharing, the operator runs the capital and the funders carry genuine losses. There is no principal protection and no guaranteed return."
  },
  {
    title: "Liquidity",
    body: "Withdrawals are served from idle liquidity. When most of the pool is deployed to loans, a withdrawal may have to wait until borrowers repay or positions are liquidated."
  },
  {
    title: "No interest, not no cost",
    body: "Nothing accrues with time, but drawing costs a one-time origination fee and closing costs a redemption fee. Those fees are charged whether the position is profitable or not."
  }
]

export default function RiskPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Risk disclosure"
        lead="Safix lends against tokenized securities. Read this before connecting a wallet or signing anything."
        badge="Please read"
      />
      <div className="grid gap-4 md:grid-cols-2">
        {risks.map(risk => (
          <Panel key={risk.title} title={risk.title}>
            <p className="text-[14px] leading-[1.65] tracking-[-0.01em] text-mist">{risk.body}</p>
          </Panel>
        ))}
      </div>
      <p className="text-[13px] leading-[1.6] tracking-[-0.02em] text-haze">
        Nothing here is investment advice. Availability depends on where you live and on the rules of
        the asset issuer; some tokenized equities are not available to US persons. You are responsible
        for confirming that using this interface is lawful for you.
      </p>
    </div>
  )
}
