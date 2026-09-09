"use client"

import { useMemo, useState } from "react"
import { AssetMark, PageHeader, Panel, Stat } from "@/components/ui"
import { collateralAssets } from "@/lib/demo"
import { isLive, liveAssets } from "@/lib/safix"
import { chainTokens, tokenRegistry, underlyingTicker, type ChainToken } from "@/lib/tokens"

const accepted = new Set(
  (isLive ? liveAssets.map(asset => asset.symbol) : collateralAssets.map(asset => asset.symbol)).map(symbol =>
    underlyingTicker(symbol)
  )
)

const shortAddress = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`

type Filter = "all" | "equities" | "settlement" | "accepted"

const filters: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "equities", label: "Tokenized equities" },
  { value: "settlement", label: "Settlement" },
  { value: "accepted", label: "Accepted here" }
]

function TokenRow({ token }: { token: ChainToken }) {
  const isAccepted = accepted.has(token.symbol.toUpperCase())
  return (
    <li>
      <a
        href={`${tokenRegistry.explorer}/address/${token.address}`}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-3.5 rounded-[3px] border border-line bg-carbon/30 px-4 py-3 transition-colors hover:border-mint"
      >
        <AssetMark symbol={token.symbol} className="h-9 w-9" />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-[14.5px] font-semibold tracking-[-0.01em] text-fog">{token.symbol}</span>
            {isAccepted ? (
              <span className="rounded-[3px] border border-mint px-1.5 py-px text-[10.5px] font-medium tracking-[-0.01em] text-mint">
                Collateral
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block truncate text-[12px] tracking-[-0.02em] text-haze">
            {token.name ?? "Unnamed token"}
          </span>
        </span>
        <span className="hidden shrink-0 text-right sm:block">
          <span className="block text-[12px] tracking-[-0.02em] text-haze [font-variant-numeric:tabular-nums]">
            {shortAddress(token.address)}
          </span>
          <span className="mt-0.5 block text-[11.5px] tracking-[-0.02em] text-haze">
            {token.decimals} decimals{token.scaled ? " · scaled" : ""}
          </span>
        </span>
      </a>
    </li>
  )
}

export default function AssetsPage() {
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<Filter>("all")

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return chainTokens.filter(token => {
      if (filter === "equities" && !token.scaled) return false
      if (filter === "settlement" && token.scaled) return false
      if (filter === "accepted" && !accepted.has(token.symbol.toUpperCase())) return false
      if (!needle) return true
      return (
        token.symbol.toLowerCase().includes(needle) ||
        (token.name ?? "").toLowerCase().includes(needle) ||
        token.address.toLowerCase().includes(needle)
      )
    })
  }, [query, filter])

  const equities = chainTokens.filter(token => token.scaled).length

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Assets on the chain"
        lead="Every token Safix can see on Robinhood Chain, read from the chain itself rather than from a list anybody typed. The ones marked as collateral are the assets this pool will lend against today."
        badge={tokenRegistry.describesActiveChain ? "Read from mainnet" : "Mainnet registry"}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Tokens found" value={String(chainTokens.length)} hint={`In ${tokenRegistry.scannedBlocks.toLocaleString("en-US")} blocks`} />
        <Stat label="Tokenized equities" value={String(equities)} hint="Carry the ERC-8056 multiplier" />
        <Stat label="Accepted as collateral" value={String(accepted.size)} hint="Configured on this pool" />
        <Stat
          label="Read at block"
          value={tokenRegistry.scannedToBlock.toLocaleString("en-US")}
          hint={new Date(tokenRegistry.syncedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
        />
      </div>

      <Panel title="Directory">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <input
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search a symbol, a name or an address"
              aria-label="Search the asset directory"
              className="w-full rounded-[3px] border border-control bg-carbon/40 px-3.5 py-2 text-[13.5px] tracking-[-0.01em] text-fog placeholder:text-haze sm:max-w-[320px]"
            />
            <div role="group" aria-label="Filter the directory" className="flex gap-2 overflow-x-auto">
              {filters.map(option => (
                <button
                  key={option.value}
                  onClick={() => setFilter(option.value)}
                  aria-pressed={filter === option.value}
                  className={`shrink-0 rounded-[3px] border px-3 py-1.5 text-[12.5px] tracking-[-0.01em] transition-colors ${
                    filter === option.value
                      ? "border-mint text-mint"
                      : "border-control text-mist hover:border-mint hover:text-mint"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <p className="text-[12.5px] tracking-[-0.02em] text-haze" role="status">
            {shown.length === chainTokens.length
              ? `${chainTokens.length} tokens`
              : `${shown.length} of ${chainTokens.length} tokens`}
          </p>

          {shown.length === 0 ? (
            <p className="py-6 text-center text-[13.5px] tracking-[-0.01em] text-haze">
              Nothing matches that. The directory covers the last{" "}
              {tokenRegistry.scannedBlocks.toLocaleString("en-US")} blocks, so an asset that has not moved in
              that window is not in it yet.
            </p>
          ) : (
            <ul className="grid gap-2 lg:grid-cols-2 [&>*]:min-w-0">
              {shown.map(token => (
                <TokenRow key={token.address} token={token} />
              ))}
            </ul>
          )}
        </div>
      </Panel>

      <p className="text-[13px] leading-[1.6] tracking-[-0.02em] text-haze">
        The directory is generated by <span className="text-mist">scripts/sync-tokens.mjs</span>, which walks the
        chain&apos;s transfer logs, asks each contract what it is, and downloads each logo once. Nothing here is
        fetched while you read it, and no request tells anyone which asset you were looking at.
      </p>
    </div>
  )
}
