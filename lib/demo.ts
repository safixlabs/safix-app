export type CollateralAsset = {
  id: string
  name: string
  symbol: string
  kind: string
  price: number
  /** Seconds since this price was posted, as the pool would report it. */
  pricedSecondsAgo: number
  /** The age this asset's price may reach before the pool stops acting on it. */
  maxPriceAge: number
  balance: number
  maxLtv: number
}

export type Position = {
  id: string
  symbol: string
  locked: number
  value: number
  debt: number
}

// The demo prices carry an age too. A screen that quotes a price without one
// teaches that the question does not exist, and the live screen's whole point is
// that it does. These are all inside their asset's limit, so the demo shows what
// a working price looks like rather than a warning nobody can act on.
export const collateralAssets: CollateralAsset[] = [
  { id: "tbill", name: "Tokenized treasury 3M", symbol: "tBILL", kind: "Government debt", price: 100.42, pricedSecondsAgo: 9 * 60, maxPriceAge: 86_400, balance: 85, maxLtv: 0.8 },
  { id: "bnvda", name: "Tokenized Nvidia", symbol: "bNVDA", kind: "Tokenized stock", price: 172.35, pricedSecondsAgo: 2 * 60, maxPriceAge: 3_600, balance: 40, maxLtv: 0.55 },
  { id: "baapl", name: "Tokenized Apple", symbol: "bAAPL", kind: "Tokenized stock", price: 246.1, pricedSecondsAgo: 4 * 60, maxPriceAge: 3_600, balance: 22, maxLtv: 0.55 },
  { id: "tgold", name: "Tokenized gold", symbol: "tGOLD", kind: "Commodity", price: 3392.8, pricedSecondsAgo: 25 * 60, maxPriceAge: 86_400, balance: 1.6, maxLtv: 0.65 }
]

/** The age a demo asset's price carries, looked up the way the live screens look it up. */
export const demoPriceAge = (symbol: string) => {
  const asset = collateralAssets.find(candidate => candidate.symbol === symbol)
  return asset ? { pricedSecondsAgo: asset.pricedSecondsAgo, maxPriceAge: asset.maxPriceAge } : null
}

export const demoPositions: Position[] = [
  { id: "pos-1", symbol: "tBILL", locked: 60, value: 6025.2, debt: 4100 },
  { id: "pos-2", symbol: "bNVDA", locked: 18, value: 3102.3, debt: 1220 }
]

export const poolStats = {
  tvl: 2412000,
  yourDeposit: 5000,
  poolShare: 0.0021,
  liquidationGains: 214.6,
  rewards: 96.2
}

export const passport = {
  id: "sfx-7f21…c04a",
  issued: "August 2026",
  attestations: 8,
  checks: [
    "Owns enough approved collateral",
    "Meets identity and eligibility requirements",
    "Carries an acceptable level of debt",
    "No collateral pledged elsewhere",
    "Qualifies for the requested loan size"
  ]
}

export const originationFeeRate = 0.005
export const redemptionFeeRate = 0.003

export const maxLtvFor = (symbol: string) =>
  collateralAssets.find(asset => asset.symbol === symbol)?.maxLtv ?? 0.5

// One formatter per kind of number, so a figure reads the same on every screen.
// Money is always two decimals; asset prices keep four below a dollar, where the
// cents alone would hide the movement; token amounts are always four.
export const usd = (value: number) =>
  value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })

export const price = (value: number) =>
  value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value < 1 ? 4 : 2,
    maximumFractionDigits: value < 1 ? 4 : 2
  })

export const tokenAmount = (value: number) => value.toFixed(4)

export const pct = (value: number, digits = 0) => `${(value * 100).toFixed(digits)}%`
