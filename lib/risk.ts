export type HealthState = "safe" | "tight" | "atRisk" | "liquidatable" | "none"

export const healthStateCopy: Record<HealthState, { label: string; tone: string; blurb: string }> = {
  safe: { label: "Safe", tone: "text-mint", blurb: "Comfortably above the liquidation level." },
  tight: { label: "Tight", tone: "text-fog", blurb: "Above the liquidation level, but with little room." },
  atRisk: { label: "At risk", tone: "text-amber", blurb: "A small price move would trigger liquidation." },
  liquidatable: { label: "Liquidatable", tone: "text-danger", blurb: "This position can be liquidated now." },
  none: { label: "No debt", tone: "text-haze", blurb: "Nothing drawn against this collateral." }
}

export const liquidationHealth = (liqThresholdBps: number) =>
  liqThresholdBps > 0 ? 10_000 / liqThresholdBps : 0

export function healthStateOf(health: number, liqThresholdBps: number, hasDebt: boolean): HealthState {
  if (!hasDebt) return "none"
  const floor = liquidationHealth(liqThresholdBps)
  if (floor === 0) return "none"
  if (health <= floor) return "liquidatable"
  if (health < floor * 1.15) return "atRisk"
  if (health < floor * 1.4) return "tight"
  return "safe"
}

export function liquidationPrice1e18(debt: bigint, collateral: bigint, liqThresholdBps: number): bigint {
  if (collateral === 0n || debt === 0n || liqThresholdBps === 0) return 0n
  return (debt * 10_000n * 10n ** 30n) / (collateral * BigInt(liqThresholdBps))
}

export const priceToNumber = (price1e18: bigint) => Number(price1e18 / 10n ** 10n) / 1e8

export const dropToLiquidation = (current: number, liquidation: number) =>
  current > 0 && liquidation > 0 ? Math.max(0, (current - liquidation) / current) : 0
