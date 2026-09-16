import { useEffect, useRef, useState } from "react"
import type { Address } from "viem"
import { useAccount, usePublicClient } from "wagmi"
import { activeChain } from "./chain"
import { reportReadFailure, reportReadSuccess } from "./health"
import { readHistory, type HistoryResult } from "./history"
import { reportError } from "./monitoring"
import { useVisibleInterval } from "./polling"
import { poolAddress } from "./safix"
import { readSubmissionStatus, readSubmissions, type SubmittedRow } from "./submitted"

export type HistoryState = "idle" | "loading" | "ready" | "failed"

export type WalletHistory = HistoryResult & {
  /** Transactions this browser sent from the wallet, with what the chain says became of them. */
  submitted: SubmittedRow[]
}

/**
 * The connected wallet's history, kept current.
 *
 * Read on the same terms as every other screen: re-read on the refresh
 * interval only while the tab is visible, and a failed read is both reported
 * and fed to the read health the network notice watches. A refresh that fails
 * keeps the rows already on screen; only a first read with nothing to show is
 * shown as failed.
 *
 * `names` narrows the read to those events. Pass a constant, not a fresh array
 * per render, or every render starts a new read. `withSubmitted` adds the
 * transactions sent from this browser, which is what finds the ones that left
 * no event behind.
 */
export function useWalletHistory(
  panel: string,
  { names, withSubmitted = false }: { names?: readonly string[]; withSubmitted?: boolean } = {}
) {
  const { address } = useAccount()
  // Pinned to the chain Safix runs on, like every other read: the wallet's
  // network decides what it can sign, never where the history is read from.
  const client = usePublicClient({ chainId: activeChain.id })
  const refresh = useRef<(() => void) | undefined>(undefined)
  useVisibleInterval(() => refresh.current?.())
  const [result, setResult] = useState<WalletHistory | null>(null)
  const [state, setState] = useState<HistoryState>("idle")

  useEffect(() => {
    let cancelled = false
    setResult(null)
    if (!client || !address || !poolAddress) {
      setState("idle")
      return
    }
    setState("loading")
    const run = () =>
      Promise.all([
        readHistory(client, address as Address, { names }),
        withSubmitted ? readSubmissionStatus(client, readSubmissions(address as Address)) : Promise.resolve([])
      ])
        .then(([history, submitted]) => {
          if (cancelled) return
          setResult({ ...history, submitted })
          setState("ready")
          reportReadSuccess()
        })
        .catch(error => {
          reportError(error, { screen: "history", panel })
          reportReadFailure()
          if (!cancelled) setState(current => (current === "ready" ? current : "failed"))
        })
    run()
    refresh.current = run
    return () => {
      cancelled = true
      refresh.current = undefined
    }
  }, [client, address, names, withSubmitted, panel])

  return { result, state }
}
