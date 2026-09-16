"use client"

import Link from "next/link"
import { useCallback, useEffect, useId, useRef, useState } from "react"
import Portal from "./Portal"
import { GhostButton, PrimaryButton, Reason } from "./ui"

const STORAGE_KEY = "safix.risk.acknowledged"

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function hasAcknowledgedRisk() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

export default function RiskGate({ open, onAccept, onDismiss }: { open: boolean; onAccept: () => void; onDismiss: () => void }) {
  const [checked, setChecked] = useState(false)
  const reasonId = useId()
  const dialogRef = useRef<HTMLDivElement | null>(null)

  // The dialog renders through a portal that mounts in an effect of its own, so
  // the node does not exist on the frame the gate opens. A ref callback runs the
  // moment it does, and a stable one runs only then.
  const attach = useCallback((node: HTMLDivElement | null) => {
    dialogRef.current = node
    node?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
  }, [])

  useEffect(() => {
    if (!open) setChecked(false)
  }, [open])

  // Nothing behind the gate should be reachable while it is open, and the wallet button
  // gets the focus back when it closes.
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    const items = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onDismiss()
        return
      }
      if (event.key !== "Tab") return
      const focusable = items()
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      const inside = dialogRef.current?.contains(active ?? null)
      if (event.shiftKey && (active === first || !inside)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || !inside)) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", onKeyDown, true)
    return () => {
      document.removeEventListener("keydown", onKeyDown, true)
      opener?.focus()
    }
  }, [open, onDismiss])

  if (!open) return null

  const accept = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1")
    } catch {}
    onAccept()
  }

  // Rendered into the body: the gate lives inside the header, whose backdrop-filter
  // makes it the containing block for fixed children, which pinned the dialog inside
  // the navigation bar instead of over the page.
  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-carbon/80 p-5 backdrop-blur-sm">
        <div
          ref={attach}
          role="dialog"
          aria-modal="true"
          aria-labelledby="risk-gate-title"
          aria-describedby="risk-gate-body"
          className="max-h-[85vh] w-full max-w-[460px] overflow-y-auto rounded-[3px] border border-line bg-panel p-5 sm:p-6"
        >
          <h2 id="risk-gate-title" className="text-[19px] font-bold tracking-[-0.01em] text-fog">
            Before you connect
          </h2>
          <p id="risk-gate-body" className="mt-3 text-[14px] leading-[1.65] tracking-[-0.01em] text-mist">
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
              className="mt-0.5 h-4 w-4 accent-mint"
            />
            <span>
              I have read the <Link href="/risk/" className="text-mint hover:text-mint-bright">risk disclosure</Link> and
              the <Link href="/terms/" className="text-mint hover:text-mint-bright">terms of use</Link>, and I am
              permitted to use this interface where I live.
            </span>
          </label>
          <div className="mt-6 flex items-center gap-3">
            <PrimaryButton
              disabled={!checked}
              aria-describedby={checked ? undefined : reasonId}
              onClick={accept}
              className="flex-1"
            >
              Continue
            </PrimaryButton>
            <GhostButton onClick={onDismiss} className="self-stretch">
              Cancel
            </GhostButton>
          </div>
          {checked ? null : (
            <div className="mt-3">
              <Reason id={reasonId}>Tick the box above to continue.</Reason>
            </div>
          )}
        </div>
      </div>
    </Portal>
  )
}
