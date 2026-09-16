import { useEffect } from "react"
import { TransactionReceiptNotFoundError, type Address, type Hex, type PublicClient } from "viem"
import { activeChain } from "./chain"
import { blockTimestamp } from "./history"

/**
 * Transactions sent from this browser, so a wallet can find every one of them again.
 *
 * The history read from logs only holds calls that succeeded and emitted an
 * event the wallet is indexed in. A transaction that reverted emits nothing,
 * and neither does an approval or a test-token mint on the contracts the
 * history reads. Their hashes are kept here as they are submitted, and what
 * happened to each is read back from the chain by its receipt, so the list
 * never says more than the chain does.
 *
 * Cleared with the rest of the wallet's traces when it disconnects; see
 * `clearWalletStorage`.
 */
export const SUBMITTED_STORAGE_PREFIX = "safix.submitted."

/** Enough for a recent-activity list; the oldest entries go as new ones arrive. */
const KEPT = 50

const storageKey = () => `${SUBMITTED_STORAGE_PREFIX}${activeChain.id}`

export type Submission = {
  hash: Hex
  from: Address
  to: Address
  functionName: string
  /** The call's arguments as strings, enough to describe it. */
  args: string[]
  submittedAt: number
}

export type SubmissionStatus = "pending" | "confirmed" | "reverted"

export type SubmittedRow = Submission & {
  status: SubmissionStatus
  block: number | null
  timestamp: number | null
}

const isHex = (value: unknown): value is Hex => typeof value === "string" && /^0x[0-9a-fA-F]+$/.test(value)

// What is read back from storage is checked, not trusted: anything else on this
// origin, or an older shape of this list, is dropped rather than rendered.
const isSubmission = (value: unknown): value is Submission => {
  const entry = value as Partial<Submission> | null
  return (
    Boolean(entry) &&
    isHex(entry?.hash) &&
    entry.hash.length === 66 &&
    isHex(entry.from) &&
    isHex(entry.to) &&
    typeof entry.functionName === "string" &&
    Array.isArray(entry.args) &&
    entry.args.every(arg => typeof arg === "string") &&
    typeof entry.submittedAt === "number"
  )
}

function readAll(): Submission[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(storageKey()) ?? "[]")
    return Array.isArray(parsed) ? parsed.filter(isSubmission) : []
  } catch {
    return []
  }
}

/** The transactions this browser sent from `wallet`, newest first. */
export const readSubmissions = (wallet: Address): Submission[] =>
  readAll().filter(entry => entry.from.toLowerCase() === wallet.toLowerCase())

export function recordSubmission(entry: Submission) {
  try {
    const rest = readAll().filter(existing => existing.hash.toLowerCase() !== entry.hash.toLowerCase())
    window.localStorage.setItem(storageKey(), JSON.stringify([entry, ...rest].slice(0, KEPT)))
  } catch {
    // A storage that refuses writes costs the list this entry. The wallet and
    // the explorer still hold the transaction.
  }
}

type WriteVariables = { address?: Address; functionName?: string; args?: readonly unknown[] } | undefined

/**
 * Records a write the moment the wallet hands back its hash, which is the
 * moment it counts as submitted, whatever becomes of it after.
 */
export function useRecordSubmission(hash: Hex | undefined, variables: WriteVariables, from: Address | undefined) {
  useEffect(() => {
    if (!hash || !from || !variables?.address || !variables.functionName) return
    recordSubmission({
      hash,
      from,
      to: variables.address,
      functionName: variables.functionName,
      args: (variables.args ?? []).map(arg => String(arg)),
      submittedAt: Date.now()
    })
    // Once per hash: the call that produced a hash does not change after it is sent.
  }, [hash])
}

/** Outcomes already read. A receipt in a block does not change, so each is read once. */
const landed = new Map<string, Pick<SubmittedRow, "status" | "block" | "timestamp">>()

/**
 * What became of each submission, read from its receipt. No receipt yet means
 * not confirmed yet; any other failure to read is thrown for the caller to
 * report, rather than shown as an outcome the chain never gave.
 */
export async function readSubmissionStatus(client: PublicClient, entries: Submission[]): Promise<SubmittedRow[]> {
  return Promise.all(
    entries.map(async (entry): Promise<SubmittedRow> => {
      const known = landed.get(entry.hash.toLowerCase())
      if (known) return { ...entry, ...known }
      try {
        const receipt = await client.getTransactionReceipt({ hash: entry.hash })
        const block = Number(receipt.blockNumber)
        const outcome = {
          status: receipt.status === "success" ? ("confirmed" as const) : ("reverted" as const),
          block,
          timestamp: await blockTimestamp(client, block)
        }
        if (outcome.timestamp !== null) landed.set(entry.hash.toLowerCase(), outcome)
        return { ...entry, ...outcome }
      } catch (error) {
        if (error instanceof TransactionReceiptNotFoundError) {
          return { ...entry, status: "pending", block: null, timestamp: null }
        }
        throw error
      }
    })
  )
}
