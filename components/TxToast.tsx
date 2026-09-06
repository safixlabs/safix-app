"use client"

import { useEffect, useState } from "react"
import { explorerTxUrl } from "@/lib/chain"
import { humanError, isUserRejection } from "@/lib/errors"

export type TxState = {
  hash?: `0x${string}`
  isPending: boolean
  isConfirming: boolean
  isSuccess: boolean
  error: unknown
  label?: string
}

type Phase = "signing" | "pending" | "confirmed" | "failed" | "cancelled"

const phaseCopy: Record<Phase, string> = {
  signing: "Waiting for your wallet",
  pending: "Submitted, waiting for confirmation",
  confirmed: "Confirmed onchain",
  failed: "Transaction failed",
  cancelled: "Request cancelled"
}

function phaseOf(state: TxState): Phase | null {
  if (state.error) return isUserRejection(state.error) ? "cancelled" : "failed"
  if (state.isPending) return "signing"
  if (state.isConfirming) return "pending"
  if (state.isSuccess) return "confirmed"
  return null
}

function Dot({ phase }: { phase: Phase }) {
  if (phase === "confirmed") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden className="h-4 w-4 shrink-0 text-mint">
        <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M4.8 8.3 7 10.4l4.2-4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (phase === "failed" || phase === "cancelled") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden className="h-4 w-4 shrink-0 text-haze">
        <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
      <span className="absolute h-2 w-2 animate-ping rounded-full bg-mint opacity-60" />
      <span className="h-2 w-2 rounded-full bg-mint" />
    </span>
  )
}

export function TxToast(state: TxState) {
  const phase = phaseOf(state)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const key = `${phase}:${state.hash ?? ""}:${state.error ? "e" : ""}`

  useEffect(() => {
    setDismissed(null)
  }, [key])

  useEffect(() => {
    if (phase !== "confirmed" && phase !== "cancelled") return
    const timer = setTimeout(() => setDismissed(key), 6000)
    return () => clearTimeout(timer)
  }, [phase, key])

  const url = explorerTxUrl(state.hash)
  const detail = state.error
    ? humanError(state.error)
    : state.label ?? "This is the only step, nothing accrues while you wait."
  const visible = phase !== null && dismissed !== key
  const announcement = phase ? `${phaseCopy[phase]}. ${detail}` : ""

  // The live regions stay mounted and empty so a screen reader is already listening when
  // a transaction changes state; a region that appears with its text is often missed.
  return (
    <>
      <div role="status" aria-live="polite" className="sr-only">
        {phase && phase !== "failed" ? announcement : ""}
      </div>
      <div role="alert" className="sr-only">
        {phase === "failed" ? announcement : ""}
      </div>
      {visible && phase ? (
        <div
          data-testid="tx-status"
          className="fixed bottom-5 right-5 z-50 w-[min(320px,calc(100vw-2.5rem))] rounded-[4px] border border-line bg-panel p-4 shadow-lg"
        >
          <div className="flex items-start gap-3">
            <Dot phase={phase} />
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold tracking-[-0.01em] text-fog">{phaseCopy[phase]}</p>
              <p className="mt-1 text-[12.5px] leading-[1.5] tracking-[-0.01em] text-mist">{detail}</p>
              {url ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-[12.5px] text-mint transition-colors hover:text-mint-bright"
                >
                  View on explorer <span aria-hidden>↗</span>
                  <span className="sr-only">, opens in a new tab</span>
                </a>
              ) : null}
            </div>
            <button
              onClick={() => setDismissed(key)}
              aria-label="Dismiss transaction status"
              className="-m-1 flex h-6 w-6 shrink-0 items-center justify-center text-haze transition-colors hover:text-fog"
            >
              <svg viewBox="0 0 16 16" aria-hidden className="h-3.5 w-3.5">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}
