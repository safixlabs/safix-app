"use client"

import { useState } from "react"
import { Check, PageHeader, Panel, PrimaryButton, Stat } from "@/components/ui"
import { passport } from "@/lib/demo"

export default function PassportPage() {
  const [copied, setCopied] = useState(false)

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Credit passport"
        lead="A reusable private proof of your borrowing power. Counterparties see that the requirements are met, never the portfolio behind the proof."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Status" value="Active" hint={`Issued ${passport.issued}`} />
        <Stat label="Attestations in force" value={String(passport.attestations)} hint={`Passport ${passport.id}`} />
        <Stat label="Holdings disclosed" value="0%" hint="Eligibility signals only" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Panel title="What this passport proves">
          <ul className="flex flex-col divide-y divide-line">
            {passport.checks.map(check => (
              <li key={check} className="flex items-center gap-3.5 py-3.5">
                <Check />
                <span className="text-[14.5px] leading-snug tracking-[-0.01em] text-mist">{check}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Share a proof">
          <p className="text-[14px] leading-[1.65] tracking-[-0.01em] text-mist">
            Hand a counterparty a single attestation instead of your account history. The proof
            confirms the five checks on the left and reveals nothing else, and it works on any
            integrated platform without repeating verification.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <PrimaryButton
              onClick={() => setCopied(true)}
              className="w-full"
            >
              Copy proof link
            </PrimaryButton>
            <p className="text-center text-[12.5px] tracking-[-0.02em] text-haze">
              {copied ? "Demo proof copied. Verification is not live yet." : "Proofs expire and can be revoked at any time."}
            </p>
          </div>
        </Panel>
      </div>
    </div>
  )
}
