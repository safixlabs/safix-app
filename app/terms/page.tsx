import type { Metadata } from "next"
import { PageHeader, Panel } from "@/components/ui"

export const metadata: Metadata = { title: "Terms" }

const sections = [
  {
    title: "What this interface is",
    body: "This is a front end for a set of public smart contracts. It holds no funds, takes no custody, and cannot move anything without a signature from your own wallet. Every action you take settles onchain and is final."
  },
  {
    title: "No advice, no guarantee",
    body: "Nothing presented here is investment, legal or tax advice. Figures shown are read from the contracts or from price feeds and can be stale or wrong. The interface is provided as is, without warranty of any kind."
  },
  {
    title: "Your responsibility",
    body: "You are responsible for the security of your wallet, for confirming that using this interface is lawful where you live, and for the consequences of every transaction you sign, including liquidation."
  },
  {
    title: "Availability",
    body: "The interface may be unavailable, paused, or changed at any time. The underlying contracts may be paused by their guardian in an emergency; withdrawals and repayments stay open when that happens."
  },
  {
    title: "Privacy",
    body: "The interface does not collect names, emails or wallet addresses. Errors are reported without addresses or balances, and analytics are limited to anonymous page views. Your wallet address is visible to the public chain by nature, not by us."
  },
  {
    title: "Jurisdiction",
    body: "Tokenized equities carry issuer restrictions. Some are unavailable to US persons and to residents of sanctioned jurisdictions. By using this interface you confirm that you are permitted to hold the assets you interact with."
  }
]

export default function TermsPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Terms of use"
        lead="The rules that apply when you use this interface. Short, and written to be read."
        badge="Legal"
      />
      <div className="flex flex-col gap-4">
        {sections.map(section => (
          <Panel key={section.title} title={section.title}>
            <p className="text-[14px] leading-[1.65] tracking-[-0.01em] text-mist">{section.body}</p>
          </Panel>
        ))}
      </div>
      <p className="text-[13px] leading-[1.6] tracking-[-0.02em] text-haze">
        These terms are a working draft pending legal review before public launch.
      </p>
    </div>
  )
}
