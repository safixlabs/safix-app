export type HealthState = "safe" | "tight" | "atRisk" | "liquidatable" | "none"

export const healthStateCopy: Record<HealthState, { label: string; tone: string; blurb: string }> = {
  safe: { label: "Safe", tone: "text-mint", blurb: "Comfortably above the liquidation level." },
  tight: { label: "Tight", tone: "text-fog", blurb: "Above the liquidation level, but with little room." },
  atRisk: { label: "At risk", tone: "text-amber", blurb: "A small price move would trigger liquidation." },
  liquidatable: { label: "Liquidatable", tone: "text-danger", blurb: "This position can be liquidated now." },
  none: { label: "No debt", tone: "text-haze", blurb: "Nothing drawn against this collateral." }
}

const distance = (raw: string | undefined, fallback: number) => {
  const parsed = Number.parseFloat(raw ?? "")
  return Number.isFinite(parsed) && parsed > 0 && parsed < 1 ? parsed : fallback
}

/**
 * How near liquidation a position has to be before it is called at risk, or
 * merely tight, measured as the price fall it can still absorb.
 *
 * The distance is stated in the same unit the interface puts in front of the
 * borrower — "a 9.4% fall in bNVDA would allow this to be liquidated" — so the
 * threshold and the warning cannot drift apart. Set
 * `NEXT_PUBLIC_RISK_AT_RISK_DISTANCE` and `NEXT_PUBLIC_RISK_TIGHT_DISTANCE` to
 * fractions between 0 and 1 to move them.
 */
export const AT_RISK_DISTANCE = distance(process.env.NEXT_PUBLIC_RISK_AT_RISK_DISTANCE, 0.13)
export const TIGHT_DISTANCE = distance(process.env.NEXT_PUBLIC_RISK_TIGHT_DISTANCE, 0.28)

/** The health ratio at which an asset with this threshold becomes liquidatable. */
export const liquidationHealth = (liqThresholdBps: number) =>
  liqThresholdBps > 0 ? 10_000 / liqThresholdBps : 0

/**
 * The price fall a position can still absorb, as a fraction of the current
 * price. Derived from health rather than from the two prices, so it holds
 * whatever the collateral is worth today.
 */
export function distanceToLiquidation(health: number, liqThresholdBps: number): number {
  const floor = liquidationHealth(liqThresholdBps)
  if (floor === 0 || health <= 0) return 0
  return Math.max(0, 1 - floor / health)
}

export function healthStateOf(health: number, liqThresholdBps: number, hasDebt: boolean): HealthState {
  if (!hasDebt) return "none"
  const floor = liquidationHealth(liqThresholdBps)
  if (floor === 0) return "none"
  if (health <= floor) return "liquidatable"
  const room = distanceToLiquidation(health, liqThresholdBps)
  if (room < AT_RISK_DISTANCE) return "atRisk"
  if (room < TIGHT_DISTANCE) return "tight"
  return "safe"
}

export function liquidationPrice1e18(debt: bigint, collateral: bigint, liqThresholdBps: number): bigint {
  if (collateral === 0n || debt === 0n || liqThresholdBps === 0) return 0n
  return (debt * 10_000n * 10n ** 30n) / (collateral * BigInt(liqThresholdBps))
}

export const priceToNumber = (price1e18: bigint) => Number(price1e18 / 10n ** 10n) / 1e8

export const dropToLiquidation = (current: number, liquidation: number) =>
  current > 0 && liquidation > 0 ? Math.max(0, (current - liquidation) / current) : 0
