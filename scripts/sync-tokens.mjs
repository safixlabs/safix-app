// Builds the token registry the interface reads, from the chain rather than from a list somebody
// typed. Run it when the chain gains assets; the output is committed, so a build never depends on
// a node or an image host being reachable.
//
//   node scripts/sync-tokens.mjs                      mainnet
//   node scripts/sync-tokens.mjs --chain testnet      testnet
//
// The public RPC rate limits and its backend times out under load, so every request retries with
// backoff and a window that fails is skipped rather than aborting the run.

import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createPublicClient, http, parseAbi } from "viem"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")

const CHAINS = {
  mainnet: { id: 4663, rpc: "https://rpc.mainnet.chain.robinhood.com", explorer: "https://robinhoodchain.blockscout.com" },
  testnet: { id: 46630, rpc: "https://rpc.testnet.chain.robinhood.com", explorer: "https://explorer.testnet.chain.robinhood.com" }
}

const args = process.argv.slice(2)
const chainName = args.includes("--chain") ? args[args.indexOf("--chain") + 1] : "mainnet"
const chain = CHAINS[chainName]
if (!chain) throw new Error(`unknown chain ${chainName}, expected one of ${Object.keys(CHAINS).join(", ")}`)

const BLOCK_SPAN = 250
const WINDOWS = Number(process.env.TOKEN_SCAN_WINDOWS ?? 40)
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11"

const tokenAbi = parseAbi([
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function decimals() view returns (uint8)",
  "function uiMultiplier() view returns (uint256)"
])

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const say = message => process.stderr.write(`${message}\n`)

let nextId = 0
async function send(body) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    let response
    try {
      response = await fetch(chain.rpc, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      })
    } catch (error) {
      await sleep(700 * 2 ** attempt)
      continue
    }
    const json = await response.json().catch(() => null)
    const messages = Array.isArray(json) ? json.map(entry => entry?.error?.message ?? "") : [json?.error?.message ?? ""]
    // The public node answers its own outages through the JSON-RPC error field rather than a status
    // code, so both have to be read to tell a transient failure from a real one.
    const transient =
      response.status === 429 ||
      response.status >= 500 ||
      messages.some(message => /too many requests|timeout|i\/o|connection|unavailable|temporarily/i.test(message))
    if (!transient) return json
    await sleep(700 * 2 ** attempt)
  }
  throw new Error("the node kept refusing after eight attempts")
}

const call = async (method, params = []) => {
  const answer = await send({ jsonrpc: "2.0", id: (nextId += 1), method, params })
  if (answer?.error) throw new Error(`${method}: ${answer.error.message}`)
  return answer.result
}

/** Every contract that moved a token in the scanned window. Discovery, not a definitive list. */
async function discover() {
  const head = Number(await call("eth_blockNumber"))
  const found = new Set()
  for (let window = 0; window < WINDOWS; window += 1) {
    const to = head - window * BLOCK_SPAN
    try {
      const logs = await call("eth_getLogs", [
        { fromBlock: `0x${(to - BLOCK_SPAN).toString(16)}`, toBlock: `0x${to.toString(16)}`, topics: [TRANSFER] }
      ])
      // ERC-721 shares the Transfer signature and adds the id as a fourth topic. Dropping those
      // here saves a metadata read that would only fail on decimals.
      for (const log of logs) if (log.topics.length === 3) found.add(log.address.toLowerCase())
    } catch (error) {
      say(`  window at ${to} skipped: ${error.message.slice(0, 60)}`)
    }
    process.stderr.write(`\r  scanning ${window + 1}/${WINDOWS}, ${found.size} contracts`)
    await sleep(250)
  }
  process.stderr.write("\n")
  return { head, addresses: [...found] }
}

/**
 * Metadata for many tokens in few requests.
 *
 * Multicall3 takes the failures with it, which matters here: most of what a Transfer scan finds
 * does not answer all four questions, and one revert must not lose the batch. Without it the run
 * is four requests per token and the public node refuses long before the end.
 */
async function readMetadata(addresses) {
  const client = createPublicClient({
    transport: http(chain.rpc, { batch: false, retryCount: 6, retryDelay: 800, timeout: 30_000 })
  })
  const tokens = []
  const CHUNK = 60
  for (let index = 0; index < addresses.length; index += CHUNK) {
    const chunk = addresses.slice(index, index + CHUNK)
    const contracts = chunk.flatMap(address => [
      { address, abi: tokenAbi, functionName: "symbol" },
      { address, abi: tokenAbi, functionName: "name" },
      { address, abi: tokenAbi, functionName: "decimals" },
      { address, abi: tokenAbi, functionName: "uiMultiplier" }
    ])
    let answers
    try {
      answers = await client.multicall({ contracts, allowFailure: true, multicallAddress: MULTICALL3 })
    } catch (error) {
      say(`  metadata chunk at ${index} skipped: ${error.message.slice(0, 60)}`)
      continue
    }
    chunk.forEach((address, position) => {
      const [symbol, name, decimals, multiplier] = answers.slice(position * 4, position * 4 + 4)
      if (symbol.status !== "success" || !symbol.result || decimals.status !== "success") return
      tokens.push({
        address,
        symbol: String(symbol.result),
        name: name.status === "success" ? String(name.result) : null,
        decimals: Number(decimals.result),
        scaled: multiplier.status === "success"
      })
    })
    process.stderr.write(`\r  reading ${Math.min(index + CHUNK, addresses.length)}/${addresses.length}`)
    await sleep(150)
  }
  process.stderr.write("\n")
  return tokens
}

const LOGO_SOURCES = [
  symbol => `https://financialmodelingprep.com/image-stock/${symbol}.png`,
  symbol => `https://assets.parqet.com/logos/symbol/${symbol}?format=png&size=256`
]

/**
 * Downloads each logo once and commits it.
 *
 * Self-hosted rather than hotlinked, for three reasons: a static export should not depend on an
 * image host at render time, a request per token would tell that host which assets a visitor is
 * looking at, and a provider that changes a URL should not empty the interface.
 */
async function fetchLogos(tokens) {
  const directory = join(root, "public", "tokens")
  mkdirSync(directory, { recursive: true })
  let written = 0
  const missing = []
  for (const token of tokens) {
    // USDG ships with the interface already, taken from the Global Dollar Network's own asset
    // rather than from an equity logo host that has never heard of it.
    const shipped = join(root, "public", `${token.symbol.toLowerCase()}.png`)
    if (existsSync(shipped)) {
      token.icon = `/${token.symbol.toLowerCase()}.png`
      continue
    }
    const file = join(directory, `${token.symbol.toLowerCase()}.png`)
    if (existsSync(file)) {
      token.icon = `/tokens/${token.symbol.toLowerCase()}.png`
      continue
    }
    let saved = false
    for (const source of LOGO_SOURCES) {
      try {
        const response = await fetch(source(token.symbol), { redirect: "follow" })
        if (!response.ok) continue
        const bytes = Buffer.from(await response.arrayBuffer())
        if (bytes.length < 200) continue
        writeFileSync(file, bytes)
        token.icon = `/tokens/${token.symbol.toLowerCase()}.png`
        saved = true
        written += 1
        break
      } catch {
        continue
      }
    }
    if (!saved) missing.push(token.symbol)
    await sleep(60)
  }
  return { written, missing }
}

say(`safix tokens: ${chainName} (chain ${chain.id})`)
const { head, addresses } = await discover()
say(`  ${addresses.length} contracts moved a token in the last ${WINDOWS * BLOCK_SPAN} blocks`)
const all = await readMetadata(addresses)
const scaled = all.filter(token => token.scaled)
say(`  ${all.length} answered as ERC-20, ${scaled.length} of them carry uiMultiplier`)

const stable = all.filter(token => /^(USDG|USDC|USDT|WETH|DAI)$/i.test(token.symbol))
const listed = [...scaled, ...stable.filter(token => !scaled.some(other => other.address === token.address))]
listed.sort((a, b) => a.symbol.localeCompare(b.symbol))

const logos = await fetchLogos(listed)
say(`  ${logos.written} logos downloaded${logos.missing.length ? `, none found for ${logos.missing.join(", ")}` : ""}`)

const registry = {
  comment:
    "Generated by scripts/sync-tokens.mjs from the chain itself. Every field here was read from a contract, not typed.",
  chain: chainName,
  chainId: chain.id,
  explorer: chain.explorer,
  syncedAt: new Date().toISOString(),
  scannedToBlock: head,
  scannedBlocks: WINDOWS * BLOCK_SPAN,
  tokens: listed.map(token => ({
    address: token.address,
    symbol: token.symbol,
    name: token.name,
    decimals: token.decimals,
    scaled: token.scaled,
    icon: token.icon ?? null
  }))
}

const out = join(root, "data", `tokens.${chainName}.json`)
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, `${JSON.stringify(registry, null, 2)}\n`)
say(`  wrote ${registry.tokens.length} tokens to data/tokens.${chainName}.json`)
