"use client"

import { useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useAccount, useAccountEffect } from "wagmi"
import { clearWalletStorage } from "@/lib/wagmi"

/**
 * Keeps what is on screen honest about who is connected.
 *
 * Contract reads are cached by react-query. Two of those caches outlive the
 * account that filled them: a query whose `enabled` flips to false when the
 * wallet disconnects keeps its last data, and a query re-enabled for a second
 * account can serve the first account's values from cache. Both show a number
 * that belongs to somebody else, so every cached read is dropped whenever the
 * account or the chain changes. Mounted reads refetch immediately; nothing
 * stale survives the switch.
 */
export default function WalletSync() {
  const { address, chainId } = useAccount()
  const queryClient = useQueryClient()
  const identity = `${address ?? ""}:${chainId ?? ""}`
  const previous = useRef<string | null>(null)

  useEffect(() => {
    if (previous.current === null) {
      previous.current = identity
      return
    }
    if (previous.current === identity) return
    previous.current = identity
    queryClient.removeQueries()
  }, [identity, queryClient])

  useAccountEffect({
    onDisconnect() {
      queryClient.removeQueries()
      // wagmi persists the connection asynchronously, so clear once now for the
      // synchronous part and once after it settles for the rest.
      clearWalletStorage()
      setTimeout(clearWalletStorage, 50)
    }
  })

  return null
}
