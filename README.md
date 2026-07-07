# GEX Research Platform

Crypto-first Gamma Exposure research platform inspired by GammaFlip-style workflows.

This repository is a runnable V2 prototype with:

- A pure Node.js API for instruments, GEX summary, GEX by strike, term structure, signals, and data health.
- A GammaFlip-style browser research app for BTC and ETH with live Deribit option-chain snapshots by default.
- A Deribit public market data collector backed by a local DuckDB file for historical option-chain research.
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
npm.cmd run db:init
npm.cmd run diagnose:deribit
npm.cmd run latency:deribit -- --symbols=BTC,ETH --samples=5
npm.cmd run collect:deribit -- --symbols=BTC,ETH --once
npm.cmd run schedule:deribit:daily -- --time=07:00 --symbols=BTC,ETH
npm.cmd run inspect:duckdb
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
GET /api/deribit/latency?symbol=BTC&samples=3
```

The current V2 uses Deribit live public market data for current BTC/ETH snapshots. DuckDB is used as the historical collector and cache for History, heatmaps, and change tables. Fixture mode remains available for offline tests and UI development.

## Deribit + DuckDB Data Pipeline

The Deribit integration uses public JSON-RPC market data. API keys are not required for current option-chain snapshots because the app reads public book summaries, instruments, and ticker-derived fields.

```bash
npm.cmd run db:init
npm.cmd run diagnose:deribit
npm.cmd run latency:deribit -- --symbols=BTC,ETH --samples=5
npm.cmd run collect:deribit -- --symbols=BTC,ETH --once
npm.cmd run collect:deribit -- --symbols=BTC,ETH --interval=60000
npm.cmd run schedule:deribit:daily -- --time=07:00 --symbols=BTC,ETH
npm.cmd run inspect:duckdb
```

The local database defaults to `.data/gex.duckdb` and is ignored by Git. The collector stores raw Deribit payloads plus normalized fields for instruments, option tickers, index prices, and source-run health. Set `GEX_DB_PATH` to move the database. The collector defaults to `public/get_book_summary_by_currency`, so a full BTC/ETH snapshot usually takes seconds rather than hundreds of per-instrument ticker calls.

The daily scheduler command creates a Windows Task Scheduler job named `GEX Deribit Daily Snapshot`. It runs at local machine time, so `--time=07:00` means Beijing 07:00 when Windows is set to Asia/Shanghai. This records one forward-looking snapshot per day; Deribit public APIs do not provide full historical option-chain state for arbitrary past timestamps, so dense History heatmaps require running the interval collector continuously, for example `--interval=600000` for 10-minute snapshots.

Observed proxy-path latency on this workstation on 2026-07-07:

```text
BTC book_summary: p50 about 1.3s for ~874 option contracts
ETH book_summary: p50 about 1.7s for ~712 option contracts
```

Runtime data source selection:

```bash
cmd /c "set DATA_SOURCE=auto&& npm.cmd start"
cmd /c "set DATA_SOURCE=deribit&& npm.cmd start"
cmd /c "set DATA_SOURCE=fixture&& npm.cmd start"
```

- `fixture`: always use deterministic sample data.
- `auto`: default mode; use Deribit Live for current snapshots, attach DuckDB history when available, then fall back to DuckDB and fixture data if live access fails.
- `deribit`: require Deribit Live current data and return an API error when unavailable.
- `duckdb`: reserved for local historical snapshot workflows; set `DERIBIT_REALTIME=0` to force current endpoints to read DuckDB before fixture fallback.

Deribit currently provides BTC and ETH option chains in this pipeline. Symbols without Deribit option instruments, such as SOL, are hidden from the live selector until another venue connector is added.

Optional future auth placeholders:

```text
DERIBIT_ENV=prod|testnet
DERIBIT_ENDPOINT=https://www.deribit.com/api/v2
DERIBIT_PROXY_URL=socks5h://127.0.0.1:7890
DERIBIT_AUTO_PROXY=0
DERIBIT_REALTIME=1
DERIBIT_REALTIME_TTL_MS=30000
DERIBIT_COLLECTOR_MODE=summary|ticker
DERIBIT_CLIENT_ID=...
DERIBIT_CLIENT_SECRET=...
```

`DERIBIT_ENDPOINT` can be set to `https://rest.deribit.com/api/v2` for compatibility testing, but the official default remains `https://www.deribit.com/api/v2`.

If the browser can open Deribit but command-line collection times out, run:

```bash
npm.cmd run diagnose:deribit
cmd /c "set DERIBIT_PROXY_URL=socks5h://127.0.0.1:7890&& npm.cmd run diagnose:deribit"
cmd /c "set DERIBIT_ENDPOINT=https://rest.deribit.com/api/v2&& npm.cmd run diagnose:deribit"
```

The Python probe is available for comparing Python network behavior and exporting a CSV instrument list:

```bash
pip install requests
python scripts/deribit_probe.py --symbol BTC --csv output/deribit_btc_options_list.csv
```

Do not commit `.env` files or local DuckDB databases.

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
