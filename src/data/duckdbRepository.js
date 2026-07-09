import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { DuckDBInstance } from "@duckdb/node-api";

import { normalizeIv } from "../integrations/deribitNormalize.js";
import { parseDeribitInstrumentName } from "../domain/gex.js";

const DEFAULT_DB_PATH = ".data/gex.duckdb";

export function getDuckDbPath() {
  return resolve(process.env.GEX_DB_PATH ?? DEFAULT_DB_PATH);
}

export async function initializeDuckDb({ dbPath = getDuckDbPath() } = {}) {
  await mkdir(dirname(dbPath), { recursive: true });
  const connection = await openConnection(dbPath);
  try {
    await runSchema(connection);
  } finally {
    connection.closeSync();
  }
}

export async function createDuckDbRepository({ dbPath = getDuckDbPath() } = {}) {
  await mkdir(dirname(dbPath), { recursive: true });
  const connection = await openConnection(dbPath);
  await runSchema(connection);

  return {
    dbPath,
    async insertDeribitSnapshot({ symbol, observedAt, instruments, tickers, warnings = [] }) {
      await connection.run(
        `insert into source_runs
          (run_id, venue, symbol, observed_at, status, instrument_count, ticker_count, warnings_json, created_at)
         values ($run_id, 'deribit', $symbol, $observed_at, 'ok', $instrument_count, $ticker_count, $warnings_json, $created_at)`,
        {
          run_id: randomUUID(),
          symbol,
          observed_at: observedAt,
          instrument_count: instruments.length,
          ticker_count: tickers.length,
          warnings_json: JSON.stringify(warnings),
          created_at: new Date().toISOString(),
        },
      );

      for (const instrument of instruments) {
        const parsed = safeParseInstrument(instrument.instrument_name);
        await connection.run(
          `insert or replace into deribit_instruments
            (instrument_name, currency, kind, strike, option_type, expiry, expiration_timestamp, is_active, raw_json, updated_at)
           values ($instrument_name, $currency, $kind, $strike, $option_type, $expiry, $expiration_timestamp, $is_active, $raw_json, $updated_at)`,
          {
            instrument_name: instrument.instrument_name,
            currency: instrument.currency ?? parsed?.symbol ?? symbol,
            kind: instrument.kind ?? "option",
            strike: Number(instrument.strike ?? parsed?.strike),
            option_type: instrument.option_type ?? parsed?.optionType,
            expiry: expiryFromInstrument(instrument) ?? parsed?.expiry,
            expiration_timestamp: Number(instrument.expiration_timestamp ?? 0),
            is_active: instrument.is_active !== false,
            raw_json: JSON.stringify(instrument),
            updated_at: observedAt,
          },
        );
      }

      for (const ticker of tickers) {
        const parsed = safeParseInstrument(ticker.instrumentName);
        await connection.run(
          `insert or replace into deribit_option_tickers
            (instrument_name, symbol, observed_at, underlying_price, open_interest, mark_iv, mark_price,
             bid_price, ask_price, last_price, volume, delta, gamma, theta, vega, rho, raw_json)
           values
            ($instrument_name, $symbol, $observed_at, $underlying_price, $open_interest, $mark_iv, $mark_price,
             $bid_price, $ask_price, $last_price, $volume, $delta, $gamma, $theta, $vega, $rho, $raw_json)`,
          {
            instrument_name: ticker.instrumentName,
            symbol: parsed?.symbol ?? symbol,
            observed_at: ticker.observedAt ?? observedAt,
            underlying_price: nullableNumber(ticker.underlyingPrice),
            open_interest: nullableNumber(ticker.openInterest),
            mark_iv: nullableNumber(ticker.markIv),
            mark_price: nullableNumber(ticker.markPrice),
            bid_price: nullableNumber(ticker.bidPrice),
            ask_price: nullableNumber(ticker.askPrice),
            last_price: nullableNumber(ticker.lastPrice),
            volume: nullableNumber(ticker.volume),
            delta: nullableNumber(ticker.greeks?.delta),
            gamma: nullableNumber(ticker.greeks?.gamma),
            theta: nullableNumber(ticker.greeks?.theta),
            vega: nullableNumber(ticker.greeks?.vega),
            rho: nullableNumber(ticker.greeks?.rho),
            raw_json: JSON.stringify(ticker.raw ?? ticker),
          },
        );
      }

      const spot = tickers.find((ticker) => Number.isFinite(Number(ticker.underlyingPrice)));
      if (spot) {
        await connection.run(
          `insert or replace into deribit_index_prices
            (symbol, observed_at, index_name, price, raw_json)
           values ($symbol, $observed_at, $index_name, $price, $raw_json)`,
          {
            symbol,
            observed_at: observedAt,
            index_name: `${symbol.toLowerCase()}_usd`,
            price: Number(spot.underlyingPrice),
            raw_json: JSON.stringify({ source: "deribit_ticker_underlying_price" }),
          },
        );
      }
    },

    async recordSourceFailure({ venue, symbol, observedAt = new Date().toISOString(), error }) {
      await connection.run(
        `insert into source_runs
          (run_id, venue, symbol, observed_at, status, instrument_count, ticker_count, warnings_json, error, created_at)
         values ($run_id, $venue, $symbol, $observed_at, 'error', 0, 0, '[]', $error, $created_at)`,
        {
          run_id: randomUUID(),
          venue,
          symbol,
          observed_at: observedAt,
          error: errorMessage(error),
          created_at: new Date().toISOString(),
        },
      );
    },

    async insertTradFiSnapshot({
      sourceName = "akshare",
      observedAt = new Date().toISOString(),
      requestedSymbols = [],
      status = "unavailable",
      snapshots = [],
      warnings = [],
    }) {
      const runId = randomUUID();
      const createdAt = monotonicIsoTimestamp();
      const normalizedSnapshots = Array.isArray(snapshots) ? snapshots : [];
      const requested = Array.isArray(requestedSymbols) ? requestedSymbols : [];
      const runWarnings = [...(Array.isArray(warnings) ? warnings : [])];
      const skipped = {
        contracts: 0,
        missingIv: 0,
        missingGamma: 0,
        missingOi: 0,
        missingMultiplier: 0,
        missingExpiry: 0,
        missingUnderlyingPrice: 0,
      };
      let storedContracts = 0;

      for (const snapshot of normalizedSnapshots) {
        const snapshotSymbol = snapshot?.symbol ?? null;
        if (snapshotSymbol) {
          await connection.run(
            `insert or replace into tradfi_instruments
              (source_run_id, source_name, symbol, venue, region, underlying, asset_class, status, observed_at, row_count, raw_json, updated_at)
             values
              ($source_run_id, $source_name, $symbol, $venue, $region, $underlying, $asset_class, $status, $observed_at, $row_count, $raw_json, $updated_at)`,
            {
              source_run_id: runId,
              source_name: sourceName,
              symbol: snapshotSymbol,
              venue: snapshot.venue ?? null,
              region: snapshot.region ?? null,
              underlying: snapshot.underlying ?? null,
              asset_class: snapshot.assetClass ?? null,
              status: snapshot.status ?? status,
              observed_at: observedAt,
              row_count: nullableInteger(snapshot.rowCount),
              raw_json: JSON.stringify(snapshot),
              updated_at: observedAt,
            },
          );
        }

        const contracts = tradFiContractsFromSnapshot(snapshot);
        addTradFiNormalizationWarnings(skipped, snapshot?.normalized?.warnings);
        addTradFiSkippedRowReasons(skipped, snapshot?.normalized?.skippedRows);
        for (const contract of contracts) {
          const validation = validateTradFiContract(contract);
          if (!validation.ok) {
            skipped.contracts += 1;
            skipped.missingIv += validation.missingIv ? 1 : 0;
            skipped.missingGamma += validation.missingGamma ? 1 : 0;
            skipped.missingOi += validation.missingOi ? 1 : 0;
            skipped.missingMultiplier += validation.missingMultiplier ? 1 : 0;
            skipped.missingExpiry += validation.missingExpiry ? 1 : 0;
            skipped.missingUnderlyingPrice += validation.missingUnderlyingPrice ? 1 : 0;
            runWarnings.push(
              `Skipped ${contract?.instrumentName ?? "unknown TradFi contract"}: ${validation.reasons.join("; ")}`,
            );
            continue;
          }

          await connection.run(
            `insert or replace into tradfi_option_tickers
              (source_run_id, source_name, instrument_name, symbol, observed_at, venue, region, underlying, expiry, strike,
               option_type, underlying_price, open_interest, implied_volatility, gamma, contract_multiplier,
               mark_price, bid_price, ask_price, volume, model, risk_free_rate, raw_json)
             values
              ($source_run_id, $source_name, $instrument_name, $symbol, $observed_at, $venue, $region, $underlying, $expiry, $strike,
               $option_type, $underlying_price, $open_interest, $implied_volatility, $gamma, $contract_multiplier,
               $mark_price, $bid_price, $ask_price, $volume, $model, $risk_free_rate, $raw_json)`,
            {
              source_run_id: runId,
              source_name: sourceName,
              instrument_name: contract.instrumentName,
              symbol: contract.symbol,
              observed_at: observedAt,
              venue: contract.venue ?? null,
              region: contract.region ?? null,
              underlying: contract.underlying ?? null,
              expiry: contract.expiry,
              strike: Number(contract.strike),
              option_type: contract.optionType,
              underlying_price: Number(contract.underlyingPrice),
              open_interest: Number(contract.openInterest),
              implied_volatility: nullableNumber(contract.impliedVolatility),
              gamma: nullableNumber(contract.gamma ?? contract.greeks?.gamma),
              contract_multiplier: Number(contract.contractMultiplier),
              mark_price: nullableNumber(contract.markPrice),
              bid_price: nullableNumber(contract.bidPrice),
              ask_price: nullableNumber(contract.askPrice),
              volume: nullableNumber(contract.volume),
              model: contract.model ?? null,
              risk_free_rate: nullableNumber(contract.riskFreeRate),
              raw_json: JSON.stringify(contract.raw ?? contract),
            },
          );
          storedContracts += 1;
        }

        const underlyingPrice = positiveNumber(snapshot?.underlyingPrice)
          ?? positiveNumber(contracts.find((contract) => positiveNumber(contract?.underlyingPrice))?.underlyingPrice);
        if (snapshotSymbol && underlyingPrice) {
          await connection.run(
            `insert or replace into tradfi_underlying_prices
              (source_run_id, source_name, symbol, observed_at, price, raw_json)
             values ($source_run_id, $source_name, $symbol, $observed_at, $price, $raw_json)`,
            {
              source_run_id: runId,
              source_name: sourceName,
              symbol: snapshotSymbol,
              observed_at: observedAt,
              price: underlyingPrice,
              raw_json: JSON.stringify({ source: "tradfi_snapshot_underlying_price" }),
            },
          );
        }
      }

      await connection.run(
        `insert into tradfi_source_runs
          (run_id, source_name, observed_at, requested_symbols_json, status, snapshot_count, raw_snapshot_count,
           contract_count, skipped_contract_count, missing_iv_count, missing_gamma_count, missing_oi_count, missing_multiplier_count,
           missing_expiry_count, missing_underlying_price_count, warnings_json, raw_json, created_at)
         values
          ($run_id, $source_name, $observed_at, $requested_symbols_json, $status, $snapshot_count, $raw_snapshot_count,
           $contract_count, $skipped_contract_count, $missing_iv_count, $missing_gamma_count, $missing_oi_count, $missing_multiplier_count,
           $missing_expiry_count, $missing_underlying_price_count, $warnings_json, $raw_json, $created_at)`,
        {
          run_id: runId,
          source_name: sourceName,
          observed_at: observedAt,
          requested_symbols_json: JSON.stringify(requested),
          status,
          snapshot_count: normalizedSnapshots.length,
          raw_snapshot_count: normalizedSnapshots.length,
          contract_count: storedContracts,
          skipped_contract_count: skipped.contracts,
          missing_iv_count: skipped.missingIv,
          missing_gamma_count: skipped.missingGamma,
          missing_oi_count: skipped.missingOi,
          missing_multiplier_count: skipped.missingMultiplier,
          missing_expiry_count: skipped.missingExpiry,
          missing_underlying_price_count: skipped.missingUnderlyingPrice,
          warnings_json: JSON.stringify(runWarnings),
          raw_json: JSON.stringify({
            sourceName,
            observedAt,
            requestedSymbols: requested,
            status,
            warnings,
            snapshots: normalizedSnapshots,
          }),
          created_at: createdAt,
        },
      );
    },

    async getLatestOptionChain(symbol) {
      const latestReader = await connection.runAndReadAll(
        `select max(observed_at) as observed_at
         from deribit_option_tickers
         where symbol = $symbol`,
        { symbol },
      );
      const latest = latestReader.getRowObjectsJson()[0]?.observed_at;
      if (!latest) {
        return null;
      }

      const reader = await connection.runAndReadAll(
        `select
           t.instrument_name,
           t.observed_at,
           t.underlying_price,
           t.open_interest,
           t.mark_iv,
           t.mark_price,
           t.volume,
           i.expiry,
           i.strike,
           i.option_type
         from deribit_option_tickers t
         left join deribit_instruments i on i.instrument_name = t.instrument_name
         where t.symbol = $symbol and t.observed_at = $observed_at
         order by i.expiry, i.strike, i.option_type`,
        { symbol, observed_at: latest },
      );
      const rows = reader.getRowObjectsJson();
      if (rows.length === 0) {
        return null;
      }

      return optionChainFromRows(symbol, latest, rows);
    },

    async getOptionChainHistory(symbol, { hours = 24, limit = 240 } = {}) {
      const cutoff = new Date(Date.now() - Number(hours) * 60 * 60 * 1000).toISOString();
      const observedReader = await connection.runAndReadAll(
        `select observed_at
         from (
           select distinct observed_at
           from deribit_option_tickers
           where symbol = $symbol and observed_at >= $cutoff
           order by observed_at desc
           limit $limit
         )
         order by observed_at asc`,
        { symbol, cutoff, limit: Number(limit) },
      );
      const observedAts = observedReader.getRowObjectsJson().map((row) => row.observed_at);
      const chains = [];

      for (const observedAt of observedAts) {
        const reader = await connection.runAndReadAll(
          `select
             t.instrument_name,
             t.observed_at,
             t.underlying_price,
             t.open_interest,
             t.mark_iv,
             t.mark_price,
             t.volume,
             i.expiry,
             i.strike,
             i.option_type
           from deribit_option_tickers t
           left join deribit_instruments i on i.instrument_name = t.instrument_name
           where t.symbol = $symbol and t.observed_at = $observed_at
           order by i.expiry, i.strike, i.option_type`,
          { symbol, observed_at: observedAt },
        );
        const rows = reader.getRowObjectsJson();
        if (rows.length > 0) {
          chains.push(optionChainFromRows(symbol, observedAt, rows));
        }
      }

      return chains;
    },

    async getLatestTradFiOptionChain(symbol) {
      const state = await getLatestTradFiSymbolState(connection, symbol);
      const latest = state?.observedAt;
      const runId = state?.runId;
      if (!latest || !runId) {
        return null;
      }

      const reader = await connection.runAndReadAll(
        `select
           instrument_name,
           symbol,
           observed_at,
           venue,
           region,
           underlying,
           expiry,
           strike,
           option_type,
           underlying_price,
           open_interest,
           implied_volatility,
           gamma,
           contract_multiplier,
           mark_price,
           bid_price,
           ask_price,
           volume,
           model,
           risk_free_rate
         from tradfi_option_tickers
         where symbol = $symbol and source_run_id = $source_run_id
         order by expiry, strike, option_type, instrument_name`,
        { symbol, source_run_id: runId },
      );
      const rows = reader.getRowObjectsJson();
      if (rows.length === 0) {
        return null;
      }

      return tradFiOptionChainFromRows(symbol, latest, rows);
    },

    async getAvailableSymbols() {
      const reader = await connection.runAndReadAll(
        `select symbol, max(observed_at) as last_snapshot_at, count(*) as ticker_count
         from deribit_option_tickers
         group by symbol
         order by symbol`,
      );
      return reader.getRowObjectsJson().map((row) => ({
        symbol: row.symbol,
        lastSnapshotAt: row.last_snapshot_at,
        tickerCount: Number(row.ticker_count ?? 0),
      }));
    },

    async getTradFiAvailableSymbols() {
      const states = await getTradFiSymbolStates(connection);
      const countReader = await connection.runAndReadAll(
        `select symbol, source_run_id, count(*) as contract_count
         from tradfi_option_tickers
         where source_run_id is not null
         group by symbol, source_run_id`,
      );
      const counts = new Map(
        countReader.getRowObjectsJson().map((row) => [
          `${row.symbol}\n${row.source_run_id}`,
          Number(row.contract_count ?? 0),
        ]),
      );

      return [...states.values()]
        .sort((a, b) => a.symbol.localeCompare(b.symbol))
        .map((state) => {
          const count = state.runId ? (counts.get(`${state.symbol}\n${state.runId}`) ?? 0) : 0;
          return {
            symbol: state.symbol,
            lastSnapshotAt: state.observedAt,
            tickerCount: count,
            contractCount: count,
            status: state.status ?? null,
          };
        });
    },

    async getHealth() {
      const reader = await connection.runAndReadAll(`
        select
          (select count(*) from deribit_instruments) as instrument_count,
          (select count(*) from deribit_option_tickers) as ticker_count,
          (select max(observed_at) from deribit_option_tickers) as last_snapshot_at,
          (select status from source_runs order by created_at desc limit 1) as last_status,
          (select warnings_json from source_runs order by created_at desc limit 1) as warnings_json,
          (select error from source_runs order by created_at desc limit 1) as error
      `);
      const row = reader.getRowObjectsJson()[0] ?? {};
      const lastStatus = row.last_status ?? null;
      const tradFiHealth = await getTradFiHealth(connection);
      return {
        name: "deribit-duckdb",
        status: row.last_snapshot_at ? "healthy" : lastStatus === "error" ? "unavailable" : "empty",
        lastSnapshotAt: row.last_snapshot_at ?? null,
        freshnessSeconds: row.last_snapshot_at
          ? Math.max(0, Math.round((Date.now() - new Date(row.last_snapshot_at).getTime()) / 1000))
          : null,
        dbPath,
        instruments: Number(row.instrument_count ?? 0),
        tickers: Number(row.ticker_count ?? 0),
        lastStatus,
        warnings: safeJson(row.warnings_json, []),
        error: row.error ?? null,
        akshare: tradFiHealth,
        tradfi: tradFiHealth,
      };
    },

    async getTableNames() {
      const reader = await connection.runAndReadAll(`
        select table_name
        from information_schema.tables
        where table_schema = 'main'
        order by table_name
      `);
      return reader.getRowObjectsJson().map((row) => row.table_name);
    },

    close() {
      connection.closeSync();
    },
  };
}

async function openConnection(dbPath) {
  const instance = await DuckDBInstance.fromCache(dbPath);
  return instance.connect();
}

async function runSchema(connection) {
  await connection.run(`
    create table if not exists source_runs (
      run_id varchar primary key,
      venue varchar not null,
      symbol varchar,
      observed_at varchar,
      status varchar not null,
      instrument_count integer default 0,
      ticker_count integer default 0,
      warnings_json varchar,
      error varchar,
      created_at varchar not null
    )
  `);

  await connection.run(`
    create table if not exists deribit_instruments (
      instrument_name varchar primary key,
      currency varchar,
      kind varchar,
      strike double,
      option_type varchar,
      expiry varchar,
      expiration_timestamp bigint,
      is_active boolean,
      raw_json varchar,
      updated_at varchar
    )
  `);

  await connection.run(`
    create table if not exists deribit_option_tickers (
      instrument_name varchar,
      symbol varchar,
      observed_at varchar,
      underlying_price double,
      open_interest double,
      mark_iv double,
      mark_price double,
      bid_price double,
      ask_price double,
      last_price double,
      volume double,
      delta double,
      gamma double,
      theta double,
      vega double,
      rho double,
      raw_json varchar,
      primary key (instrument_name, observed_at)
    )
  `);

  await connection.run(`
    create table if not exists deribit_index_prices (
      symbol varchar,
      observed_at varchar,
      index_name varchar,
      price double,
      raw_json varchar,
      primary key (symbol, observed_at)
    )
  `);

  await connection.run(`
    create table if not exists tradfi_source_runs (
      run_id varchar primary key,
      source_name varchar not null,
      observed_at varchar,
      requested_symbols_json varchar,
      status varchar not null,
      snapshot_count integer default 0,
      raw_snapshot_count integer default 0,
      contract_count integer default 0,
      skipped_contract_count integer default 0,
      missing_iv_count integer default 0,
      missing_gamma_count integer default 0,
      missing_oi_count integer default 0,
      missing_multiplier_count integer default 0,
      missing_expiry_count integer default 0,
      missing_underlying_price_count integer default 0,
      warnings_json varchar,
      raw_json varchar,
      created_at varchar not null
    )
  `);
  await connection.run(`
    alter table tradfi_source_runs
    add column if not exists missing_gamma_count integer default 0
  `);

  await connection.run(`
    create table if not exists tradfi_instruments (
      source_run_id varchar,
      source_name varchar not null,
      symbol varchar not null,
      venue varchar,
      region varchar,
      underlying varchar,
      asset_class varchar,
      status varchar,
      observed_at varchar not null,
      row_count integer,
      raw_json varchar,
      updated_at varchar,
      primary key (source_run_id, symbol)
    )
  `);
  await connection.run(`
    alter table tradfi_instruments
    add column if not exists source_run_id varchar
  `);

  await connection.run(`
    create table if not exists tradfi_option_tickers (
      source_run_id varchar,
      source_name varchar not null,
      instrument_name varchar not null,
      symbol varchar not null,
      observed_at varchar not null,
      venue varchar,
      region varchar,
      underlying varchar,
      expiry varchar,
      strike double,
      option_type varchar,
      underlying_price double,
      open_interest double,
      implied_volatility double,
      gamma double,
      contract_multiplier double,
      mark_price double,
      bid_price double,
      ask_price double,
      volume double,
      model varchar,
      risk_free_rate double,
      raw_json varchar,
      primary key (source_run_id, instrument_name)
    )
  `);
  await connection.run(`
    alter table tradfi_option_tickers
    add column if not exists source_run_id varchar
  `);

  await connection.run(`
    create table if not exists tradfi_underlying_prices (
      source_run_id varchar,
      source_name varchar not null,
      symbol varchar not null,
      observed_at varchar not null,
      price double,
      raw_json varchar,
      primary key (source_run_id, symbol)
    )
  `);
  await connection.run(`
    alter table tradfi_underlying_prices
    add column if not exists source_run_id varchar
  `);

  await connection.run(`
    create table if not exists gex_snapshots (
      snapshot_id varchar primary key,
      symbol varchar,
      venue varchar,
      observed_at varchar,
      spot_price double,
      net_gex double,
      total_open_interest double,
      gamma_flip double,
      raw_json varchar
    )
  `);

  await connection.run(`
    create table if not exists gex_by_strike (
      snapshot_id varchar,
      expiry varchar,
      strike double,
      call_gex double,
      put_gex double,
      net_gex double,
      open_interest double,
      gamma double
    )
  `);

  await connection.run(`
    create table if not exists deribit_option_candles (
      instrument_name varchar,
      resolution varchar,
      open_time bigint,
      open_time_iso varchar,
      open double,
      high double,
      low double,
      close double,
      volume double,
      cost double,
      source_method varchar,
      raw_json varchar,
      primary key (instrument_name, resolution, open_time)
    )
  `);

  await connection.run(`
    create table if not exists deribit_trades (
      trade_id varchar primary key,
      instrument_name varchar,
      timestamp bigint,
      timestamp_iso varchar,
      price double,
      amount double,
      direction varchar,
      tick_direction integer,
      index_price double,
      iv double,
      raw_json varchar
    )
  `);

  await connection.run(`
    create table if not exists deribit_historical_volatility (
      currency varchar,
      timestamp bigint,
      timestamp_iso varchar,
      volatility double,
      raw_json varchar,
      primary key (currency, timestamp)
    )
  `);
}

let lastMonotonicTimestampMs = 0;

function monotonicIsoTimestamp() {
  const now = Date.now();
  const next = now <= lastMonotonicTimestampMs ? lastMonotonicTimestampMs + 1 : now;
  lastMonotonicTimestampMs = next;
  return new Date(next).toISOString();
}

function expiryFromInstrument(instrument) {
  const timestamp = Number(instrument.expiration_timestamp);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return null;
  }
  return new Date(timestamp).toISOString().slice(0, 10);
}

function safeParseInstrument(instrumentName) {
  try {
    return parseDeribitInstrumentName(instrumentName);
  } catch {
    return null;
  }
}

function nullableNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nullableInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function nullableDbNumber(value) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function safeJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function errorMessage(error) {
  if (!(error instanceof Error)) {
    return String(error);
  }
  return error.cause?.message ? `${error.message}: ${error.cause.message}` : error.message;
}

function tradFiContractsFromSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    return [];
  }
  if (Array.isArray(snapshot.contracts)) {
    return snapshot.contracts;
  }
  if (Array.isArray(snapshot.normalized?.contracts)) {
    return snapshot.normalized.contracts;
  }
  return [];
}

function addTradFiNormalizationWarnings(target, warnings) {
  if (!warnings || typeof warnings !== "object") {
    return;
  }
  target.contracts += Number(warnings.skippedContracts ?? 0);
  target.missingIv += Number(warnings.missingIv ?? 0);
  target.missingOi += Number(warnings.missingOi ?? 0);
  target.missingMultiplier += Number(warnings.missingMultiplier ?? 0);
  target.missingUnderlyingPrice += Number(warnings.missingUnderlyingPrice ?? 0);
}

function addTradFiSkippedRowReasons(target, skippedRows) {
  if (!Array.isArray(skippedRows)) {
    return;
  }
  for (const row of skippedRows) {
    const reason = String(row?.reason ?? "");
    if (/gamma/i.test(reason)) target.missingGamma += 1;
    if (/expiry/i.test(reason)) target.missingExpiry += 1;
  }
}

function validateTradFiContract(contract) {
  const reasons = [];
  const missingIv = !positiveNumber(contract?.impliedVolatility);
  const missingGamma = !positiveNumber(contract?.gamma ?? contract?.greeks?.gamma);
  const model = contract?.model ?? "blackScholes";
  const canDeriveGamma = !missingIv && ["blackScholes", "black76"].includes(model);
  const missingGammaPath = missingGamma && !canDeriveGamma;
  const missingOi =
    !Number.isFinite(Number(contract?.openInterest)) || Number(contract.openInterest) < 0;
  const missingMultiplier = !positiveNumber(contract?.contractMultiplier);
  const missingExpiry = !contract?.expiry;
  const missingUnderlyingPrice = !positiveNumber(contract?.underlyingPrice);
  const strike = Number(contract?.strike);

  if (!contract?.symbol) reasons.push("missing symbol");
  if (!contract?.instrumentName) reasons.push("missing instrument name");
  if (!Number.isFinite(strike) || strike <= 0) reasons.push("missing strike");
  if (!["call", "put"].includes(contract?.optionType)) reasons.push("missing option type");
  if (missingExpiry) reasons.push("missing expiry");
  if (missingOi) reasons.push("missing open interest");
  if (missingMultiplier) reasons.push("missing contract multiplier");
  if (missingUnderlyingPrice) reasons.push("missing underlying price");
  if (missingGammaPath) reasons.push("missing implied volatility or gamma");

  return {
    ok: reasons.length === 0,
    reasons,
    missingIv,
    missingGamma: missingGammaPath,
    missingOi,
    missingMultiplier,
    missingExpiry,
    missingUnderlyingPrice,
  };
}

async function getLatestTradFiSymbolState(connection, symbol) {
  return (await getTradFiSymbolStates(connection, symbol)).get(symbol) ?? null;
}

async function getTradFiSymbolStates(connection, onlySymbol = null) {
  const states = new Map();
  const runReader = await connection.runAndReadAll(
    `select run_id, observed_at, status, requested_symbols_json, created_at
     from tradfi_source_runs
     order by created_at asc, observed_at asc`,
  );

  for (const row of runReader.getRowObjectsJson()) {
    for (const symbol of safeJson(row.requested_symbols_json, [])) {
      if (typeof symbol !== "string" || symbol.trim() === "") continue;
      if (onlySymbol && symbol !== onlySymbol) continue;
      updateTradFiSymbolState(states, {
        runId: row.run_id,
        symbol,
        observedAt: row.observed_at,
        status: row.status,
        createdAt: row.created_at,
      });
    }
  }

  const instrumentReader = await connection.runAndReadAll(
    `select
       i.source_run_id,
       i.symbol,
       i.observed_at,
       i.status,
       coalesce(r.created_at, i.updated_at) as created_at
     from tradfi_instruments i
     left join tradfi_source_runs r on r.run_id = i.source_run_id
     order by created_at asc, i.observed_at asc`,
  );

  for (const row of instrumentReader.getRowObjectsJson()) {
    if (onlySymbol && row.symbol !== onlySymbol) continue;
    updateTradFiSymbolState(states, {
      runId: row.source_run_id,
      symbol: row.symbol,
      observedAt: row.observed_at,
      status: row.status,
      createdAt: row.created_at,
    });
  }

  return states;
}

function updateTradFiSymbolState(states, next) {
  if (!next.symbol || !next.observedAt) return;
  const current = states.get(next.symbol);
  if (!current || compareTradFiState(next, current) >= 0) {
    states.set(next.symbol, next);
  }
}

function compareTradFiState(left, right) {
  const createdCompare = String(left.createdAt ?? "").localeCompare(String(right.createdAt ?? ""));
  if (createdCompare !== 0) return createdCompare;
  const observedCompare = String(left.observedAt).localeCompare(String(right.observedAt));
  if (observedCompare !== 0) return observedCompare;
  return String(left.runId ?? "").localeCompare(String(right.runId ?? ""));
}

async function getTradFiHealth(connection) {
  const reader = await connection.runAndReadAll(`
    select
      (select count(*) from tradfi_source_runs) as source_run_count,
      (select count(*) from tradfi_instruments) as raw_snapshot_count,
      (select count(*) from tradfi_option_tickers) as contract_count,
      (select max(observed_at) from tradfi_source_runs) as last_run_at,
      (select status from tradfi_source_runs order by created_at desc limit 1) as last_status,
      (select warnings_json from tradfi_source_runs order by created_at desc limit 1) as warnings_json,
      (select sum(skipped_contract_count) from tradfi_source_runs) as skipped_contract_count,
      (select sum(missing_iv_count) from tradfi_source_runs) as missing_iv_count,
      (select sum(missing_gamma_count) from tradfi_source_runs) as missing_gamma_count,
      (select sum(missing_oi_count) from tradfi_source_runs) as missing_oi_count,
      (select sum(missing_multiplier_count) from tradfi_source_runs) as missing_multiplier_count,
      (select sum(missing_expiry_count) from tradfi_source_runs) as missing_expiry_count,
      (select sum(missing_underlying_price_count) from tradfi_source_runs) as missing_underlying_price_count
  `);
  const row = reader.getRowObjectsJson()[0] ?? {};
  return {
    status: row.last_run_at
      ? row.contract_count > 0
        ? "healthy"
        : row.last_status ?? "empty"
      : "empty",
    lastRunAt: row.last_run_at ?? null,
    lastStatus: row.last_status ?? null,
    sourceRuns: Number(row.source_run_count ?? 0),
    rawSnapshots: Number(row.raw_snapshot_count ?? 0),
    contracts: Number(row.contract_count ?? 0),
    skippedContracts: Number(row.skipped_contract_count ?? 0),
    missingIv: Number(row.missing_iv_count ?? 0),
    missingGamma: Number(row.missing_gamma_count ?? 0),
    missingOi: Number(row.missing_oi_count ?? 0),
    missingMultiplier: Number(row.missing_multiplier_count ?? 0),
    missingExpiry: Number(row.missing_expiry_count ?? 0),
    missingUnderlyingPrice: Number(row.missing_underlying_price_count ?? 0),
    warnings: safeJson(row.warnings_json, []),
  };
}

function optionChainFromRows(symbol, asOf, rows) {
  return {
    symbol,
    spotPrice: Number(rows.find((row) => Number.isFinite(Number(row.underlying_price)))?.underlying_price),
    asOf,
    contracts: rows.map((row) => {
      const parsed = safeParseInstrument(row.instrument_name);
      return {
        instrumentName: row.instrument_name,
        underlyingPrice: Number(row.underlying_price),
        strike: Number(row.strike ?? parsed?.strike),
        expiry: row.expiry ?? parsed?.expiry,
        optionType: row.option_type ?? parsed?.optionType,
        impliedVolatility: normalizeIv(Number(row.mark_iv)),
        openInterest: Number(row.open_interest),
        volume: Number(row.volume ?? 0),
        markPrice: Number(row.mark_price ?? 0),
      };
    }),
  };
}

function tradFiOptionChainFromRows(symbol, asOf, rows) {
  return {
    symbol,
    spotPrice: Number(rows.find((row) => Number.isFinite(Number(row.underlying_price)))?.underlying_price),
    asOf,
    contracts: rows.map((row) => ({
      instrumentName: row.instrument_name,
      symbol: row.symbol,
      venue: row.venue ?? undefined,
      region: row.region ?? undefined,
      underlying: row.underlying ?? undefined,
      underlyingPrice: Number(row.underlying_price),
      strike: Number(row.strike),
      expiry: row.expiry,
      optionType: row.option_type,
      impliedVolatility: nullableDbNumber(row.implied_volatility),
      gamma: nullableDbNumber(row.gamma),
      contractMultiplier: Number(row.contract_multiplier),
      openInterest: Number(row.open_interest),
      volume: Number(row.volume ?? 0),
      markPrice: Number(row.mark_price ?? 0),
      bidPrice: nullableDbNumber(row.bid_price) ?? undefined,
      askPrice: nullableDbNumber(row.ask_price) ?? undefined,
      model: row.model ?? undefined,
      riskFreeRate: nullableDbNumber(row.risk_free_rate) ?? undefined,
    })),
  };
}
