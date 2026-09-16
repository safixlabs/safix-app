/**
 * Every reason a Safix contract reverts with, and the sentence a person sees for it.
 *
 * One entry per distinct string in `require` and `revert` across the contracts, the
 * test tokens and price feed included, since those are what the testnet runs on. The
 * checked-in list in `e2e/revert-reasons.json` records which contract commit these
 * came from, and `e2e/revert-reasons.spec.ts` fails if a reason is missing here, is
 * here without being in the contracts, or resolves to anybody else's sentence.
 *
 * Several reasons contain another one (`zero owner` contains `zero`, `fee too high`
 * contains `too high`). An extracted reason is looked up exactly, and when only a raw
 * message is available the longest reason inside it wins, so declaration order here
 * never decides which sentence is shown.
 */
export const contractMessages: Record<string, string> = {
  // Borrowing
  "exceeds ltv": "That amount is above what this collateral can support. Lower the amount or lock more collateral.",
  "would break ltv": "Withdrawing that much would push the position past its borrowing limit.",
  "close position instead": "Close the position to withdraw the last of the collateral.",
  "position too small":
    "That would leave the position below the minimum debt. Draw more, or repay the debt in full.",
  "no position": "There is no position in this asset to close.",
  "passport required": "This wallet needs a complete credit passport before it can draw.",
  "asset cap": "Borrowing against this asset has reached its limit. Try a smaller amount or another asset.",
  "global cap": "The protocol has reached its total borrowing limit. Try a smaller amount.",
  "collateral cap": "This asset has reached its collateral limit. Try locking a smaller amount.",
  "asset off": "That asset is not enabled as collateral.",
  illiquid: "The pool does not have enough available liquidity for that right now.",

  // Pauses
  "deposits paused": "Deposits into the pool are paused right now.",
  "draws paused": "New draws are paused right now. Repaying and closing a position still work.",
  "liquidations paused": "Liquidations are paused right now.",
  "funding paused": "Funding partnerships is paused right now.",
  "nothing to pause": "Choose at least one action to pause.",
  "nothing to unpause": "Choose at least one action to resume.",

  // Prices
  "stale price": "The price feed for this asset is stale, so the protocol is refusing to act on it. Try again once it updates.",
  "feed unavailable": "The price feed for this asset is not answering, so the protocol is refusing to act on it until it does.",
  "feed down": "The price feed itself is down, so no price can be read from it right now.",
  "bad feed answer": "The price feed returned an invalid price. Drawing is paused until it recovers.",
  "bad feed decimals": "That price feed reports more decimals than the protocol can read.",
  "sequencer down": "The network's sequencer is down, so prices cannot be trusted until it is back.",
  "sequencer grace period":
    "The network's sequencer has only just come back, so prices are held for a short grace period before the protocol acts on them.",
  "price below band": "The price for this asset is below the range the protocol accepts, so it is refusing to act on it.",
  "price above band": "The price for this asset is above the range the protocol accepts, so it is refusing to act on it.",
  "price jump": "The price for this asset moved further in one step than the protocol allows, so it is refusing to act on it.",
  "not price updater": "Only the price updater can set prices.",

  // Liquidations and bad debt
  healthy: "That position is healthy, so it cannot be liquidated.",
  "pool too small": "The pool is too small to absorb that liquidation.",
  "no dust threshold": "No minimum position size is set, so nothing counts as dust to write off.",
  "not dust": "That position is worth too much to be written off as dust.",

  // Partnerships
  "reporting before funding ends": "The reporting deadline has to fall after the funding deadline.",
  "no operator": "A partnership needs an operator address.",
  "bad share": "The operator's share cannot be more than the whole profit.",
  "no goal": "A partnership needs a funding goal above zero.",
  "not funding": "This partnership is no longer in its funding stage.",
  "past deadline": "The funding deadline for this partnership has passed.",
  unfunded: "Nobody has funded this partnership, so it cannot start.",
  "not active": "This partnership is not active.",
  "needs audit": "Settlement is waiting for the auditor's approval.",
  "before deadline": "This partnership cannot be declared in default before its reporting deadline.",
  "capital returned": "This partnership has returned its capital, so it cannot be declared in default.",
  "not claimable": "This partnership has not been settled, cancelled or declared in default yet.",
  "nothing to claim": "There is nothing left to claim here.",
  "not settled": "The operator's share can only be claimed once the partnership has settled.",
  paid: "The operator's share has already been paid.",
  "not operator": "Only this partnership's operator can do that.",
  "not auditor": "Only the auditor can approve a settlement.",

  // Passport
  "not a single check": "Choose exactly one passport check.",
  "bad mask": "That set of passport checks is not valid.",
  "not attester": "Only an approved attester can write attestations.",

  // Protocol settings
  "fee too high": "That fee is above the maximum the protocol allows.",
  "share too high": "That share of fees for the reserve is above the maximum the protocol allows.",
  "too high": "That liquidation incentive is above the maximum the protocol allows.",
  "bad deviation": "That price movement limit is above the maximum the protocol allows.",
  "bad band": "That price range is invalid: its floor is above its ceiling.",
  "bad config": "That asset setting is invalid: the borrowing limit has to sit below the liquidation threshold.",

  // Roles
  "not owner": "Only the protocol owner can do that.",
  "not timelock": "That change has to go through the timelock.",
  "not guardian": "Only the guardian can pause the protocol.",
  "not admin": "Only the timelock admin can do that.",
  "zero owner": "The new owner cannot be the zero address.",
  "zero admin": "The timelock admin cannot be the zero address.",

  // Timelock
  "zero target": "A queued change needs a contract to call.",
  "already queued": "That change is already queued in the timelock.",
  "not queued": "That change is not queued in the timelock.",
  "too early": "The timelock delay for that change has not passed yet.",
  expired: "That queued change missed its window and has to be queued again.",
  "delay too short": "That timelock delay is below the minimum allowed.",

  // Tokens and amounts
  "transfer failed": "A token transfer failed. Check your balance and approval.",
  allowance: "The approval is too small for that amount. Approve again and retry.",
  balance: "That is more than the wallet holds.",
  "bad amount": "That amount is outside what this action allows.",
  reentrancy: "The protocol rejected a re-entrant call.",
  zero: "Enter an amount above zero."
}

/** Longest first, so a reason that contains another is always tried before it. */
const reasonsBySpecificity = Object.keys(contractMessages).sort((a, b) => b.length - a.length)

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
  const extracted = reverted?.[1].trim().toLowerCase().replace(/\.$/, "")
  if (extracted && contractMessages[extracted]) return contractMessages[extracted]

  const candidate = (extracted ?? raw).toLowerCase()
  const key = reasonsBySpecificity.find(reason => candidate.includes(reason))
  if (key) return contractMessages[key]

  const shortMessage = (error as { shortMessage?: string })?.shortMessage
  return shortMessage ?? raw.split("\n")[0].slice(0, 160)
}
