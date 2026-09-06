"use client"

import { activeChain } from "./chain"

const src = process.env.NEXT_PUBLIC_PLAUSIBLE_SRC?.trim()

/** Analytics only runs where a script is configured to receive it. */
export const analyticsReady = Boolean(src)

/**
 * The funnels worth watching, and nothing else.
 *
 * Each name is a step, so the drop-off between them is the funnel: how many
 * people who opened the wallet picker ended up connected, how many who started
 * a deposit signed one. Naming the steps rather than logging free-form events
 * is what keeps this a handful of counters instead of a behavioural record.
 */
export type AnalyticsEvent =
  | "connect_opened"
  | "connect_succeeded"
  | "connect_failed"
  | "deposit_started"
  | "deposit_signed"
  | "deposit_failed"
  | "withdraw_started"
  | "withdraw_signed"
  | "lock_started"
  | "lock_signed"
  | "draw_started"
  | "draw_signed"
  | "draw_blocked"
  | "repay_signed"
  | "close_signed"
  | "risk_acknowledged"

/**
 * What may travel with an event.
 *
 * A closed set, by design. Anything not listed here cannot be attached, which
 * is a stronger guarantee than remembering not to attach it: there is no field
 * an address or an amount would fit into.
 */
export type AnalyticsProps = {
  /** Which collateral, by ticker. Not which position, and not whose. */
  asset?: string
  /** Why an action was refused, from the app's own fixed vocabulary. */
  reason?: string
}

type PlausibleFn = (event: string, options?: { props?: Record<string, string> }) => void

const plausible = (): PlausibleFn | undefined =>
  typeof window === "undefined" ? undefined : (window as unknown as { plausible?: PlausibleFn }).plausible

/**
 * Records that a step happened.
 *
 * Never who, never how much. The chain is attached because a funnel that
 * behaves differently on one network is worth being able to see.
 */
export function track(event: AnalyticsEvent, props: AnalyticsProps = {}) {
  if (!analyticsReady) return
  const send = plausible()
  if (!send) return
  const payload: Record<string, string> = { chain: activeChain.name }
  if (props.asset) payload.asset = props.asset
  if (props.reason) payload.reason = props.reason
  send(event, { props: payload })
}

export const analyticsScript = src
