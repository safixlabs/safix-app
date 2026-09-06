# Safix app

The Safix application: borrow USDC against tokenized assets at zero interest, provide liquidity to the stability pool, and manage the private credit passport.

Built for Robinhood Chain (Arbitrum Orbit, mainnet chain id 4663, testnet 46630) with wagmi and viem. Wallet connection, network switching, and the SafixPool contract calls are wired; screens fall back to demo data until contract addresses are configured. The protocol contracts live in [safixlabs/safix](https://github.com/safixlabs/safix) under `contracts/`.

## Going live

Deploy the contracts to Robinhood Chain Testnet, then copy `.env.example` to `.env.local` and fill in the deployed addresses. With `NEXT_PUBLIC_POOL_ADDRESS` and `NEXT_PUBLIC_USDC_ADDRESS` set, the pool, borrow, and dashboard screens switch from demo data to live onchain reads and writes (approve, deposit, withdraw, lock, draw, repay, claim).

- Protocol overview: [safixlabs/safix](https://github.com/safixlabs/safix)
- Documentation: [safix-docs.vercel.app](https://safix-docs.vercel.app)

## Network

Reads go through the endpoints named below, in order, and fall through to the
next one when an endpoint fails. The chain's own public RPC is always the last
resort, so configuring nothing still works; it is rate limited and Robinhood
documents it for wallet connectivity rather than production traffic.

```
NEXT_PUBLIC_RPC_OVERRIDE    dedicated endpoint, tried first
NEXT_PUBLIC_RPC_FALLBACK    second endpoint, tried when the first fails
```

Providers named in Robinhood Chain's documentation: QuickNode, Alchemy,
Blockdaemon, dRPC and Validation Cloud. One dedicated endpoint is enough — the
public RPC stays behind it automatically, which is what makes the fallback real.

Both values ship in the browser bundle, as every `NEXT_PUBLIC_` value does, so
restrict the key to your own domain in the provider's dashboard.

Reads are folded into a single Multicall3 call per screen and batched into one
HTTP request, refreshed every `NEXT_PUBLIC_REFRESH_MS` while the tab is visible
and never while it is hidden. When no endpoint answers the interface says so
rather than showing zeroes.

## Telemetry

Both halves are off unless configured, so a fork or a local run reports nothing
anywhere.

```
NEXT_PUBLIC_SENTRY_DSN       error reporting; absent means none is sent
NEXT_PUBLIC_PLAUSIBLE_SRC    analytics script; absent means none is loaded
NEXT_PUBLIC_RELEASE          commit being served, so traces map to source
NEXT_PUBLIC_ENVIRONMENT      production, preview, and so on
```

Nothing identifying leaves the browser. Sentry's own collection of user info,
cookies, headers, bodies and query strings is switched off, and every event is
then walked and redacted anyway: accounts, transaction hashes, long hex and
token amounts are replaced before the report is sent. What survives is the
stack trace, the release, and the chain. Analytics is cookieless and records
page views plus named funnel steps carrying only the chain and a collateral
ticker.

Source maps are generated, uploaded to Sentry during the same build that
produced the bundle, and then deleted from the output, so this private
repository is not published alongside it. The upload needs three variables in
the build environment; without them the build still succeeds and the maps are
still deleted.

```
SENTRY_AUTH_TOKEN            a token with project:releases
SENTRY_ORG                   the organisation slug
SENTRY_PROJECT               the project slug
```

Alerting is configured in Sentry rather than in code: an issue alert on the
project, firing when the number of events in an hour exceeds its usual level,
delivered wherever the team reads alerts.

## Screens

- Dashboard: collateral value, fixed debt, available credit, passport status, positions with health.
- Borrow: pick collateral, draw USDC, see the one-time fee and post-draw health. No time-based cost anywhere.
- Pool: stability pool stats, deposit and withdraw, how providers earn from liquidation gains and rewards.
- Passport: the five private checks, disclosure level, shareable proof.

## Development

```
npm install
npm run dev
```

## Build

```
npm run build
```

The static site is written to `out/`.
