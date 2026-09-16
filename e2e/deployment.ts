/**
 * The deployment the money-path suite runs against.
 *
 * anvil forks the public testnet, so the contracts under test are the ones
 * really deployed there: no deploy step, no access to the private contracts
 * repository, no secrets in CI. The fork is handed the local chain id so the
 * app reaches it through a single transport with no fallback — otherwise a
 * slow read could be answered by the public node, which holds different state
 * from the fork the test has been writing to.
 *
 * Every value can be overridden, so the same suite can be pointed at a chain
 * deployed by `script/Deploy.s.sol` instead of a fork.
 */

import config from "./deployment.json"

export const FORK_URL = process.env.E2E_FORK_URL ?? config.forkUrl
export const RPC_URL = process.env.E2E_RPC_URL ?? `http://127.0.0.1:${config.port}`
export const CHAIN_ID = Number(process.env.E2E_CHAIN_ID ?? config.chainId)
export const CHAIN_ID_HEX = `0x${CHAIN_ID.toString(16)}` as const
/** Block the deployment started at, which is where the app reads its logs from. */
export const DEPLOY_BLOCK = BigInt(process.env.NEXT_PUBLIC_DEPLOY_BLOCK ?? config.deployBlock)

const address = (name: string, fallback: string) => (process.env[name] ?? fallback).toLowerCase()

export const deployment = {
  pool: address("NEXT_PUBLIC_POOL_ADDRESS", config.addresses.pool),
  usdg: address("NEXT_PUBLIC_USDG_ADDRESS", config.addresses.usdg),
  registry: address("NEXT_PUBLIC_REGISTRY_ADDRESS", config.addresses.registry),
  desk: address("NEXT_PUBLIC_DESK_ADDRESS", config.addresses.desk),
  tbill: address("NEXT_PUBLIC_ASSET_TBILL", config.addresses.tbill),
  bnvda: address("NEXT_PUBLIC_ASSET_BNVDA", config.addresses.bnvda),
  tgold: address("NEXT_PUBLIC_ASSET_TGOLD", config.addresses.tgold)
} as const

/**
 * anvil's first two accounts. The keys are the ones anvil prints on every
 * start; they are public knowledge and hold nothing outside a local chain.
 */
export const accounts = {
  borrower: {
    address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    key: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
  },
  second: {
    address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    key: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
  }
} as const

/** The environment the app under test needs to talk to the fork. */
export const appEnv = {
  NEXT_PUBLIC_CHAIN: "local",
  NEXT_PUBLIC_POOL_ADDRESS: deployment.pool,
  NEXT_PUBLIC_USDG_ADDRESS: deployment.usdg,
  NEXT_PUBLIC_REGISTRY_ADDRESS: deployment.registry,
  NEXT_PUBLIC_DESK_ADDRESS: deployment.desk,
  NEXT_PUBLIC_ASSET_TBILL: deployment.tbill,
  NEXT_PUBLIC_ASSET_BNVDA: deployment.bnvda,
  NEXT_PUBLIC_ASSET_TGOLD: deployment.tgold
} as const
