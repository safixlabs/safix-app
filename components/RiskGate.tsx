"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import Portal from "./Portal"
import { PrimaryButton } from "./ui"

const STORAGE_KEY = "safix.risk.acknowledged"

export function hasAcknowledgedRisk() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

export default function RiskGate({ open, onAccept, onDismiss }: { open: boolean; onAccept: () => void; onDismiss: () => void }) {
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (!open) setChecked(false)
  }, [open])

  if (!open) return null

  const accept = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1")
    } catch {}
    onAccept()
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-carbon/80 p-5 backdrop-blur-sm">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="risk-gate-title"
          className="max-h-[85vh] w-full max-w-[460px] overflow-y-auto rounded-[3px] border border-line bg-panel p-6"
        >
          <h2 id="risk-gate-title" className="text-[19px] font-bold tracking-[-0.01em] text-fog">
            Before you connect
          </h2>
          <p className="mt-3 text-[14px] leading-[1.65] tracking-[-0.01em] text-mist">
            Safix lends against tokenized securities. Collateral can be liquidated without warning, price
            feeds can fail, and the contracts have not completed an independent security audit.
          </p>
          <ul className="mt-4 flex flex-col gap-2 text-[13.5px] leading-[1.6] tracking-[-0.01em] text-mist">
            <li>· Liquidation is permanent and can happen at any hour.</li>
            <li>· In a partnership, genuine losses fall on the capital.</li>
            <li>· Availability depends on your jurisdiction and the asset issuer.</li>
          </ul>
          <label className="mt-5 flex cursor-pointer items-start gap-2.5 text-[13px] leading-[1.55] tracking-[-0.01em] text-mist">
            <input
              type="checkbox"
              checked={checked}
              onChange={event => setChecked(event.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 accent-mint"
            />
            <span>
              I have read the <Link href="/risk/" className="text-mint hover:text-mint-bright">risk disclosure</Link> and
              the <Link href="/terms/" className="text-mint hover:text-mint-bright">terms of use</Link>, and I am
              permitted to use this interface where I live.
            </span>
          </label>
          <div className="mt-6 flex items-center gap-3">
            <PrimaryButton disabled={!checked} onClick={accept} className="flex-1">
              Continue
            </PrimaryButton>
            <button
              onClick={onDismiss}
              className="rounded-[3px] border border-line px-5 py-3 text-[13px] font-medium tracking-[-0.01em] text-mist transition-colors hover:border-mint hover:text-mint"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
