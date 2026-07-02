# GEX Research Platform

Crypto-first Gamma Exposure research platform inspired by GammaFlip-style workflows.

This repository is a runnable first version with:

- A pure Node.js API for instruments, GEX summary, GEX by strike, term structure, signals, and data health.
- A browser dashboard for BTC, ETH, SOL, and XRP using Deribit-style sample option chains.
- A tested model core for instrument parsing, GEX aggregation, gamma flip, walls, max pain, and signal classification.
- Research documentation for formulas, data contracts, and product scope.

## Run

```bash
node --test
node src/server/server.js
```

Open `http://localhost:4173`.

## Scripts

```bash
node --test
npm.cmd run check
npm.cmd start
```

PowerShell may block `npm.ps1`; use `npm.cmd` on Windows.

## Version Roadmap

- `v0-research`: repository, docs, model assumptions, tested fixtures.
- `v1-model-core`: live collector, raw snapshots, calculation persistence.
- `v2-dashboard`: full research dashboard with chart interactions and export.
- `v3-research-lab`: playback, notes, regime studies, report export.
- `v4-prod-beta`: scheduled ingestion, monitoring, auth-ready API, deployment.

## Research Disclaimer

GEX is an analytical estimate derived from option-chain assumptions. It is not a trading signal by itself, not investment advice, and should be interpreted with liquidity, funding, volatility, and market-structure context.
