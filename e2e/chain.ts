import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  defineChain,
  http,
  type Address,
  type Hex
} from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { CHAIN_ID, RPC_URL, deployment } from "./deployment"

export const chain = defineChain({
  id: CHAIN_ID,
  name: "Safix e2e",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } }
})

export const publicClient = createPublicClient({ chain, transport: http(RPC_URL) })
const testClient = createTestClient({ chain, mode: "anvil", transport: http(RPC_URL) })

export const poolAbi = [
  { type: "function", name: "compoundedDepositOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalDeposits", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "availableLiquidity", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "gainOf", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "positions", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }] },
  { type: "function", name: "assetConfig", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "bool" }, { type: "uint16" }, { type: "uint16" }, { type: "uint256" }] },
  { type: "function", name: "isLiquidatable", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "setPrice", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [] },
  { type: "function", name: "liquidate", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "address" }, { type: "uint256" }], outputs: [] },
  { type: "function", name: "deposit", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [] },
  { type: "function", name: "lockCollateral", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [] },
  { type: "function", name: "draw", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [] }
] as const

export const erc20Abi = [
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] }
] as const

export const deskAbi = [
  { type: "function", name: "partnerships", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "address" }, { type: "uint16" }, { type: "uint64" }, { type: "uint8" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "bool" }] },
  { type: "function", name: "contributions", stateMutability: "view", inputs: [{ type: "uint256" }, { type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "funderPayoutOf", stateMutability: "view", inputs: [{ type: "uint256" }, { type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "cancel", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [] }
] as const

export const pool = deployment.pool as Address
export const usdgToken = deployment.usdg as Address
export const desk = deployment.desk as Address
export const tbill = deployment.tbill as Address
export const bnvda = deployment.bnvda as Address
export const tgold = deployment.tgold as Address

export const walletFor = (key: Hex) =>
  createWalletClient({ account: privateKeyToAccount(key), chain, transport: http(RPC_URL) })

/**
 * Acts as an address the test does not hold the key for.
 *
 * A fork lets the suite step into the protocol owner or a partnership operator
 * to arrange the state a money path needs — a liquidation to claim gains from,
 * a cancelled partnership to claim a contribution back — without those setup
 * steps having to be money paths of their own.
 */
export async function asAccount(address: Address) {
  await testClient.impersonateAccount({ address })
  await testClient.setBalance({ address, value: 10n ** 20n })
  return createWalletClient({ account: address, chain, transport: http(RPC_URL) })
}

export const stopImpersonating = (address: Address) => testClient.stopImpersonatingAccount({ address })

export const waitFor = (hash: Hex) => publicClient.waitForTransactionReceipt({ hash })

export const depositOf = (who: Address) =>
  publicClient.readContract({ abi: poolAbi, address: pool, functionName: "compoundedDepositOf", args: [who] })

export const balanceOf = (token: Address, who: Address) =>
  publicClient.readContract({ abi: erc20Abi, address: token, functionName: "balanceOf", args: [who] })

export const positionOf = (who: Address, asset: Address) =>
  publicClient.readContract({ abi: poolAbi, address: pool, functionName: "positions", args: [who, asset] })

export const gainOf = (who: Address, asset: Address) =>
  publicClient.readContract({ abi: poolAbi, address: pool, functionName: "gainOf", args: [who, asset] })

export const contributionOf = (id: bigint, who: Address) =>
  publicClient.readContract({ abi: deskAbi, address: desk, functionName: "contributions", args: [id, who] })

export const partnership = (id: bigint) =>
  publicClient.readContract({ abi: deskAbi, address: desk, functionName: "partnerships", args: [id] })

export const usd = (units: bigint) => Number(units) / 1e6
export const tokens = (units: bigint) => Number(units) / 1e18
