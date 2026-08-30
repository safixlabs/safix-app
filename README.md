# Safix app

The Safix application: borrow USDC against tokenized assets at zero interest, provide liquidity to the stability pool, and manage the private credit passport.

Built for Robinhood Chain (Arbitrum Orbit, mainnet chain id 4663, testnet 46630) with wagmi and viem. Wallet connection, network switching, and the SafixPool contract calls are wired; screens fall back to demo data until contract addresses are configured. The protocol contracts live in [safixlabs/safix](https://github.com/safixlabs/safix) under `contracts/`.

## Going live

Deploy the contracts to Robinhood Chain Testnet, then copy `.env.example` to `.env.local` and fill in the deployed addresses. With `NEXT_PUBLIC_POOL_ADDRESS` and `NEXT_PUBLIC_USDC_ADDRESS` set, the pool, borrow, and dashboard screens switch from demo data to live onchain reads and writes (approve, deposit, withdraw, lock, draw, repay, claim).

- Protocol overview: [safixlabs/safix](https://github.com/safixlabs/safix)
- Documentation: [safix-docs.vercel.app](https://safix-docs.vercel.app)

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
