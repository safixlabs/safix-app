import { useSyncExternalStore } from "react"

type Health = {
  /** True once a read has failed and nothing has succeeded since. */
  failing: boolean
  /** When a read last came back, so the screen can say how old its figures are. */
  lastGood: number
}

/**
 * Also the server's answer, and the same object every time it is asked for.
 * useSyncExternalStore compares snapshots by identity, so a fresh object per
 * call is an infinite render loop rather than a fresh reading.
 */
const initialState: Health = { failing: false, lastGood: 0 }

let state: Health = initialState
const listeners = new Set<() => void>()

const publish = (next: Health) => {
  if (next.failing === state.failing && next.lastGood === state.lastGood) return
  state = next
  for (const listener of listeners) listener()
}

/**
 * Called by the screens that read the chain outside react-query, so a failure
 * there is as visible as a failure inside it.
 */
export const reportReadFailure = () => publish({ ...state, failing: true })
export const reportReadSuccess = () => publish({ failing: false, lastGood: Date.now() })

/** Used by the cache watcher, which sees every wagmi read at once. */
export const reportCacheHealth = (failing: boolean, lastGood: number) =>
  publish({ failing, lastGood: Math.max(lastGood, state.lastGood) })

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const snapshot = () => state
const serverSnapshot = () => initialState

/**
 * Whether the chain is answering.
 *
 * Kept outside react-query because two of the screens read through a plain
 * client rather than a query, and a person looking at frozen numbers does not
 * care which of the two failed.
 */
export const useReadHealth = () => useSyncExternalStore(subscribe, snapshot, serverSnapshot)
