/**
 * How old a price is, said the way a person would say it, and whether the pool
 * will still act on it.
 *
 * The limit is the asset's own `maxPriceAge`, read from the pool's price guard.
 * It is never a number repeated here: the guards differ per asset — an hour for
 * one, a day for another — and can be changed on chain without this interface
 * being rebuilt. An asset with no guard configured has no limit, and this says
 * how old its price is without pretending to know when it goes bad.
 */

const fraction = (raw: string | undefined, fallback: number) => {
  const parsed = Number.parseFloat(raw ?? "")
  return Number.isFinite(parsed) && parsed > 0 && parsed < 1 ? parsed : fallback
}

/**
 * How far into its allowed age a price has to be before the screen says so,
 * as a fraction of the asset's own limit. The warning has to arrive before the
 * refusal does, not with it. Set `NEXT_PUBLIC_PRICE_AGEING_FRACTION` to move it.
 */
export const AGEING_FRACTION = fraction(process.env.NEXT_PUBLIC_PRICE_AGEING_FRACTION, 0.75)

export type PriceState = "fresh" | "ageing" | "stale" | "unpriced"

export type PriceFreshness = {
  /** Seconds since the price was posted, never negative. */
  age: number
  /** The asset's own limit in seconds, or null when the pool sets none. */
  maxAge: number | null
  state: PriceState
}

/**
 * Whether a price can still be acted on, from the two numbers the chain gives:
 * when it was posted, and the age the asset's guard allows.
 *
 * The comparison matches the contract's: stale is strictly past the limit, so a
 * price exactly at it is still one the pool will act on.
 */
export function priceFreshness(updatedAt: number, maxAge: number | null, now: number): PriceFreshness {
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) return { age: 0, maxAge, state: "unpriced" }
  const age = Math.max(0, Math.floor(now - updatedAt))
  if (!maxAge || maxAge <= 0) return { age, maxAge: null, state: "fresh" }
  if (age > maxAge) return { age, maxAge, state: "stale" }
  return { age, maxAge, state: age >= maxAge * AGEING_FRACTION ? "ageing" : "fresh" }
}

const plural = (count: number, unit: string) => `${count} ${unit}${count === 1 ? "" : "s"}`

/**
 * A span of seconds in words: "a minute", "40 minutes", "an hour", "2 days".
 * Rounded the way somebody reading a screen would round it.
 */
export function durationWords(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds))
  if (whole < 90) return whole < 45 ? plural(Math.max(1, whole), "second") : "a minute"
  const minutes = Math.round(whole / 60)
  if (minutes < 60) return minutes === 1 ? "a minute" : plural(minutes, "minute")
  const hours = Math.round(minutes / 60)
  if (hours < 24) return hours === 1 ? "an hour" : plural(hours, "hour")
  const days = Math.round(hours / 24)
  return days === 1 ? "a day" : plural(days, "day")
}

/** The same span, as a moment in the past: "priced 40 minutes ago" reads off this. */
export const agoWords = (seconds: number) => (seconds < 30 ? "moments ago" : `${durationWords(seconds)} ago`)

/** The same span as a limit rather than a duration: "past the hour this asset allows". */
export const limitWords = (seconds: number) => durationWords(seconds).replace(/^an? /, "")

/**
 * The line that qualifies a price, on the same line as the number itself.
 *
 * A stale price says so and says what it is past, because "priced 2 days ago"
 * alone does not tell somebody the pool has stopped acting on it.
 */
export function priceAgeLine(freshness: PriceFreshness): string {
  if (freshness.state === "unpriced") return "never priced"
  const posted = `priced ${agoWords(freshness.age)}`
  if (!freshness.maxAge || freshness.state === "fresh") return posted
  const limit = limitWords(freshness.maxAge)
  return freshness.state === "stale"
    ? `${posted}, past the ${limit} this asset allows`
    : `${posted}, close to the ${limit} this asset allows`
}

/**
 * Lets the pool's verdict overrule this clock on what the line says. The age is
 * measured here, against the browser's clock, which can drift from the chain's;
 * the refusal is the pool's. A line that called a price stale beside a draw the
 * pool would take, or fresh beside a draw it refuses, would contradict itself.
 * `status` is the pool's `priceStatus`, or null where the pool has none.
 */
export function reconcileFreshness(freshness: PriceFreshness, status: number | null): PriceFreshness {
  if (status === null || freshness.state === "unpriced" || !freshness.maxAge) return freshness
  if (status === STALE_STATUS) return { ...freshness, state: "stale" }
  if (status === OK_STATUS && freshness.state === "stale") return { ...freshness, state: "ageing" }
  return freshness
}

/**
 * The same line for a price whose age is already known, such as a demo price.
 * Anchored away from zero, because a posting time of zero or below means the
 * asset was never priced at all.
 */
export const priceAgeLineForAge = (age: number, maxAge: number | null) =>
  priceAgeLine(priceFreshness(1, maxAge, 1 + Math.max(0, age)))

/**
 * The pool's own verdict on a price, in the order of `SafixPool.PriceStatus`.
 * Read from the chain rather than judged here, so the screen refuses exactly
 * what the contract refuses: the interface's clock never decides it.
 */
const OK_STATUS = 0
const STALE_STATUS = 5

const verdicts = [
  null,
  { label: "This asset is not accepted", note: "The pool has this asset switched off as collateral." },
  {
    label: "Waiting on the network",
    note: "The network's sequencer is down, so the pool will not act on any price until it is back."
  },
  {
    label: "Waiting on the network",
    note: "The network's sequencer has only just come back, and prices are held for a short grace period before the pool acts on them."
  },
  {
    label: "No price to draw against",
    note: "The price feed for this asset is not answering, so the pool will not act on it until it does."
  },
  {
    label: "Price too old to draw against",
    note: "The pool will not act on a price this old. Drawing becomes available again once the price is updated."
  },
  {
    label: "Price out of range",
    note: "This price is below the range the pool accepts, so it will not act on it."
  },
  {
    label: "Price out of range",
    note: "This price is above the range the pool accepts, so it will not act on it."
  },
  {
    label: "Price moved too far",
    note: "This price moved further in one step than the pool allows, so it will not act on it."
  }
] as const

export type PriceVerdict = { usable: boolean; label: string | null; note: string | null }

/**
 * Whether the pool will act on this asset's price, and what to say when it will
 * not. `status` is `priceStatus` from the chain; null on a pool that has no such
 * guard, where nothing is refused for age and only the age itself is shown.
 */
export function priceVerdict(status: number | null): PriceVerdict {
  if (status === null || status === 0) return { usable: true, label: null, note: null }
  const verdict = verdicts[status] ?? {
    label: "Price unavailable",
    note: "The pool will not act on this asset's price right now."
  }
  return { usable: false, label: verdict.label, note: verdict.note }
}
