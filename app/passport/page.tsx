"use client"

import { useAccount, useReadContract } from "wagmi"
import { Check, NotDeployed, PageHeader, Panel, Stat } from "@/components/ui"
import { activeChain } from "@/lib/chain"
import { deploymentLabel, passportChecks, registryAbi, registryAddress } from "@/lib/safix"

function PendingMark() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="h-4 w-4 shrink-0">
      <circle cx="8" cy="8" r="7" fill="none" stroke="#2b3d39" strokeWidth="1.4" />
    </svg>
  )
}

function LivePassport() {
  const { address } = useAccount()
  // Pinned to the chain Safix runs on; see the note in app/pool/page.tsx.
  const record = useReadContract({
    chainId: activeChain.id,
    abi: registryAbi,
    address: registryAddress,
    functionName: "checkMaskOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) }
  })
  const eligible = useReadContract({
    chainId: activeChain.id,
    abi: registryAbi,
    address: registryAddress,
    functionName: "isEligible",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) }
  })

  const mask = record.data?.[0] ?? 0
  const expiry = record.data?.[1] ?? 0n
  const passed = passportChecks.filter((_, index) => (mask & (1 << index)) !== 0).length

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Status"
          value={!address ? "–" : eligible.data ? "Eligible" : "Incomplete"}
          hint={
            !address
              ? "Connect a wallet"
              : expiry > 0n
                ? `Expires ${new Date(Number(expiry) * 1000).toLocaleDateString("en-US")}`
                : "No expiry set"
          }
        />
        <Stat label="Checks passed" value={address ? `${passed}/${passportChecks.length}` : "–"} hint="Attested onchain" />
        <Stat label="Holdings disclosed" value="0%" hint="Eligibility signals only" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr] [&>*]:min-w-0">
        <Panel title="What this passport proves">
          <ul className="flex flex-col divide-y divide-line">
            {passportChecks.map((check, index) => {
              const done = (mask & (1 << index)) !== 0
              return (
                <li key={check} className="flex items-center gap-3.5 py-3.5">
                  {done ? <Check /> : <PendingMark />}
                  <span
                    className={`text-[14.5px] leading-snug tracking-[-0.01em] ${done ? "text-mist" : "text-haze"}`}
                  >
                    {check}
                    <span className="sr-only">. {done ? "Attested" : "Not attested yet"}</span>
                  </span>
                </li>
              )
            })}
          </ul>
        </Panel>

        <Panel title="How attestation works">
          <p className="text-[14px] leading-[1.65] tracking-[-0.01em] text-mist">
            An approved attester verifies the five checks off chain and writes a single bitmask to the
            passport registry. The pool can require a complete passport before any draw, and lenders
            never see the data behind the checks, only that they passed.
          </p>
          <p className="mt-4 text-[12.5px] tracking-[-0.02em] text-haze">
            {address
              ? eligible.data
                ? "This wallet holds a complete passport and can draw wherever the gate is enabled."
                : "This wallet has no complete passport yet. Attestation runs through the registry."
              : "Connect a wallet to check its passport."}
          </p>
        </Panel>
      </div>
    </>
  )
}

export default function PassportPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Credit passport"
        lead="A reusable private proof of your borrowing power. Counterparties see that the requirements are met, never the portfolio behind the proof."
        badge={deploymentLabel}
      />
      {registryAddress ? <LivePassport /> : <NotDeployed chainName={activeChain.name} />}
    </div>
  )
}
