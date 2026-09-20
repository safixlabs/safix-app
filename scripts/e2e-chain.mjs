#!/usr/bin/env node
// Runs the money-path suite against a local chain, from a clean checkout, with
// one command.
//
// The chain is an anvil fork of the public testnet, so the contracts under test
// are the ones really deployed there. That means no deploy step, no access to
// the private contracts repository, and nothing secret in CI. The fork is given
// the local chain id so the app reaches it through a single transport: a
// fallback to the public node would answer from state the test has not written.
import { spawn } from "node:child_process"
import { readFileSync } from "node:fs"
import process from "node:process"

const config = JSON.parse(readFileSync(new URL("../e2e/deployment.json", import.meta.url), "utf8"))
// The addresses come from the record the app itself reads, so the suite and the
// interface can never be pointed at two different deployments.
const recorded = JSON.parse(readFileSync(new URL("../data/deployments.json", import.meta.url), "utf8")).testnet
const assetAddress = symbol => recorded.assets.find(asset => asset.symbol === symbol).address

const FORK_URL = process.env.E2E_FORK_URL ?? config.forkUrl
const PORT = Number(process.env.E2E_CHAIN_PORT ?? config.port)
const CHAIN_ID = Number(process.env.E2E_CHAIN_ID ?? config.chainId)
const RPC_URL = `http://127.0.0.1:${PORT}`
const READY_TIMEOUT_MS = 120_000

const log = message => process.stdout.write(`[e2e-chain] ${message}\n`)

const rpc = async (method, params = []) => {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  })
  const body = await response.json()
  if (body.error) throw new Error(body.error.message)
  return body.result
}

const waitForChain = async () => {
  const deadline = Date.now() + READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    try {
      const id = await rpc("eth_chainId")
      if (Number(id) === CHAIN_ID) return
      throw new Error(`chain id is ${Number(id)}, expected ${CHAIN_ID}`)
    } catch {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }
  throw new Error(`the fork did not come up within ${READY_TIMEOUT_MS / 1000}s`)
}

/** Fails loudly rather than letting the suite report a hundred empty screens. */
const assertContracts = async () => {
  const pool = (process.env.NEXT_PUBLIC_POOL_ADDRESS ?? recorded.addresses.pool).toLowerCase()
  const code = await rpc("eth_getCode", [pool, "latest"])
  if (!code || code === "0x") {
    throw new Error(`no contract at ${pool} on the fork. Is E2E_FORK_URL pointing at the right chain?`)
  }
  log(`pool contract found at ${pool}`)
}

let anvil
const stopChain = () => {
  if (anvil && !anvil.killed) anvil.kill("SIGTERM")
}
process.on("exit", stopChain)
process.on("SIGINT", () => {
  stopChain()
  process.exit(130)
})
process.on("SIGTERM", () => {
  stopChain()
  process.exit(143)
})

log(`forking ${FORK_URL} on port ${PORT} as chain ${CHAIN_ID}`)
anvil = spawn(
  "anvil",
  ["--fork-url", FORK_URL, "--chain-id", String(CHAIN_ID), "--port", String(PORT), "--silent"],
  { stdio: ["ignore", "ignore", "inherit"] }
)
anvil.on("error", error => {
  process.stderr.write(`[e2e-chain] could not start anvil: ${error.message}\n`)
  process.stderr.write("[e2e-chain] install foundry from https://getfoundry.sh\n")
  process.exit(1)
})

await waitForChain()
log("fork is up")
await assertContracts()

/**
 * Gas for the test accounts, set on the fork rather than drawn from a faucet.
 *
 * These are anvil's published accounts, and on a fork they start with whatever
 * the live chain happens to hold for them. That balance drains over time and
 * takes the suite down with it, which is a faucet failing rather than anything
 * the app did. The fork is local, so the balance is simply set.
 */
const fundAccounts = async () => {
  const accounts = Object.values(config.accounts ?? {}).map(account => account.address ?? account)
  for (const address of accounts) {
    await rpc("anvil_setBalance", [address, "0x56bc75e2d63100000"])
  }
  log(`funded ${accounts.length} test account(s) with 100 ETH each`)
}

await fundAccounts()

const args = process.argv.slice(2)
// Every screen in this app reads a chain: there is no second source of numbers,
// so every suite that renders one runs here. Only the two that test pure
// functions, the revert table and the price age rules, need no chain at all.
const command =
  args.length > 0
    ? args
    : [
        "npx",
        "playwright",
        "test",
        "e2e/onchain.spec.ts",
        "e2e/states.spec.ts",
        "e2e/history.spec.ts",
        "e2e/interface.spec.ts",
        "e2e/a11y.spec.ts",
        "e2e/visual.spec.ts"
      ]
log(`running: ${command.join(" ")}`)

const appEnv = {
  NEXT_PUBLIC_CHAIN: "local",
  NEXT_PUBLIC_POOL_ADDRESS: recorded.addresses.pool,
  NEXT_PUBLIC_USDG_ADDRESS: recorded.addresses.usdg,
  NEXT_PUBLIC_REGISTRY_ADDRESS: recorded.addresses.registry,
  NEXT_PUBLIC_DESK_ADDRESS: recorded.addresses.desk,
  NEXT_PUBLIC_ASSET_TBILL: assetAddress("tBILL"),
  NEXT_PUBLIC_ASSET_BNVDA: assetAddress("bNVDA"),
  NEXT_PUBLIC_ASSET_TGOLD: assetAddress("tGOLD"),
  NEXT_PUBLIC_DEPLOY_BLOCK: String(recorded.deployBlock)
}

const suite = spawn(command[0], command.slice(1), {
  stdio: "inherit",
  env: {
    ...appEnv,
    ...process.env,
    E2E_LIVE: "1",
    E2E_RPC_URL: RPC_URL,
    E2E_CHAIN_ID: String(CHAIN_ID)
  }
})

suite.on("exit", code => {
  stopChain()
  process.exit(code ?? 1)
})
