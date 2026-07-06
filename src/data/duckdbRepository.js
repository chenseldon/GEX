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
