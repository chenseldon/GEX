# GEX Research Platform

Crypto-first Gamma Exposure research platform inspired by GammaFlip-style workflows.

This repository is a runnable V2 prototype with:

- A pure Node.js API for instruments, GEX summary, GEX by strike, term structure, signals, and data health.
- A GammaFlip-style browser research app for BTC, ETH, SOL, and XRP using deterministic Deribit/Bybit/OKX-style sample option chains.
- A tested model core for instrument parsing, GEX aggregation, gamma flip, walls, max pain, and signal classification.
- V2 dashboard widgets: gauges, dual-layer GEX by strike, key levels, 24h trend charts, 3D-style heatmaps, and GEX change table coverage toggles.
- V2 studio widgets: Now/Expiry/History/Forecast tabs, Snapshot/Day/Hour mode buttons, dual-layer strike chart, summary rail, marker chips, zoom slider, CSV export, and notes.
- Research documentation for formulas, data contracts, and product scope.

## Run

```bash
node --test
node src/server/server.js
```

Open `http://localhost:4173`.

Use a different port if needed:

```bash
cmd /c "set PORT=4174&& npm.cmd start"
```

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
- `v2-dashboard`: full GammaFlip-style research dashboard and studio with chart interactions and export.
- `v3-research-lab`: playback, notes, regime studies, report export.
- `v4-prod-beta`: scheduled ingestion, monitoring, auth-ready API, deployment.

## V2 API Surface

```text
GET /api/gex/dashboard?symbol=BTC
GET /api/gex/studio?symbol=BTC&expiry=2024-07-26&mode=snapshot
GET /api/gex/trends?symbol=BTC
GET /api/gex/heatmap?symbol=BTC&type=net
GET /api/gex/change-table?symbol=BTC&coverage=50
```

The current V2 uses deterministic fixture data, not live exchange collectors. Auth, subscriptions, paid feature gates, and third-party GammaFlip API dependencies are intentionally out of scope.

## GitHub Backup Workflow

After each version:

```bash
git status -sb
git add README.md package.json src test docs .github
git commit -m "feat: implement v2 gex research web app"
git push -u origin codex/v2-gex-research-web-app
```

Open a draft PR with test output, screenshots, and known limitations. If the local `.git` directory is sandboxed read-only, run the git branch/commit/push commands from an unrestricted terminal.

## Research Disclaimer

GEX is an analytical estimate derived from option-chain assumptions. It is not a trading signal by itself, not investment advice, and should be interpreted with liquidity, funding, volatility, and market-structure context.
