# Safix app

The Safix application: borrow USDC against tokenized assets at zero interest, provide liquidity to the stability pool, and manage the private credit passport.

Currently a UI-first build with demo data. No wallet, chain, or backend is wired yet; every screen renders the intended product with local mock state.

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
