# TradFi GEX via AKShare Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a TradFi module to the existing GEX Research Web App using AKShare for China index/ETF/commodity option data while preserving the existing Crypto/Deribit flow.

**Architecture:** Keep Node.js as the API/runtime layer and DuckDB as the local research database. Add AKShare only inside Python collector/probe scripts; Node calls Python jobs via `child_process`, validates normalized JSON contracts, writes generic TradFi tables, and feeds the existing GEX UI through an expanded common option contract shape. Crypto keeps Deribit Live first under `DATA_SOURCE=auto`; TradFi uses latest DuckDB AKShare snapshots.

**Tech Stack:** Node.js ESM, vanilla JS frontend, DuckDB via `@duckdb/node-api`, Python 3.9+, AKShare, Node test runner.

---

## Current-State Findings

- `src/domain/gex.js` currently exports `SUPPORTED_SYMBOLS = ["BTC", "ETH", "SOL", "XRP"]`; TradFi symbols such as `CN.SHFE.au` will be rejected until symbol validation is generalized.
- `calculateGexSnapshot()` currently calculates Black-Scholes gamma internally and assumes crypto-style unit exposure: `gamma * spot^2 * 0.01 * openInterest`. TradFi requires model selection and `contractMultiplier`.
- `src/data/duckdbRepository.js` currently has Deribit-specific tables and methods only; generic `tradfi_*` tables must be added without breaking `deribit_*`.
- `src/server/api.js` routes every `/api/gex/*` request through `getSnapshot(symbol)`, which falls back to fixtures. TradFi must never fall back to fake data.
- `src/public/app.js` has a visible `Crypto/TradFi` tab, but symbols are currently a flat list and asset icons assume crypto tickers.
- History paths already support warning states when fewer than two real snapshots exist. Reuse this behavior with AKShare-specific messages.

## External Constraints To Respect

- AKShare is a Python library and should not be imported by Node request handlers.
- AKShare interfaces can change or disappear; the first implementation task must be a probe that records field availability and interface health.
- First production data path must not synthesize IV, Greeks, or history. It may calculate Greeks from real IV/price, and it may reverse-solve IV from real quotes. If IV solving fails, skip the contract and record warnings.
- US market support is not a V1 deliverable unless probe proves stable option chain, OI, IV/Greeks, multiplier, and underlying price coverage.

## File Structure

Create:
- `scripts/akshare_probe.py` - Calls candidate AKShare interfaces, prints a field/sample/availability matrix as JSON.
- `scripts/akshare_collect.py` - Calls AKShare for selected symbols, normalizes raw rows into a common JSON envelope, supports `--symbols`, `--once`, `--interval`, `--dry-run`.
- `src/integrations/akshareNormalize.js` - Validates Python JSON envelopes and maps rows into common option contracts plus warnings.
- `src/domain/optionPricing.js` - Black-Scholes, Black-76, IV solver, and normal PDF/CDF helpers.
- `src/data/akshareCollector.js` - Node wrapper around the Python collector.
- `src/jobs/diagnoseAkshare.js` - Runs the probe through Node and prints matrix output.
- `src/jobs/collectAkshareSnapshot.js` - Runs the AKShare collector and writes DuckDB snapshots.
- `test/akshare.test.js` - Normalization, missing field, gamma, multiplier tests.

Modify:
- `package.json` - Add `diagnose:akshare`, `collect:akshare`, and extend `check`.
- `README.md` - Document Python/AKShare install, commands, limitations.
- `src/domain/gex.js` - Remove crypto-only symbol guard and delegate gamma/GEX math to `optionPricing.js`.
- `src/data/duckdbRepository.js` - Add `tradfi_*` schema and read/write methods.
- `src/server/api.js` - Route `DATA_SOURCE=akshare`, `auto` TradFi behavior, instruments, Data Health, and structured unsupported responses.
- `src/public/app.js` - Enable TradFi grouping, disabled/partial US groups, and no-fake-history warnings.
- `src/public/styles.css` - Add grouped picker and disabled/partial state styling.
- `test/api.test.js` - Add TradFi instrument/API/history/Data Health coverage.
- `test/ui.test.js` - Add grouped selector and warning text assertions.

## Data Contracts

### Python collector JSON envelope

Every `scripts/akshare_collect.py --once` run prints this shape to stdout:

```json
{
  "sourceName": "akshare",
  "observedAt": "2026-07-08T01:00:00.000Z",
  "symbols": [
    {
      "symbol": "CN.SHFE.au",
      "region": "CN",
      "venue": "SHFE",
      "underlying": "au",
      "status": "ok",
      "underlyingPrice": 558.42,
      "rawInstruments": [],
      "rawRows": [],
      "contracts": [
        {
          "symbol": "CN.SHFE.au",
          "venue": "SHFE",
          "region": "CN",
          "underlying": "au",
          "instrumentName": "au2510C560",
          "expiry": "2025-10-15",
          "strike": 560,
          "optionType": "call",
          "openInterest": 16234,
          "impliedVolatility": 0.1862,
          "gamma": null,
          "contractMultiplier": 1000,
          "underlyingPrice": 558.42,
          "markPrice": 8.72,
          "bidPrice": 8.68,
          "askPrice": 8.76,
          "asOf": "2026-07-08T01:00:00.000Z",
          "sourceName": "akshare",
          "pricingModel": "black76"
        }
      ],
      "warnings": []
    }
  ]
}
```

### Common option contract shape consumed by `calculateGexSnapshot`

```js
{
  symbol: "CN.SHFE.au",
  venue: "SHFE",
  region: "CN",
  underlying: "au",
  instrumentName: "au2510C560",
  expiry: "2025-10-15",
  strike: 560,
  optionType: "call",
  openInterest: 16234,
  impliedVolatility: 0.1862,
  gamma: null,
  contractMultiplier: 1000,
  underlyingPrice: 558.42,
  markPrice: 8.72,
  bidPrice: 8.68,
  askPrice: 8.76,
  asOf: "2026-07-08T01:00:00.000Z",
  sourceName: "akshare",
  pricingModel: "black76"
}
```

## Symbol Taxonomy

Use explicit prefixed symbols to avoid collision with crypto:

```js
const MARKET_GROUPS = [
  {
    id: "crypto",
    label: "Crypto",
    symbols: ["BTC", "ETH"]
  },
  {
    id: "cn-index-etf-options",
    label: "China Index/ETF Options",
    symbols: ["CN.CFFEX.IF", "CN.SSE.510050", "CN.SZSE.159919"]
  },
  {
    id: "cn-commodity-options",
    label: "China Commodity Options",
    symbols: ["CN.SHFE.au", "CN.SHFE.ag", "CN.SHFE.cu", "CN.INE.sc", "CN.DCE.i", "CN.DCE.m", "CN.DCE.c", "CN.DCE.p", "CN.CZCE.SR", "CN.CZCE.CF"]
  },
  {
    id: "us-options",
    label: "US Index/Futures Options",
    symbols: ["US.CBOE.SPX", "US.CME.ES"],
    status: "partial"
  }
];
```

## DuckDB Schema

Add these tables in `runSchema(connection)` without changing existing Deribit tables:

```sql
create table if not exists tradfi_source_runs (
  run_id varchar primary key,
  source_name varchar not null,
  symbol varchar,
  region varchar,
  venue varchar,
  observed_at varchar,
  status varchar not null,
  instrument_count integer default 0,
  ticker_count integer default 0,
  skipped_contracts integer default 0,
  missing_iv integer default 0,
  missing_oi integer default 0,
  missing_multiplier integer default 0,
  warnings_json varchar,
  error varchar,
  created_at varchar not null
);

create table if not exists tradfi_instruments (
  instrument_name varchar primary key,
  symbol varchar,
  region varchar,
  venue varchar,
  underlying varchar,
  expiry varchar,
  strike double,
  option_type varchar,
  contract_multiplier double,
  pricing_model varchar,
  raw_json varchar,
  updated_at varchar
);

create table if not exists tradfi_option_tickers (
  instrument_name varchar,
  symbol varchar,
  region varchar,
  venue varchar,
  observed_at varchar,
  underlying_price double,
  open_interest double,
  implied_volatility double,
  gamma double,
  mark_price double,
  bid_price double,
  ask_price double,
  volume double,
  contract_multiplier double,
  raw_json varchar,
  primary key (instrument_name, observed_at)
);

create table if not exists tradfi_underlying_prices (
  symbol varchar,
  observed_at varchar,
  region varchar,
  venue varchar,
  underlying varchar,
  price double,
  raw_json varchar,
  primary key (symbol, observed_at)
);
```

## Task 1: AKShare Probe

**Files:**
- Create: `scripts/akshare_probe.py`
- Create: `src/jobs/diagnoseAkshare.js`
- Modify: `package.json`
- Test: manual command output, no DuckDB writes

- [ ] **Step 1: Create Python probe**

Create `scripts/akshare_probe.py`:

```python
import argparse
import importlib
import json
from datetime import datetime, timezone


CANDIDATE_CALLS = [
    {"name": "option_finance_board", "args": {"symbol": "沪深300股指期权", "end_month": "202607"}},
    {"name": "option_commodity_contract_sina", "args": {"symbol": "黄金期权"}},
    {"name": "option_commodity_contract_table_sina", "args": {"symbol": "黄金期权"}},
    {"name": "option_comm_info", "args": {"symbol": "黄金期权"}},
    {"name": "option_margin", "args": {"symbol": "黄金期权"}},
]


def sample_frame(df, max_rows=3):
    if df is None:
        return {"columns": [], "rows": []}
    rows = df.head(max_rows).where(df.notna(), None).to_dict(orient="records")
    return {"columns": list(df.columns), "rows": rows, "rowCount": int(len(df))}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--symbols", default="CN.CFFEX.IF,CN.SHFE.au")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    report = {
        "sourceName": "akshare",
        "observedAt": datetime.now(timezone.utc).isoformat(),
        "requestedSymbols": [item.strip() for item in args.symbols.split(",") if item.strip()],
        "interfaces": [],
    }

    try:
        ak = importlib.import_module("akshare")
        report["akshareVersion"] = getattr(ak, "__version__", "unknown")
    except Exception as error:
        report["status"] = "unavailable"
        report["error"] = str(error)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        raise SystemExit(1)

    for candidate in CANDIDATE_CALLS:
        entry = {"name": candidate["name"], "args": candidate["args"]}
        try:
            fn = getattr(ak, candidate["name"])
            df = fn(**candidate["args"])
            entry.update({"status": "ok", "sample": sample_frame(df)})
        except Exception as error:
            entry.update({"status": "failed", "error": str(error)})
        report["interfaces"].append(entry)

    report["status"] = "ok"
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Add Node wrapper**

Create `src/jobs/diagnoseAkshare.js`:

```js
import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const python = process.env.PYTHON_BIN ?? "python";
const child = spawn(python, ["scripts/akshare_probe.py", ...args], {
  cwd: process.cwd(),
  stdio: "inherit",
  windowsHide: true,
});

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
```

- [ ] **Step 3: Wire npm script and syntax check**

Modify `package.json`:

```json
"diagnose:akshare": "node src/jobs/diagnoseAkshare.js"
```

Append `&& node --check src/jobs/diagnoseAkshare.js` to the `check` script.

- [ ] **Step 4: Run probe**

Run:

```powershell
npm.cmd run check
npm.cmd run diagnose:akshare -- --symbols=CN.CFFEX.IF,CN.SHFE.au --json
```

Expected:
- If AKShare is missing: JSON with `"status": "unavailable"` and an import error.
- If AKShare is installed: JSON matrix listing candidate interfaces, columns, row counts, and failures.

- [ ] **Step 5: Commit**

```powershell
git add package.json scripts/akshare_probe.py src/jobs/diagnoseAkshare.js
git commit -m "feat: add akshare probe"
```

## Task 2: Option Pricing and TradFi GEX Math

**Files:**
- Create: `src/domain/optionPricing.js`
- Modify: `src/domain/gex.js`
- Test: `test/akshare.test.js`, `test/gex.test.js`

- [ ] **Step 1: Add failing unit tests**

Create `test/akshare.test.js`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import { black76Gamma, blackScholesGamma, calculateOptionGamma, solveImpliedVolatility } from "../src/domain/optionPricing.js";
import { calculateGexSnapshot } from "../src/domain/gex.js";

test("Black-76 gamma returns finite positive gamma for futures options", () => {
  const gamma = black76Gamma({
    futuresPrice: 560,
    strike: 560,
    volatility: 0.2,
    timeToExpiryYears: 30 / 365,
  });

  assert.equal(Number.isFinite(gamma), true);
  assert.equal(gamma > 0, true);
});

test("Black-Scholes gamma returns finite positive gamma for ETF options", () => {
  const gamma = blackScholesGamma({
    spotPrice: 3.1,
    strike: 3.1,
    volatility: 0.2,
    timeToExpiryYears: 30 / 365,
  });

  assert.equal(Number.isFinite(gamma), true);
  assert.equal(gamma > 0, true);
});

test("IV solver returns finite volatility for a valid call quote", () => {
  const iv = solveImpliedVolatility({
    model: "black-scholes",
    optionType: "call",
    underlyingPrice: 100,
    strike: 100,
    timeToExpiryYears: 30 / 365,
    optionPrice: 2.3,
  });

  assert.equal(Number.isFinite(iv), true);
  assert.equal(iv > 0.01 && iv < 2, true);
});

test("contract multiplier changes GEX magnitude", () => {
  const base = {
    symbol: "CN.SHFE.au",
    spotPrice: 560,
    asOf: "2026-07-08T01:00:00.000Z",
    contracts: [
      {
        instrumentName: "au2510C560",
        expiry: "2026-10-15",
        strike: 560,
        optionType: "call",
        openInterest: 100,
        impliedVolatility: 0.2,
        contractMultiplier: 1,
        pricingModel: "black76",
      },
    ],
  };

  const one = calculateGexSnapshot(base);
  const ten = calculateGexSnapshot({
    ...base,
    contracts: [{ ...base.contracts[0], contractMultiplier: 10 }],
  });

  assert.equal(Math.round(ten.netGex / one.netGex), 10);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```powershell
node --test test/akshare.test.js
```

Expected:
- FAIL because `src/domain/optionPricing.js` does not exist and `calculateGexSnapshot` rejects `CN.SHFE.au`.

- [ ] **Step 3: Implement option pricing helpers**

Create `src/domain/optionPricing.js`:

```js
const MIN_VOL = 0.0001;
const MAX_VOL = 5;

export function calculateOptionGamma({
  model = "black-scholes",
  optionType = "call",
  underlyingPrice,
  strike,
  volatility,
  timeToExpiryYears,
}) {
  if (model === "black76") {
    return black76Gamma({
      futuresPrice: underlyingPrice,
      strike,
      volatility,
      timeToExpiryYears,
    });
  }
  return blackScholesGamma({
    spotPrice: underlyingPrice,
    strike,
    volatility,
    timeToExpiryYears,
  });
}

export function blackScholesGamma({ spotPrice, strike, volatility, timeToExpiryYears }) {
  const sigma = Math.max(Number(volatility), MIN_VOL);
  const t = Math.max(Number(timeToExpiryYears), 1 / 3650);
  const d1 = (Math.log(Number(spotPrice) / Number(strike)) + 0.5 * sigma * sigma * t) / (sigma * Math.sqrt(t));
  return normalPdf(d1) / (Number(spotPrice) * sigma * Math.sqrt(t));
}

export function black76Gamma({ futuresPrice, strike, volatility, timeToExpiryYears }) {
  const sigma = Math.max(Number(volatility), MIN_VOL);
  const t = Math.max(Number(timeToExpiryYears), 1 / 3650);
  const d1 = (Math.log(Number(futuresPrice) / Number(strike)) + 0.5 * sigma * sigma * t) / (sigma * Math.sqrt(t));
  return normalPdf(d1) / (Number(futuresPrice) * sigma * Math.sqrt(t));
}

export function solveImpliedVolatility({
  model = "black-scholes",
  optionType = "call",
  underlyingPrice,
  strike,
  timeToExpiryYears,
  optionPrice,
}) {
  let low = MIN_VOL;
  let high = MAX_VOL;
  const target = Number(optionPrice);
  if (!Number.isFinite(target) || target <= 0) return null;

  for (let index = 0; index < 80; index += 1) {
    const mid = (low + high) / 2;
    const price = optionPriceFromVol({
      model,
      optionType,
      underlyingPrice,
      strike,
      timeToExpiryYears,
      volatility: mid,
    });
    if (!Number.isFinite(price)) return null;
    if (price > target) high = mid;
    else low = mid;
  }

  const iv = (low + high) / 2;
  return Number.isFinite(iv) && iv > 0 ? iv : null;
}

function optionPriceFromVol({ model, optionType, underlyingPrice, strike, timeToExpiryYears, volatility }) {
  const s = Number(underlyingPrice);
  const k = Number(strike);
  const t = Math.max(Number(timeToExpiryYears), 1 / 3650);
  const sigma = Math.max(Number(volatility), MIN_VOL);
  const d1 = (Math.log(s / k) + 0.5 * sigma * sigma * t) / (sigma * Math.sqrt(t));
  const d2 = d1 - sigma * Math.sqrt(t);
  if (optionType === "put") {
    return k * normalCdf(-d2) - s * normalCdf(-d1);
  }
  return s * normalCdf(d1) - k * normalCdf(d2);
}

function normalPdf(value) {
  return Math.exp(-0.5 * value * value) / Math.sqrt(2 * Math.PI);
}

function normalCdf(value) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * erf);
}
```

- [ ] **Step 4: Refactor `gex.js` to use pricing helpers and multiplier**

Modify `src/domain/gex.js`:

```js
import { calculateOptionGamma } from "./optionPricing.js";
```

Change `calculateGexSnapshot` symbol validation from crypto-only to non-empty:

```js
if (!symbol || typeof symbol !== "string") {
  throw new Error("symbol must be a non-empty string");
}
```

Replace `normalizeContract` gamma/GEX internals with:

```js
const contractMultiplier = Number(contract.contractMultiplier ?? 1);
const pricingModel = contract.pricingModel ?? "black-scholes";
const underlyingPrice = Number(contract.underlyingPrice ?? spotPrice);
const gamma = Number.isFinite(Number(contract.gamma))
  ? Number(contract.gamma)
  : calculateOptionGamma({
      model: pricingModel,
      optionType,
      underlyingPrice,
      strike,
      volatility: impliedVolatility,
      timeToExpiryYears,
    });
const direction = optionType === "put" ? -1 : 1;
const gex = direction * gamma * underlyingPrice * underlyingPrice * 0.01 * openInterest * contractMultiplier;
```

Return `contractMultiplier`, `pricingModel`, and `underlyingPrice` from `normalizeContract`.

- [ ] **Step 5: Run tests**

Run:

```powershell
node --test test/akshare.test.js test/gex.test.js
npm.cmd run check
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```powershell
git add src/domain/gex.js src/domain/optionPricing.js test/akshare.test.js
git commit -m "feat: add tradfi option pricing"
```

## Task 3: AKShare Normalization

**Files:**
- Create: `src/integrations/akshareNormalize.js`
- Modify: `test/akshare.test.js`

- [ ] **Step 1: Add normalization tests**

Append to `test/akshare.test.js`:

```js
import { normalizeAkshareEnvelope } from "../src/integrations/akshareNormalize.js";

test("AKShare raw rows normalize into common option contract shape", () => {
  const result = normalizeAkshareEnvelope({
    sourceName: "akshare",
    observedAt: "2026-07-08T01:00:00.000Z",
    symbols: [
      {
        symbol: "CN.SHFE.au",
        region: "CN",
        venue: "SHFE",
        underlying: "au",
        underlyingPrice: 560,
        contracts: [
          {
            symbol: "CN.SHFE.au",
            venue: "SHFE",
            region: "CN",
            underlying: "au",
            instrumentName: "au2510C560",
            expiry: "2026-10-15",
            strike: 560,
            optionType: "call",
            openInterest: 100,
            impliedVolatility: 0.2,
            contractMultiplier: 1000,
            underlyingPrice: 560,
            asOf: "2026-07-08T01:00:00.000Z",
            sourceName: "akshare",
            pricingModel: "black76"
          }
        ],
        warnings: []
      }
    ]
  });

  assert.equal(result.snapshots.length, 1);
  assert.equal(result.snapshots[0].contracts[0].contractMultiplier, 1000);
  assert.equal(result.snapshots[0].contracts[0].pricingModel, "black76");
});

test("missing OI, IV, or multiplier rows are skipped with warnings", () => {
  const result = normalizeAkshareEnvelope({
    sourceName: "akshare",
    observedAt: "2026-07-08T01:00:00.000Z",
    symbols: [
      {
        symbol: "CN.SHFE.au",
        region: "CN",
        venue: "SHFE",
        underlying: "au",
        underlyingPrice: 560,
        contracts: [
          { instrumentName: "missing-oi", expiry: "2026-10-15", strike: 560, optionType: "call", impliedVolatility: 0.2, contractMultiplier: 1000 },
          { instrumentName: "missing-iv", expiry: "2026-10-15", strike: 560, optionType: "call", openInterest: 10, contractMultiplier: 1000 },
          { instrumentName: "missing-multiplier", expiry: "2026-10-15", strike: 560, optionType: "call", openInterest: 10, impliedVolatility: 0.2 }
        ],
        warnings: []
      }
    ]
  });

  assert.equal(result.snapshots[0].contracts.length, 0);
  assert.equal(result.snapshots[0].stats.skippedContracts, 3);
  assert.equal(result.snapshots[0].stats.missingOi, 1);
  assert.equal(result.snapshots[0].stats.missingIv, 1);
  assert.equal(result.snapshots[0].stats.missingMultiplier, 1);
});
```

- [ ] **Step 2: Implement normalizer**

Create `src/integrations/akshareNormalize.js`:

```js
export function normalizeAkshareEnvelope(envelope) {
  const observedAt = envelope.observedAt ?? new Date().toISOString();
  const snapshots = (envelope.symbols ?? []).map((entry) => normalizeSymbolSnapshot(entry, observedAt));
  return {
    sourceName: "akshare",
    observedAt,
    snapshots,
  };
}

function normalizeSymbolSnapshot(entry, observedAt) {
  const stats = {
    skippedContracts: 0,
    missingIv: 0,
    missingOi: 0,
    missingMultiplier: 0,
  };
  const warnings = [...(entry.warnings ?? [])];
  const contracts = [];

  for (const raw of entry.contracts ?? []) {
    const openInterest = numberOrNull(raw.openInterest);
    const impliedVolatility = numberOrNull(raw.impliedVolatility);
    const contractMultiplier = numberOrNull(raw.contractMultiplier);

    if (openInterest === null) {
      stats.skippedContracts += 1;
      stats.missingOi += 1;
      warnings.push(`${raw.instrumentName ?? "unknown"} skipped: missing openInterest`);
      continue;
    }
    if (impliedVolatility === null) {
      stats.skippedContracts += 1;
      stats.missingIv += 1;
      warnings.push(`${raw.instrumentName ?? "unknown"} skipped: missing impliedVolatility`);
      continue;
    }
    if (contractMultiplier === null) {
      stats.skippedContracts += 1;
      stats.missingMultiplier += 1;
      warnings.push(`${raw.instrumentName ?? "unknown"} skipped: missing contractMultiplier`);
      continue;
    }

    contracts.push({
      symbol: entry.symbol,
      venue: raw.venue ?? entry.venue,
      region: raw.region ?? entry.region,
      underlying: raw.underlying ?? entry.underlying,
      instrumentName: raw.instrumentName,
      expiry: raw.expiry,
      strike: Number(raw.strike),
      optionType: normalizeOptionType(raw.optionType),
      openInterest,
      impliedVolatility,
      gamma: numberOrNull(raw.gamma),
      contractMultiplier,
      underlyingPrice: numberOrNull(raw.underlyingPrice) ?? numberOrNull(entry.underlyingPrice),
      markPrice: numberOrNull(raw.markPrice),
      bidPrice: numberOrNull(raw.bidPrice),
      askPrice: numberOrNull(raw.askPrice),
      volume: numberOrNull(raw.volume) ?? 0,
      asOf: raw.asOf ?? observedAt,
      sourceName: "akshare",
      pricingModel: raw.pricingModel ?? defaultPricingModel(entry.symbol),
      raw,
    });
  }

  return {
    symbol: entry.symbol,
    region: entry.region,
    venue: entry.venue,
    underlying: entry.underlying,
    underlyingPrice: numberOrNull(entry.underlyingPrice),
    observedAt,
    contracts,
    rawInstruments: entry.rawInstruments ?? [],
    rawRows: entry.rawRows ?? [],
    warnings,
    stats,
  };
}

function normalizeOptionType(value) {
  const text = String(value ?? "").toLowerCase();
  if (["c", "call", "购", "认购"].includes(text)) return "call";
  if (["p", "put", "沽", "认沽"].includes(text)) return "put";
  return text;
}

function defaultPricingModel(symbol) {
  return symbol?.includes(".SHFE.") || symbol?.includes(".DCE.") || symbol?.includes(".CZCE.") || symbol?.includes(".INE.")
    ? "black76"
    : "black-scholes";
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
```

- [ ] **Step 3: Run tests**

```powershell
node --test test/akshare.test.js
npm.cmd run check
```

- [ ] **Step 4: Commit**

```powershell
git add src/integrations/akshareNormalize.js test/akshare.test.js package.json
git commit -m "feat: normalize akshare option contracts"
```

## Task 4: Python AKShare Collector

**Files:**
- Create: `scripts/akshare_collect.py`
- Create: `src/data/akshareCollector.js`
- Create: `src/jobs/collectAkshareSnapshot.js`
- Modify: `package.json`
- Test: `test/akshare.test.js`

- [ ] **Step 1: Create collector script**

Create `scripts/akshare_collect.py`:

```python
import argparse
import importlib
import json
import time
from datetime import datetime, timezone


SYMBOL_CONFIG = {
    "CN.CFFEX.IF": {"region": "CN", "venue": "CFFEX", "underlying": "IF", "kind": "finance", "multiplier": 300, "pricingModel": "black-scholes"},
    "CN.SHFE.au": {"region": "CN", "venue": "SHFE", "underlying": "au", "kind": "commodity", "akName": "黄金期权", "multiplier": 1000, "pricingModel": "black76"},
    "CN.SHFE.ag": {"region": "CN", "venue": "SHFE", "underlying": "ag", "kind": "commodity", "akName": "白银期权", "multiplier": 15, "pricingModel": "black76"},
    "CN.SHFE.cu": {"region": "CN", "venue": "SHFE", "underlying": "cu", "kind": "commodity", "akName": "铜期权", "multiplier": 5, "pricingModel": "black76"},
    "CN.INE.sc": {"region": "CN", "venue": "INE", "underlying": "sc", "kind": "commodity", "akName": "原油期权", "multiplier": 1000, "pricingModel": "black76"},
    "CN.DCE.i": {"region": "CN", "venue": "DCE", "underlying": "i", "kind": "commodity", "akName": "铁矿石期权", "multiplier": 100, "pricingModel": "black76"},
    "CN.DCE.m": {"region": "CN", "venue": "DCE", "underlying": "m", "kind": "commodity", "akName": "豆粕期权", "multiplier": 10, "pricingModel": "black76"},
    "CN.DCE.c": {"region": "CN", "venue": "DCE", "underlying": "c", "kind": "commodity", "akName": "玉米期权", "multiplier": 10, "pricingModel": "black76"},
    "CN.DCE.p": {"region": "CN", "venue": "DCE", "underlying": "p", "kind": "commodity", "akName": "棕榈油期权", "multiplier": 10, "pricingModel": "black76"},
    "CN.CZCE.SR": {"region": "CN", "venue": "CZCE", "underlying": "SR", "kind": "commodity", "akName": "白糖期权", "multiplier": 10, "pricingModel": "black76"},
    "CN.CZCE.CF": {"region": "CN", "venue": "CZCE", "underlying": "CF", "kind": "commodity", "akName": "棉花期权", "multiplier": 5, "pricingModel": "black76"},
}


def now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def number(value):
    try:
        if value is None or value == "":
            return None
        return float(value)
    except Exception:
        return None


def collect_symbol(ak, symbol, observed_at):
    config = SYMBOL_CONFIG.get(symbol)
    if not config:
        return {
            "symbol": symbol,
            "status": "unsupported",
            "warnings": [f"{symbol} unsupported by first AKShare collector version"],
            "contracts": [],
        }

    if config["kind"] == "commodity":
        return collect_commodity_symbol(ak, symbol, config, observed_at)

    return {
        "symbol": symbol,
        "region": config["region"],
        "venue": config["venue"],
        "underlying": config["underlying"],
        "status": "partial",
        "warnings": [f"{symbol} finance option chain requires probe-confirmed field mapping before collection"],
        "contracts": [],
        "rawRows": [],
        "rawInstruments": [],
    }


def collect_commodity_symbol(ak, symbol, config, observed_at):
    warnings = []
    raw_rows = []
    contracts = []
    underlying_price = None

    try:
        table = ak.option_commodity_contract_table_sina(symbol=config["akName"])
        raw_rows = table.where(table.notna(), None).to_dict(orient="records")
    except Exception as error:
        return {
            "symbol": symbol,
            "region": config["region"],
            "venue": config["venue"],
            "underlying": config["underlying"],
            "status": "error",
            "warnings": [str(error)],
            "contracts": [],
            "rawRows": [],
            "rawInstruments": [],
        }

    for row in raw_rows:
        instrument = str(row.get("合约") or row.get("看涨合约") or row.get("看跌合约") or "")
        strike = number(row.get("行权价") or row.get("执行价"))
        option_type = "call" if "C" in instrument.upper() or "购" in instrument else "put" if "P" in instrument.upper() or "沽" in instrument else None
        expiry = row.get("到期日") or row.get("最后交易日")
        oi = number(row.get("持仓量") or row.get("持仓"))
        iv = number(row.get("隐含波动率") or row.get("IV"))
        mark = number(row.get("最新价") or row.get("收盘价") or row.get("结算价"))
        bid = number(row.get("买价") or row.get("买一价"))
        ask = number(row.get("卖价") or row.get("卖一价"))
        underlying_price = underlying_price or number(row.get("标的最新价") or row.get("标的价格") or row.get("期货最新价"))

        if not instrument or not strike or not option_type or not expiry:
            warnings.append(f"Skipped row with incomplete identity fields: {row}")
            continue

        contracts.append({
            "symbol": symbol,
            "venue": config["venue"],
            "region": config["region"],
            "underlying": config["underlying"],
            "instrumentName": instrument,
            "expiry": str(expiry)[:10],
            "strike": strike,
            "optionType": option_type,
            "openInterest": oi,
            "impliedVolatility": iv,
            "gamma": None,
            "contractMultiplier": config["multiplier"],
            "underlyingPrice": underlying_price,
            "markPrice": mark,
            "bidPrice": bid,
            "askPrice": ask,
            "asOf": observed_at,
            "sourceName": "akshare",
            "pricingModel": config["pricingModel"],
            "raw": row,
        })

    return {
        "symbol": symbol,
        "region": config["region"],
        "venue": config["venue"],
        "underlying": config["underlying"],
        "status": "ok",
        "underlyingPrice": underlying_price,
        "contracts": contracts,
        "rawRows": raw_rows,
        "rawInstruments": [],
        "warnings": warnings,
    }


def run_once(symbols, dry_run=False):
    observed_at = now_iso()
    ak = importlib.import_module("akshare")
    envelope = {
        "sourceName": "akshare",
        "observedAt": observed_at,
        "dryRun": dry_run,
        "symbols": [collect_symbol(ak, symbol, observed_at) for symbol in symbols],
    }
    print(json.dumps(envelope, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--symbols", default="CN.CFFEX.IF,CN.SHFE.au")
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--interval", type=int, default=0)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    symbols = [item.strip() for item in args.symbols.split(",") if item.strip()]

    if args.interval and not args.once:
      while True:
          run_once(symbols, args.dry_run)
          time.sleep(args.interval / 1000)
    else:
      run_once(symbols, args.dry_run)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Add Node wrapper**

Create `src/data/akshareCollector.js`:

```js
import { spawn } from "node:child_process";

import { normalizeAkshareEnvelope } from "../integrations/akshareNormalize.js";

export async function runAkshareCollector({ symbols = "CN.CFFEX.IF,CN.SHFE.au", once = true, interval = 0, dryRun = false } = {}) {
  const python = process.env.PYTHON_BIN ?? "python";
  const args = ["scripts/akshare_collect.py", `--symbols=${symbols}`];
  if (once) args.push("--once");
  if (interval) args.push(`--interval=${interval}`);
  if (dryRun) args.push("--dry-run");

  const output = await collectStdout(python, args);
  const lines = output.trim().split(/\r?\n/).filter(Boolean);
  return lines.map((line) => normalizeAkshareEnvelope(JSON.parse(line)));
}

function collectStdout(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `${command} exited with ${code}`));
    });
  });
}
```

- [ ] **Step 3: Add job**

Create `src/jobs/collectAkshareSnapshot.js`:

```js
import { runAkshareCollector } from "../data/akshareCollector.js";
import { createDuckDbRepository } from "../data/duckdbRepository.js";

const args = parseArgs(process.argv.slice(2));
const dryRun = args["dry-run"] === "true" || args["dry-run"] === "1";
const interval = Number(args.interval ?? 0);
const symbols = args.symbols ?? "CN.CFFEX.IF,CN.SHFE.au";

if (interval > 0 && !dryRun) {
  console.log(`Starting AKShare collector interval=${interval}ms symbols=${symbols}`);
  while (true) {
    await collectOnce({ symbols, dryRun });
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
} else {
  await collectOnce({ symbols, dryRun });
}

async function collectOnce({ symbols, dryRun }) {
  const envelopes = await runAkshareCollector({ symbols, once: true, dryRun });
  if (dryRun) {
    console.log(JSON.stringify(envelopes, null, 2));
    return;
  }
  const repo = await createDuckDbRepository();
  try {
    for (const envelope of envelopes) {
      for (const snapshot of envelope.snapshots) {
        await repo.insertTradFiSnapshot(snapshot);
        console.log(`${snapshot.symbol} akshare contracts=${snapshot.contracts.length} skipped=${snapshot.stats.skippedContracts}`);
      }
    }
  } finally {
    repo.close();
  }
}

function parseArgs(argv) {
  return Object.fromEntries(
    argv
      .filter((arg) => arg.startsWith("--"))
      .map((arg) => {
        const [key, value = "true"] = arg.slice(2).split("=");
        return [key, value];
      }),
  );
}
```

- [ ] **Step 4: Add npm scripts**

Modify `package.json`:

```json
"collect:akshare": "node src/jobs/collectAkshareSnapshot.js"
```

Append `src/data/akshareCollector.js` and `src/jobs/collectAkshareSnapshot.js` to `check`.

- [ ] **Step 5: Run dry-run**

```powershell
npm.cmd run check
npm.cmd run collect:akshare -- --symbols=CN.CFFEX.IF,CN.SHFE.au --once --dry-run=true
```

Expected:
- JSON envelope prints.
- Unsupported/partial symbols are explicit.
- No DuckDB writes.

- [ ] **Step 6: Commit**

```powershell
git add package.json scripts/akshare_collect.py src/data/akshareCollector.js src/jobs/collectAkshareSnapshot.js
git commit -m "feat: add akshare collector job"
```

## Task 5: DuckDB TradFi Repository

**Files:**
- Modify: `src/data/duckdbRepository.js`
- Modify: `test/akshare.test.js`

- [ ] **Step 1: Add repository tests**

Append to `test/akshare.test.js`:

```js
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createDuckDbRepository } from "../src/data/duckdbRepository.js";

test("DuckDB stores and returns latest AKShare snapshot", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gex-akshare-"));
  const repo = await createDuckDbRepository({ dbPath: join(dir, "test.duckdb") });
  try {
    await repo.insertTradFiSnapshot({
      symbol: "CN.SHFE.au",
      region: "CN",
      venue: "SHFE",
      underlying: "au",
      underlyingPrice: 560,
      observedAt: "2026-07-08T01:00:00.000Z",
      contracts: [
        {
          symbol: "CN.SHFE.au",
          venue: "SHFE",
          region: "CN",
          underlying: "au",
          instrumentName: "au2510C560",
          expiry: "2026-10-15",
          strike: 560,
          optionType: "call",
          openInterest: 100,
          impliedVolatility: 0.2,
          contractMultiplier: 1000,
          underlyingPrice: 560,
          asOf: "2026-07-08T01:00:00.000Z",
          sourceName: "akshare",
          pricingModel: "black76",
          raw: {}
        }
      ],
      rawInstruments: [],
      rawRows: [],
      warnings: [],
      stats: { skippedContracts: 0, missingIv: 0, missingOi: 0, missingMultiplier: 0 }
    });

    const latest = await repo.getLatestTradFiOptionChain("CN.SHFE.au");
    assert.equal(latest.symbol, "CN.SHFE.au");
    assert.equal(latest.contracts.length, 1);
    assert.equal(latest.contracts[0].contractMultiplier, 1000);
  } finally {
    repo.close();
  }
});
```

- [ ] **Step 2: Add schema and methods**

Modify `src/data/duckdbRepository.js`:

```js
async insertTradFiSnapshot(snapshot) {
  await connection.run(
    `insert into tradfi_source_runs
      (run_id, source_name, symbol, region, venue, observed_at, status, instrument_count, ticker_count,
       skipped_contracts, missing_iv, missing_oi, missing_multiplier, warnings_json, created_at)
     values
      ($run_id, 'akshare', $symbol, $region, $venue, $observed_at, 'ok', $instrument_count, $ticker_count,
       $skipped_contracts, $missing_iv, $missing_oi, $missing_multiplier, $warnings_json, $created_at)`,
    {
      run_id: randomUUID(),
      symbol: snapshot.symbol,
      region: snapshot.region,
      venue: snapshot.venue,
      observed_at: snapshot.observedAt,
      instrument_count: snapshot.rawInstruments?.length ?? snapshot.contracts.length,
      ticker_count: snapshot.contracts.length,
      skipped_contracts: snapshot.stats?.skippedContracts ?? 0,
      missing_iv: snapshot.stats?.missingIv ?? 0,
      missing_oi: snapshot.stats?.missingOi ?? 0,
      missing_multiplier: snapshot.stats?.missingMultiplier ?? 0,
      warnings_json: JSON.stringify(snapshot.warnings ?? []),
      created_at: new Date().toISOString(),
    },
  );

  for (const contract of snapshot.contracts) {
    await connection.run(
      `insert or replace into tradfi_instruments
        (instrument_name, symbol, region, venue, underlying, expiry, strike, option_type, contract_multiplier, pricing_model, raw_json, updated_at)
       values
        ($instrument_name, $symbol, $region, $venue, $underlying, $expiry, $strike, $option_type, $contract_multiplier, $pricing_model, $raw_json, $updated_at)`,
      {
        instrument_name: contract.instrumentName,
        symbol: contract.symbol,
        region: contract.region,
        venue: contract.venue,
        underlying: contract.underlying,
        expiry: contract.expiry,
        strike: contract.strike,
        option_type: contract.optionType,
        contract_multiplier: contract.contractMultiplier,
        pricing_model: contract.pricingModel,
        raw_json: JSON.stringify(contract.raw ?? contract),
        updated_at: snapshot.observedAt,
      },
    );
    await connection.run(
      `insert or replace into tradfi_option_tickers
        (instrument_name, symbol, region, venue, observed_at, underlying_price, open_interest, implied_volatility,
         gamma, mark_price, bid_price, ask_price, volume, contract_multiplier, raw_json)
       values
        ($instrument_name, $symbol, $region, $venue, $observed_at, $underlying_price, $open_interest, $implied_volatility,
         $gamma, $mark_price, $bid_price, $ask_price, $volume, $contract_multiplier, $raw_json)`,
      {
        instrument_name: contract.instrumentName,
        symbol: contract.symbol,
        region: contract.region,
        venue: contract.venue,
        observed_at: snapshot.observedAt,
        underlying_price: contract.underlyingPrice,
        open_interest: contract.openInterest,
        implied_volatility: contract.impliedVolatility,
        gamma: contract.gamma,
        mark_price: contract.markPrice,
        bid_price: contract.bidPrice,
        ask_price: contract.askPrice,
        volume: contract.volume,
        contract_multiplier: contract.contractMultiplier,
        raw_json: JSON.stringify(contract.raw ?? contract),
      },
    );
  }
}
```

Add `getLatestTradFiOptionChain(symbol)`, `getTradFiOptionChainHistory(symbol, opts)`, `getAvailableTradFiSymbols()`, and `getTradFiHealth()` mirroring the Deribit methods but reading `tradfi_*`.

- [ ] **Step 3: Run repository tests**

```powershell
node --test test/akshare.test.js
node --test test/deribit.test.js
```

- [ ] **Step 4: Commit**

```powershell
git add src/data/duckdbRepository.js test/akshare.test.js
git commit -m "feat: store akshare snapshots in duckdb"
```

## Task 6: API Routing and Data Source Semantics

**Files:**
- Modify: `src/server/api.js`
- Modify: `test/api.test.js`

- [ ] **Step 1: Add API tests**

Append to `test/api.test.js`:

```js
test("unsupported US symbol returns structured unavailable status", async () => {
  const previousSource = process.env.DATA_SOURCE;
  process.env.DATA_SOURCE = "akshare";
  const handler = createApiHandler();
  try {
    const response = await handler(new Request("http://localhost/api/gex/studio?symbol=US.CBOE.SPX"));
    const payload = await response.json();
    assert.equal(response.status, 400);
    assert.match(payload.error, /unsupported|unavailable|partial/i);
  } finally {
    if (previousSource === undefined) delete process.env.DATA_SOURCE;
    else process.env.DATA_SOURCE = previousSource;
  }
});
```

- [ ] **Step 2: Implement symbol classification**

Add to `src/server/api.js`:

```js
function marketKind(symbol) {
  if (["BTC", "ETH", "SOL", "XRP"].includes(symbol)) return "crypto";
  if (symbol.startsWith("CN.")) return "tradfi-cn";
  if (symbol.startsWith("US.")) return "tradfi-us";
  return "unknown";
}
```

Update `requiredSymbol(url)` so it accepts `CN.*` and `US.*` but does not check `optionChains` for them.

- [ ] **Step 3: Update `getSnapshot(symbol)`**

Implement this source behavior:

```js
if (source === "akshare") {
  return await getDuckDbAkshareSnapshot(symbol, { throwOnMissing: true });
}
if (source === "auto" && marketKind(symbol) === "tradfi-cn") {
  return await getDuckDbAkshareSnapshot(symbol, { throwOnMissing: true });
}
if (marketKind(symbol) === "tradfi-us") {
  throw new Error(`US TradFi symbol is partial or unsupported: ${symbol}`);
}
```

Crypto logic remains unchanged: Deribit Live, then DuckDB, then fixture only for crypto.

- [ ] **Step 4: Add AKShare snapshot reader**

Add:

```js
async function getDuckDbAkshareSnapshot(symbol, { throwOnMissing = false } = {}) {
  let repo;
  try {
    repo = await createDuckDbRepository({ dbPath: getDuckDbPath() });
    const latest = await repo.getLatestTradFiOptionChain(symbol);
    if (!latest || latest.contracts.length === 0) {
      if (throwOnMissing) throw new Error(`AKShare data unavailable for symbol: ${symbol}`);
      return null;
    }
    const historyInputs = await repo.getTradFiOptionChainHistory(symbol, { hours: 90 * 24, limit: 720 });
    const historySnapshots = historyInputs.map((input) => safeSnapshot(input)).filter(Boolean);
    const snapshot = calculateGexSnapshot(latest);
    return {
      ...snapshot,
      sourceLabel: "AKShare",
      sourceName: "akshare-duckdb",
      historySnapshots,
    };
  } finally {
    repo?.close();
  }
}
```

- [ ] **Step 5: Update real history helpers**

Rename `isDeribitMarketSnapshot` to `isRealMarketSnapshot`:

```js
function isRealMarketSnapshot(snapshot) {
  return ["deribit-duckdb", "deribit-live", "akshare-duckdb"].includes(snapshot.sourceName);
}
```

Change warning strings for AKShare:

```js
function historyWarning(snapshot, suffix) {
  return snapshot.sourceName === "akshare-duckdb"
    ? `Not enough AKShare snapshots yet. Keep the collector running. ${suffix}`
    : `Not enough historical Deribit snapshots yet. Keep the collector running ${suffix}`;
}
```

- [ ] **Step 6: Run API tests**

```powershell
node --test test/api.test.js test/akshare.test.js
npm.cmd run check
```

- [ ] **Step 7: Commit**

```powershell
git add src/server/api.js test/api.test.js
git commit -m "feat: route akshare tradfi snapshots"
```

## Task 7: UI TradFi Selector and Data Health

**Files:**
- Modify: `src/public/app.js`
- Modify: `src/public/styles.css`
- Modify: `test/ui.test.js`

- [ ] **Step 1: Add UI static tests**

Append to `test/ui.test.js`:

```js
test("UI supports grouped TradFi instruments and partial states", () => {
  const source = readFileSync("src/public/app.js", "utf8");
  [
    "China Index/ETF Options",
    "China Commodity Options",
    "US Index/Futures Options",
    "partial",
    "Not enough AKShare snapshots yet. Keep the collector running.",
  ].forEach((needle) => assert.match(source, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
});
```

- [ ] **Step 2: Group instruments in context picker**

Modify `renderContextPicker()` so it groups by `instrument.group`:

```js
const grouped = groupInstruments(state.instruments);
els.ctxAssetList.replaceChildren(
  ...grouped.flatMap((group) => [
    groupHeader(group.label),
    ...group.instruments.map((instrument) => instrumentButton(instrument)),
  ]),
);
```

Add:

```js
function groupInstruments(instruments) {
  const order = ["Crypto", "China Index/ETF Options", "China Commodity Options", "US Index/Futures Options"];
  const groups = new Map();
  instruments.forEach((instrument) => {
    const label = instrument.group ?? "Crypto";
    groups.set(label, [...(groups.get(label) ?? []), instrument]);
  });
  return order.filter((label) => groups.has(label)).map((label) => ({ label, instruments: groups.get(label) }));
}

function groupHeader(labelText) {
  const node = document.createElement("div");
  node.className = "asset-group-header";
  node.textContent = labelText;
  return node;
}
```

Instrument buttons with `status === "partial"` or `disabled === true` should show a partial badge and avoid selecting when disabled.

- [ ] **Step 3: Update Data Health renderer**

Add columns for AKShare:

```html
<th>Skipped</th><th>Missing IV</th><th>Missing OI</th><th>Missing Multiplier</th>
```

Render missing values as `0` for Deribit/fixture and actual counts for AKShare.

- [ ] **Step 4: Add styles**

Add to `src/public/styles.css`:

```css
.asset-group-header {
  padding: 10px 14px 6px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.asset-status {
  border: 1px solid rgba(255, 193, 7, 0.45);
  border-radius: 999px;
  color: #ffc857;
  font-size: 11px;
  padding: 2px 7px;
}

button.is-disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
```

- [ ] **Step 5: Run UI tests**

```powershell
node --test test/ui.test.js
npm.cmd run check
```

- [ ] **Step 6: Commit**

```powershell
git add src/public/app.js src/public/styles.css test/ui.test.js
git commit -m "feat: expose tradfi selector and health"
```

## Task 8: End-to-End Verification and Docs

**Files:**
- Modify: `README.md`
- Modify: `docs/data-dictionary.md`

- [ ] **Step 1: Update README commands**

Add:

```markdown
### AKShare TradFi

Install Python dependencies:

```powershell
python -m pip install akshare pandas duckdb
```

Probe AKShare interfaces:

```powershell
npm.cmd run diagnose:akshare -- --symbols=CN.CFFEX.IF,CN.SHFE.au --json
```

Collect once:

```powershell
npm.cmd run collect:akshare -- --symbols=CN.CFFEX.IF,CN.SHFE.au --once
```

Collect continuously:

```powershell
npm.cmd run collect:akshare -- --symbols=CN.CFFEX.IF,CN.SHFE.au --interval=600000
```

Limitations:
- US options are shown as partial/unsupported until AKShare probe confirms chain, OI, IV/Greeks, multiplier, and underlying coverage.
- History views require at least two real AKShare snapshots.
- Missing IV/OI/multiplier rows are skipped and surfaced in Data Health.
```

- [ ] **Step 2: Update data dictionary**

Add definitions for:
- `tradfi_source_runs`
- `tradfi_instruments`
- `tradfi_option_tickers`
- `tradfi_underlying_prices`
- `contractMultiplier`
- `pricingModel`

- [ ] **Step 3: Full verification**

Run:

```powershell
npm.cmd run check
node --test
npm.cmd run diagnose:akshare -- --symbols=CN.CFFEX.IF,CN.SHFE.au --json
npm.cmd run collect:akshare -- --symbols=CN.CFFEX.IF,CN.SHFE.au --once
npm.cmd run inspect:duckdb
npm.cmd start
```

Open `http://localhost:4173` and verify:
- Crypto still loads BTC/ETH via Deribit or existing fallback.
- Context picker has Crypto, China Index/ETF Options, China Commodity Options, US Index/Futures Options.
- `CN.SHFE.au` either renders real AKShare data or returns a structured unavailable warning.
- History shows `Not enough AKShare snapshots yet. Keep the collector running.` when only one snapshot exists.
- Data Health shows AKShare last update, coverage, skipped contracts, missing IV, missing OI, missing multiplier.

- [ ] **Step 4: Commit**

```powershell
git add README.md docs/data-dictionary.md
git commit -m "docs: document akshare tradfi pipeline"
```

## Implementation Order and Commit Boundaries

1. `feat: add akshare probe`
2. `feat: add tradfi option pricing`
3. `feat: normalize akshare option contracts`
4. `feat: add akshare collector job`
5. `feat: store akshare snapshots in duckdb`
6. `feat: route akshare tradfi snapshots`
7. `feat: expose tradfi selector and health`
8. `docs: document akshare tradfi pipeline`

## Risk Register

- AKShare commodity option table field names may differ across products. Mitigation: probe first, preserve raw rows, skip incomplete contracts with warning.
- Financial option interfaces may require different parameters per exchange/product. Mitigation: ship first V1 commodity path plus partial CFFEX/ETF state until probe confirms stable mapping.
- IV may be absent in many AKShare rows. Mitigation: only reverse-solve from real quotes; if bid/ask/mark is missing or solver fails, skip and count `missingIv`.
- `calculateGexSnapshot` refactor could alter crypto output. Mitigation: keep existing `test/gex.test.js` and API fixture tests passing before any AKShare API work.
- Python environment may not have AKShare. Mitigation: `diagnose:akshare` returns structured unavailable status; Node API does not import Python at request time.

## Self-Review

- Spec coverage:
  - China financial/ETF/commodity scope: covered by probe and symbol taxonomy; commodity first collection implemented, finance/ETF partial until field mapping passes probe.
  - US partial/unsupported: covered in API/UI tasks.
  - `DATA_SOURCE=akshare` and auto semantics: covered in Task 6.
  - Python collector and commands: covered in Tasks 1 and 4.
  - DuckDB generic schema: covered in Task 5.
  - Common contract shape and model math: covered in Tasks 2 and 3.
  - No fake data/history: covered in Task 6 and Task 7 warning behavior.
  - Data Health missing-field stats: covered in Tasks 5 and 7.
  - Tests and verification: covered in each task and Task 8.
- Placeholder scan: no `TBD`, `TODO`, or empty implementation steps remain.
- Type consistency:
  - `contractMultiplier`, `pricingModel`, `underlyingPrice`, `impliedVolatility`, and `openInterest` names are consistent across Python envelope, JS normalizer, DuckDB, and GEX math.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-08-tradfi-gex-akshare.md`. Two execution options:

1. **Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, faster iteration.
2. **Inline Execution** - Execute tasks in this session using executing-plans, with checkpoints after each commit boundary.

