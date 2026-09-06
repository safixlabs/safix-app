/**
 * Strips anything identifying out of a payload before it leaves the browser.
 *
 * The rule this enforces is the one the issue sets: stack traces and the chain
 * id go out, addresses and balances never do. It is applied to whatever is
 * about to be sent rather than to the call sites, because the call sites are
 * not the only source — an address reaches an error payload through a revert
 * message, a URL, a breadcrumb, a fetch body, a stack frame's local variables,
 * and any of those is enough to identify somebody.
 */

/** `0x` and forty hex digits: an account. */
const ADDRESS = /0x[0-9a-fA-F]{40}\b/g
/** `0x` and sixty-four hex digits: a transaction hash, a slot, a private key. */
const WORD32 = /0x[0-9a-fA-F]{64}\b/g
/** Any other long run of hex, which is how provider keys are usually shaped. */
const LONG_HEX = /\b[0-9a-fA-F]{32,}\b/g
/** Calldata and other unbounded hex blobs. */
const HEX_BLOB = /0x[0-9a-fA-F]{80,}/g
/**
 * A long run of digits, which at this length can only be a token amount.
 *
 * Fifteen is chosen to sit above everything else that legitimately appears in
 * an error: a millisecond timestamp is thirteen digits, a block height nine or
 * ten, a line number a handful. It catches an amount in eighteen decimals from
 * a thousandth upward, and a six decimal amount from a thousand upward. Below
 * that a number is not distinguishable from any other number, and structured
 * amounts are handled instead by redacting bigints wherever they are found.
 */
const LONG_DIGITS = /\b\d{15,}\b/g

export const REDACTED_ADDRESS = "[address]"
export const REDACTED_WORD = "[hash]"
export const REDACTED_KEY = "[key]"
export const REDACTED_DATA = "[data]"
export const REDACTED_AMOUNT = "[amount]"

/**
 * Redacts a string.
 *
 * Order matters: the longest shapes go first, so a blob of calldata is not
 * chopped into a run of separate "addresses" before it is recognised.
 */
export function redactText(value: string): string {
  return value
    .replace(HEX_BLOB, REDACTED_DATA)
    .replace(WORD32, REDACTED_WORD)
    .replace(ADDRESS, REDACTED_ADDRESS)
    .replace(LONG_HEX, REDACTED_KEY)
    .replace(LONG_DIGITS, REDACTED_AMOUNT)
}

/**
 * Removes the query string from a URL, keeping the path.
 *
 * The path is what makes a stack trace readable. The query is where an API key
 * ends up, and the app's RPC endpoint carries one.
 */
export function redactUrl(value: string): string {
  try {
    const url = new URL(value)
    url.search = ""
    url.hash = ""
    return redactText(url.toString())
  } catch {
    return redactText(value)
  }
}

const MAX_DEPTH = 12

/**
 * Identifiers the transport generates and needs back unchanged.
 *
 * These are hex, and hex of exactly the shape a provider key has, so blind
 * redaction rewrites them and the report is rejected as malformed — which is
 * worse than leaking, because nothing arrives and nothing says so. None of
 * them can hold an account: they are minted by the SDK, not read from the app.
 */
const PROTECTED_KEYS = new Set([
  "event_id",
  "trace_id",
  "span_id",
  "parent_span_id",
  "segment_id",
  "replay_id",
  "profile_id",
  "sid",
  "did"
])

/**
 * Walks anything and redacts every string in it, however deeply buried.
 *
 * Keys are redacted as well as values: an object keyed by account address
 * leaks just as surely as one that holds it.
 */
export function redactDeep<T>(value: T, depth = 0): T {
  if (depth > MAX_DEPTH) return "[truncated]" as unknown as T
  if (typeof value === "string") return redactText(value) as unknown as T
  if (typeof value === "bigint") return REDACTED_AMOUNT as unknown as T
  if (value === null || typeof value !== "object") return value
  if (Array.isArray(value)) return value.map(entry => redactDeep(entry, depth + 1)) as unknown as T

  const result: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    result[redactText(key)] = PROTECTED_KEYS.has(key) ? entry : redactDeep(entry, depth + 1)
  }
  return result as unknown as T
}
