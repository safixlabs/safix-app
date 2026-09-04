const contractMessages: Record<string, string> = {
  "exceeds ltv": "That amount is above what this collateral can support. Lower the amount or lock more collateral.",
  "would break ltv": "Withdrawing that much would push the position past its borrowing limit.",
  "close position instead": "Close the position to withdraw the last of the collateral.",
  "stale price": "The price feed for this asset is stale, so the protocol is refusing to act on it. Try again once it updates.",
  "bad feed answer": "The price feed returned an invalid price. Drawing is paused until it recovers.",
  "bad feed round": "The price feed returned an incomplete round. Drawing is paused until it recovers.",
  illiquid: "The pool does not have enough available liquidity for that right now.",
  "passport required": "This wallet needs a complete credit passport before it can draw.",
  "needs audit": "Settlement is waiting for the auditor's approval.",
  healthy: "That position is not liquidatable.",
  "pool too small": "The pool is too small to absorb that liquidation.",
  "asset off": "That asset is not enabled as collateral.",
  "not owner": "Only the protocol owner can do that.",
  "not price updater": "Only the price updater can set prices.",
  "not attester": "Only an approved attester can write attestations.",
  "not auditor": "Only the auditor can approve a settlement.",
  "not operator": "Only the partnership operator can report a return.",
  "not funding": "This partnership is no longer open for funding.",
  "past deadline": "The funding deadline for this partnership has passed.",
  "not claimable": "This partnership has not been settled or cancelled yet.",
  "nothing to claim": "There is nothing left to claim here.",
  "bad amount": "That amount is outside what this action allows.",
  "transfer failed": "A token transfer failed. Check your balance and approval.",
  allowance: "The approval is too small for that amount. Approve again and retry.",
  balance: "That is more than the wallet holds.",
  reentrancy: "The protocol rejected a re-entrant call.",
  zero: "Enter an amount above zero."
}

const walletPatterns: [RegExp, string][] = [
  [/user rejected|user denied|rejected the request/i, "You cancelled the request in your wallet."],
  [/insufficient funds/i, "Not enough ETH in the wallet to pay for gas."],
  [/chain mismatch|does not match the target chain/i, "Your wallet is on a different network. Switch networks and try again."],
  [/nonce too low|already known|replacement transaction underpriced/i, "A transaction is already in flight from this wallet. Wait for it to settle."],
  [/timeout|timed out/i, "The network did not respond in time. The transaction may still land, check the explorer."],
  [/fetch failed|network request failed|failed to fetch/i, "Could not reach the network. Check your connection and retry."]
]

export const isUserRejection = (error: unknown) =>
  /user rejected|user denied|rejected the request/i.test(readMessage(error))

function readMessage(error: unknown): string {
  if (!error) return ""
  if (typeof error === "string") return error
  const candidate = error as { shortMessage?: string; details?: string; message?: string; cause?: unknown }
  const parts = [candidate.shortMessage, candidate.details, candidate.message]
    .filter(Boolean)
    .join(" ")
  const nested = candidate.cause ? readMessage(candidate.cause) : ""
  return `${parts} ${nested}`.trim()
}

export function humanError(error: unknown): string {
  const raw = readMessage(error)
  if (!raw) return "Something went wrong. Try again."

  for (const [pattern, message] of walletPatterns) {
    if (pattern.test(raw)) return message
  }

  const reverted = raw.match(/reverted with(?: the following)? reason:?\s*["']?([^"'\n]+)/i)
  const candidate = (reverted?.[1] ?? raw).trim().toLowerCase()
  for (const [key, message] of Object.entries(contractMessages)) {
    if (candidate.includes(key)) return message
  }

  const shortMessage = (error as { shortMessage?: string })?.shortMessage
  return shortMessage ?? raw.split("\n")[0].slice(0, 160)
}
