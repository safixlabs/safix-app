export type CollateralAsset = {
  id: string
  name: string
  symbol: string
  kind: string
  price: number
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

export const collateralAssets: CollateralAsset[] = [
  { id: "tbill", name: "Tokenized treasury 3M", symbol: "tBILL", kind: "Government debt", price: 100.42, balance: 85, maxLtv: 0.8 },
  { id: "bnvda", name: "Tokenized Nvidia", symbol: "bNVDA", kind: "Tokenized stock", price: 172.35, balance: 40, maxLtv: 0.55 },
  { id: "baapl", name: "Tokenized Apple", symbol: "bAAPL", kind: "Tokenized stock", price: 246.1, balance: 22, maxLtv: 0.55 },
  { id: "tgold", name: "Tokenized gold", symbol: "tGOLD", kind: "Commodity", price: 3392.8, balance: 1.6, maxLtv: 0.65 }
]

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

export const usd = (value: number, digits = 2) =>
  value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })

export const pct = (value: number, digits = 0) => `${(value * 100).toFixed(digits)}%`
