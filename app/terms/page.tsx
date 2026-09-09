import { PageHeader, Panel } from "@/components/ui"
import { pageMetadata } from "@/lib/metadata"

export const metadata = pageMetadata(
  "/terms/",
  "The rules that apply when you use the Safix interface. Short, and written to be read."
)

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
    title: "What is collected",
    body: "Two things, both of which can be switched off by whoever deploys this interface, and neither of which carries an address. When something fails, the stack trace, the browser, and the chain being used are sent to an error tracker hosted in the European Union; wallet addresses, balances, amounts, transaction hashes and query strings are stripped before the report leaves your browser, and no cookie or account identifier is attached. Separately, page views and named steps such as \"a deposit was started\" are counted by a cookieless analytics service, carrying only the chain and the collateral ticker."
  },
  {
    title: "What is never collected",
    body: "No names, no emails, no wallet addresses, no balances, no amounts, and nothing that follows you between sessions. Nothing is sold or shared for advertising. Your wallet address is visible to the public chain by nature, not by us, and this interface does not report it anywhere."
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
