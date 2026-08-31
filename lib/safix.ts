import type { Address } from "viem"

const address = (value: string | undefined): Address | undefined =>
  value && /^0x[0-9a-fA-F]{40}$/.test(value) ? (value as Address) : undefined

export const poolAddress = address(process.env.NEXT_PUBLIC_POOL_ADDRESS)
export const usdcAddress = address(process.env.NEXT_PUBLIC_USDC_ADDRESS)
export const registryAddress = address(process.env.NEXT_PUBLIC_REGISTRY_ADDRESS)
export const deskAddress = address(process.env.NEXT_PUBLIC_DESK_ADDRESS)

export const liveAssets = [
  { symbol: "tBILL", name: "Tokenized treasury 3M", kind: "Government debt", address: address(process.env.NEXT_PUBLIC_ASSET_TBILL) },
  { symbol: "bNVDA", name: "Tokenized Nvidia", kind: "Tokenized stock", address: address(process.env.NEXT_PUBLIC_ASSET_BNVDA) },
  { symbol: "tGOLD", name: "Tokenized gold", kind: "Commodity", address: address(process.env.NEXT_PUBLIC_ASSET_TGOLD) }
].filter(asset => asset.address) as { symbol: string; name: string; kind: string; address: Address }[]

export const isLive = Boolean(poolAddress && usdcAddress)

export const usdcUnits = (value: number) => BigInt(Math.round(value * 1e6))
export const fromUsdcUnits = (value: bigint) => Number(value) / 1e6
export const fromTokenUnits = (value: bigint) => Number(value) / 1e18

export const safixPoolAbi = [
  { type: "function", name: "deposit", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "withdraw", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "claimGains", stateMutability: "nonpayable", inputs: [{ name: "assets", type: "address[]" }], outputs: [] },
  { type: "function", name: "lockCollateral", stateMutability: "nonpayable", inputs: [{ name: "asset", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "withdrawCollateral", stateMutability: "nonpayable", inputs: [{ name: "asset", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "draw", stateMutability: "nonpayable", inputs: [{ name: "asset", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "repay", stateMutability: "nonpayable", inputs: [{ name: "asset", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "closePosition", stateMutability: "nonpayable", inputs: [{ name: "asset", type: "address" }], outputs: [] },
  { type: "function", name: "totalDeposits", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "availableLiquidity", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "protocolFees", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "originationFeeBps", stateMutability: "view", inputs: [], outputs: [{ type: "uint16" }] },
  { type: "function", name: "redemptionFeeBps", stateMutability: "view", inputs: [], outputs: [{ type: "uint16" }] },
  { type: "function", name: "compoundedDepositOf", stateMutability: "view", inputs: [{ name: "provider", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "gainOf", stateMutability: "view", inputs: [{ name: "provider", type: "address" }, { name: "asset", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "positions", stateMutability: "view", inputs: [{ name: "borrower", type: "address" }, { name: "asset", type: "address" }], outputs: [{ name: "collateral", type: "uint256" }, { name: "debt", type: "uint256" }, { name: "totalDrawn", type: "uint256" }] },
  { type: "function", name: "assetConfig", stateMutability: "view", inputs: [{ name: "asset", type: "address" }], outputs: [{ name: "enabled", type: "bool" }, { name: "maxLtvBps", type: "uint16" }, { name: "liqThresholdBps", type: "uint16" }, { name: "priceUsd1e18", type: "uint256" }] },
  { type: "function", name: "collateralValueUsdc", stateMutability: "view", inputs: [{ name: "asset", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "isLiquidatable", stateMutability: "view", inputs: [{ name: "borrower", type: "address" }, { name: "asset", type: "address" }], outputs: [{ type: "bool" }] }
] as const

export const erc8056Abi = [
  { type: "function", name: "uiMultiplier", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] }
] as const

export const ONE_1E18 = 10n ** 18n

export const uiTokenAmount = (raw: bigint, multiplier?: bigint) =>
  Number((raw * (multiplier ?? ONE_1E18)) / ONE_1E18) / 1e18

export const registryAbi = [
  { type: "function", name: "checkMaskOf", stateMutability: "view", inputs: [{ name: "subject", type: "address" }], outputs: [{ name: "checkMask", type: "uint8" }, { name: "expiry", type: "uint64" }] },
  { type: "function", name: "isEligible", stateMutability: "view", inputs: [{ name: "subject", type: "address" }], outputs: [{ type: "bool" }] }
] as const

export const deskAbi = [
  { type: "function", name: "partnershipCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "partnerships", stateMutability: "view", inputs: [{ name: "id", type: "uint256" }], outputs: [{ name: "operator", type: "address" }, { name: "operatorShareBps", type: "uint16" }, { name: "fundingDeadline", type: "uint64" }, { name: "status", type: "uint8" }, { name: "fundingGoal", type: "uint256" }, { name: "funded", type: "uint256" }, { name: "returned", type: "uint256" }, { name: "operatorPaid", type: "bool" }] },
  { type: "function", name: "fund", stateMutability: "nonpayable", inputs: [{ name: "id", type: "uint256" }, { name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "claim", stateMutability: "nonpayable", inputs: [{ name: "id", type: "uint256" }], outputs: [] },
  { type: "function", name: "funderPayoutOf", stateMutability: "view", inputs: [{ name: "id", type: "uint256" }, { name: "funder", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "contributions", stateMutability: "view", inputs: [{ name: "id", type: "uint256" }, { name: "funder", type: "address" }], outputs: [{ type: "uint256" }] }
] as const

export const erc20Abi = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] }
] as const
