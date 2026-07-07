import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { createApiHandler } from "../src/server/api.js";
import {
  createDeribitJsonRpcClient,
  defaultDeribitProxyUrl,
  createDeribitProxyAgent,
  createDeribitTransportConfig,
} from "../src/integrations/deribitClient.js";
import { diagnoseDeribitConnectivity } from "../src/integrations/deribitDiagnostics.js";
import { normalizeDeribitOptionTicker } from "../src/integrations/deribitNormalize.js";
import {
  createDuckDbRepository,
  initializeDuckDb,
} from "../src/data/duckdbRepository.js";
import { getLiveDeribitSnapshot, measureDeribitLatency } from "../src/data/deribitLive.js";

const observedAt = "2026-07-06T08:00:00.000Z";

test("Deribit JSON-RPC client posts method and params", async () => {
  const calls = [];
  const client = createDeribitJsonRpcClient({
    endpoint: "https://example.test/api/v2",
    fetchImpl: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: [{ instrument_name: "BTC-26JUL24-60000-C" }] }));
    },
  });

  const result = await client.call("public/get_instruments", {
    currency: "BTC",
    kind: "option",
    expired: false,
  });

  assert.equal(calls[0].url, "https://example.test/api/v2");
  assert.equal(calls[0].body.method, "public/get_instruments");
  assert.equal(calls[0].body.params.currency, "BTC");
  assert.deepEqual(result, [{ instrument_name: "BTC-26JUL24-60000-C" }]);
});

test("Deribit client default transport reads DERIBIT_PROXY_URL", () => {
  const previousProxy = process.env.DERIBIT_PROXY_URL;
  const previousEndpoint = process.env.DERIBIT_ENDPOINT;

  try {
    process.env.DERIBIT_PROXY_URL = "socks5h://127.0.0.1:7890";
    process.env.DERIBIT_ENDPOINT = "https://rest.deribit.com/api/v2";
    const config = createDeribitTransportConfig();

    assert.equal(config.endpoint, "https://rest.deribit.com/api/v2");
    assert.equal(config.proxyUrl, "socks5h://127.0.0.1:7890");
  } finally {
    if (previousProxy === undefined) delete process.env.DERIBIT_PROXY_URL;
    else process.env.DERIBIT_PROXY_URL = previousProxy;
    if (previousEndpoint === undefined) delete process.env.DERIBIT_ENDPOINT;
    else process.env.DERIBIT_ENDPOINT = previousEndpoint;
  }
});

test("Deribit default proxy falls back to local Clash unless disabled", () => {
  const previous = {
    DERIBIT_PROXY_URL: process.env.DERIBIT_PROXY_URL,
    DERIBIT_AUTO_PROXY: process.env.DERIBIT_AUTO_PROXY,
    HTTPS_PROXY: process.env.HTTPS_PROXY,
    https_proxy: process.env.https_proxy,
    HTTP_PROXY: process.env.HTTP_PROXY,
    http_proxy: process.env.http_proxy,
    ALL_PROXY: process.env.ALL_PROXY,
    all_proxy: process.env.all_proxy,
  };

  try {
    for (const key of Object.keys(previous)) {
      delete process.env[key];
    }

    assert.equal(defaultDeribitProxyUrl(), "http://127.0.0.1:7897");

    process.env.DERIBIT_AUTO_PROXY = "0";
    assert.equal(defaultDeribitProxyUrl(), null);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("Deribit proxy agent picks concrete agent by proxy protocol", () => {
  assert.equal(createDeribitProxyAgent("http://127.0.0.1:7897").constructor.name, "HttpsProxyAgent");
  assert.equal(createDeribitProxyAgent("socks5h://127.0.0.1:7897").constructor.name, "SocksProxyAgent");
});

test("Deribit diagnostics classify DNS and TCP connectivity failures", async () => {
  const report = await diagnoseDeribitConnectivity({
    endpoint: "https://www.deribit.com/api/v2",
    symbol: "BTC",
    lookupHost: async () => [{ address: "104.244.46.185", family: 4 }],
    tcpProbe: async () => ({ ok: false, error: "connect timeout" }),
    client: {
      call: async () => {
        throw new Error("should not call HTTP when TCP fails");
      },
    },
  });

  assert.equal(report.summary, "connect_timeout");
  assert.equal(report.checks.dns.status, "ok");
  assert.equal(report.checks.tcp.status, "failed");
  assert.equal(report.checks.getTime.status, "skipped");
});

test("Deribit diagnostics checks public get_time and instruments when transport works", async () => {
  const methods = [];
  const report = await diagnoseDeribitConnectivity({
    endpoint: "https://www.deribit.com/api/v2",
    symbol: "BTC",
    lookupHost: async () => [{ address: "1.2.3.4", family: 4 }],
    tcpProbe: async () => ({ ok: true }),
    client: {
      call: async (method) => {
        methods.push(method);
        if (method === "public/get_time") return 1783300000000;
        return [{ instrument_name: "BTC-26JUL24-60000-C" }];
      },
    },
  });

  assert.equal(report.summary, "ok");
  assert.deepEqual(methods, ["public/get_time", "public/get_instruments"]);
  assert.equal(report.checks.getTime.status, "ok");
  assert.equal(report.checks.getInstruments.count, 1);
});

test("Deribit ticker normalization converts API payload into GEX contract shape", () => {
  const row = normalizeDeribitOptionTicker({
    instrument: {
      instrument_name: "BTC-26JUL24-60000-C",
      strike: 60000,
      expiration_timestamp: Date.UTC(2024, 6, 26, 8),
      option_type: "call",
    },
    ticker: {
      instrument_name: "BTC-26JUL24-60000-C",
      mark_iv: 62,
      open_interest: 123,
      mark_price: 0.041,
      underlying_price: 61234,
      stats: { volume: 45 },
      greeks: { gamma: 0.000041 },
    },
    observedAt,
  });

  assert.equal(row.warning, null);
  assert.equal(row.contract.instrumentName, "BTC-26JUL24-60000-C");
  assert.equal(row.contract.expiry, "2024-07-26");
  assert.equal(row.contract.optionType, "call");
  assert.equal(row.contract.impliedVolatility, 0.62);
  assert.equal(row.contract.openInterest, 123);
  assert.equal(row.contract.volume, 45);
  assert.equal(row.contract.markPrice, 0.041);
  assert.equal(row.contract.underlyingPrice, 61234);
});

test("Deribit ticker normalization reports unusable missing market fields", () => {
  const row = normalizeDeribitOptionTicker({
    instrument: {
      instrument_name: "BTC-26JUL24-60000-P",
      strike: 60000,
      option_type: "put",
    },
    ticker: {
      instrument_name: "BTC-26JUL24-60000-P",
      mark_iv: null,
      open_interest: 10,
      underlying_price: 61234,
    },
    observedAt,
  });

  assert.equal(row.contract, null);
  assert.match(row.warning, /mark_iv/);
});

test("DuckDB repository initializes schema and returns latest symbol snapshot", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gex-duckdb-"));
  const dbPath = join(dir, "gex.duckdb");

  try {
    await initializeDuckDb({ dbPath });
    const repo = await createDuckDbRepository({ dbPath });
    await repo.insertDeribitSnapshot({
      symbol: "BTC",
      observedAt,
      instruments: [
        {
          instrument_name: "BTC-26JUL24-60000-C",
          currency: "BTC",
          kind: "option",
          strike: 60000,
          option_type: "call",
          expiration_timestamp: Date.UTC(2024, 6, 26, 8),
          is_active: true,
        },
      ],
      tickers: [
        {
          instrumentName: "BTC-26JUL24-60000-C",
          observedAt,
          underlyingPrice: 61234,
          openInterest: 123,
          markIv: 62,
          markPrice: 0.041,
          bidPrice: 0.04,
          askPrice: 0.042,
          volume: 45,
          greeks: { gamma: 0.000041 },
          raw: { instrument_name: "BTC-26JUL24-60000-C" },
        },
      ],
      warnings: [],
    });

    const latest = await repo.getLatestOptionChain("BTC");

    assert.equal(latest.symbol, "BTC");
    assert.equal(latest.spotPrice, 61234);
    assert.equal(latest.asOf, observedAt);
    assert.equal(latest.contracts.length, 1);
    assert.equal(latest.contracts[0].instrumentName, "BTC-26JUL24-60000-C");
    assert.equal(latest.contracts[0].impliedVolatility, 0.62);
    await repo.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("DuckDB repository records failed Deribit collection runs for data health", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gex-duckdb-failure-"));
  const dbPath = join(dir, "gex.duckdb");

  try {
    await initializeDuckDb({ dbPath });
    const repo = await createDuckDbRepository({ dbPath });
    await repo.recordSourceFailure({
      venue: "deribit",
      symbol: "BTC",
      observedAt,
      error: "Connect Timeout Error",
    });

    const health = await repo.getHealth();

    assert.equal(health.status, "unavailable");
    assert.equal(health.lastStatus, "error");
    assert.match(health.error, /Connect Timeout/);
    await repo.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("DuckDB schema includes historical research tables", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gex-duckdb-history-"));
  const dbPath = join(dir, "gex.duckdb");

  try {
    await initializeDuckDb({ dbPath });
    const repo = await createDuckDbRepository({ dbPath });
    const tables = await repo.getTableNames();

    assert.equal(tables.includes("deribit_option_candles"), true);
    assert.equal(tables.includes("deribit_trades"), true);
    assert.equal(tables.includes("deribit_historical_volatility"), true);
    await repo.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("API auto source uses DuckDB latest Deribit snapshot when available", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gex-api-duckdb-"));
  const dbPath = join(dir, "gex.duckdb");
  const previousSource = process.env.DATA_SOURCE;
  const previousDbPath = process.env.GEX_DB_PATH;
  const previousRealtime = process.env.DERIBIT_REALTIME;

  try {
    process.env.DATA_SOURCE = "auto";
    process.env.DERIBIT_REALTIME = "0";
    process.env.GEX_DB_PATH = dbPath;
    await initializeDuckDb({ dbPath });
    const repo = await createDuckDbRepository({ dbPath });
    await repo.insertDeribitSnapshot({
      symbol: "BTC",
      observedAt,
      instruments: [
        {
          instrument_name: "BTC-26JUL24-60000-C",
          currency: "BTC",
          kind: "option",
          strike: 60000,
          option_type: "call",
          expiration_timestamp: Date.UTC(2024, 6, 26, 8),
          is_active: true,
        },
        {
          instrument_name: "BTC-26JUL24-60000-P",
          currency: "BTC",
          kind: "option",
          strike: 60000,
          option_type: "put",
          expiration_timestamp: Date.UTC(2024, 6, 26, 8),
          is_active: true,
        },
      ],
      tickers: [
        ticker("BTC-26JUL24-60000-C", 61000, 62, 125),
        ticker("BTC-26JUL24-60000-P", 61000, 65, 175),
      ],
      warnings: [],
    });
    await repo.close();

    const handler = createApiHandler();
    const response = await handler(new Request("http://localhost/api/gex/dashboard?symbol=BTC"));
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.sourceLabel, "Deribit");
    assert.equal(payload.asOf, observedAt);
    assert.equal(payload.spotPrice, 61000);
  } finally {
    if (previousSource === undefined) delete process.env.DATA_SOURCE;
    else process.env.DATA_SOURCE = previousSource;
    if (previousDbPath === undefined) delete process.env.GEX_DB_PATH;
    else process.env.GEX_DB_PATH = previousDbPath;
    if (previousRealtime === undefined) delete process.env.DERIBIT_REALTIME;
    else process.env.DERIBIT_REALTIME = previousRealtime;
    await rm(dir, { recursive: true, force: true });
  }
});

test("API default source prefers DuckDB latest Deribit snapshot", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gex-api-default-duckdb-"));
  const dbPath = join(dir, "gex.duckdb");
  const previousSource = process.env.DATA_SOURCE;
  const previousDbPath = process.env.GEX_DB_PATH;
  const previousRealtime = process.env.DERIBIT_REALTIME;

  try {
    delete process.env.DATA_SOURCE;
    process.env.DERIBIT_REALTIME = "0";
    process.env.GEX_DB_PATH = dbPath;
    await initializeDuckDb({ dbPath });
    const repo = await createDuckDbRepository({ dbPath });
    await repo.insertDeribitSnapshot({
      symbol: "ETH",
      observedAt,
      instruments: [
        {
          instrument_name: "ETH-26JUL24-3500-C",
          currency: "ETH",
          kind: "option",
          strike: 3500,
          option_type: "call",
          expiration_timestamp: Date.UTC(2024, 6, 26, 8),
          is_active: true,
        },
        {
          instrument_name: "ETH-26JUL24-3500-P",
          currency: "ETH",
          kind: "option",
          strike: 3500,
          option_type: "put",
          expiration_timestamp: Date.UTC(2024, 6, 26, 8),
          is_active: true,
        },
      ],
      tickers: [
        ticker("ETH-26JUL24-3500-C", 3600, 70, 100),
        ticker("ETH-26JUL24-3500-P", 3600, 72, 140),
      ],
      warnings: [],
    });
    await repo.close();

    const handler = createApiHandler();
    const response = await handler(new Request("http://localhost/api/gex/dashboard?symbol=ETH"));
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.sourceLabel, "Deribit");
    assert.equal(payload.asOf, observedAt);
    assert.equal(payload.spotPrice, 3600);
  } finally {
    if (previousSource === undefined) delete process.env.DATA_SOURCE;
    else process.env.DATA_SOURCE = previousSource;
    if (previousDbPath === undefined) delete process.env.GEX_DB_PATH;
    else process.env.GEX_DB_PATH = previousDbPath;
    if (previousRealtime === undefined) delete process.env.DERIBIT_REALTIME;
    else process.env.DERIBIT_REALTIME = previousRealtime;
    await rm(dir, { recursive: true, force: true });
  }
});

test("live Deribit snapshot uses book summary payload without DuckDB writes", async () => {
  const client = {
    async getBookSummaryByCurrency(symbol, kind) {
      assert.equal(symbol, "BTC");
      assert.equal(kind, "option");
      return [
        bookSummary("BTC-26JUL24-60000-C", 61000, 62, 125),
        bookSummary("BTC-26JUL24-60000-P", 61000, 65, 175),
      ];
    },
  };

  const snapshot = await getLiveDeribitSnapshot({
    symbol: "BTC",
    client,
    ttlMs: 0,
    includeHistory: false,
  });

  assert.equal(snapshot.sourceName, "deribit-live");
  assert.equal(snapshot.sourceLabel, "Deribit Live");
  assert.equal(snapshot.spotPrice, 61000);
  assert.equal(snapshot.byStrike.length, 1);
  assert.equal(typeof snapshot.requestLatencyMs, "number");
});

test("live Deribit snapshot prefers current index price for spot", async () => {
  const client = {
    async getBookSummaryByCurrency(symbol, kind) {
      assert.equal(symbol, "BTC");
      assert.equal(kind, "option");
      return [
        bookSummary("BTC-26JUL24-60000-C", 61000, 62, 125),
        bookSummary("BTC-26JUL24-60000-P", 61000, 65, 175),
      ];
    },
    async getIndexPrice(indexName) {
      assert.equal(indexName, "btc_usd");
      return { index_price: 61234.5 };
    },
  };

  const snapshot = await getLiveDeribitSnapshot({
    symbol: "BTC",
    client,
    ttlMs: -1,
    includeHistory: false,
  });

  assert.equal(snapshot.spotPrice, 61234.5);
});

test("Deribit latency measurement reports p50 for book summary", async () => {
  const client = {
    calls: 0,
    async getBookSummaryByCurrency() {
      this.calls += 1;
      return [bookSummary("BTC-26JUL24-60000-C", 61000, 62, 125)];
    },
  };

  const report = await measureDeribitLatency({ symbol: "BTC", samples: 3, client });

  assert.equal(client.calls, 3);
  assert.equal(report.samples.length, 3);
  assert.equal(typeof report.p50Ms, "number");
});

function ticker(instrumentName, underlyingPrice, markIv, openInterest) {
  return {
    instrumentName,
    observedAt,
    underlyingPrice,
    openInterest,
    markIv,
    markPrice: 0.04,
    bidPrice: 0.039,
    askPrice: 0.041,
    volume: 12,
    greeks: { gamma: 0.00004 },
    raw: { instrument_name: instrumentName },
  };
}

function bookSummary(instrumentName, underlyingPrice, markIv, openInterest) {
  return {
    instrument_name: instrumentName,
    underlying_price: underlyingPrice,
    open_interest: openInterest,
    mark_iv: markIv,
    mark_price: 0.05,
    best_bid_price: 0.04,
    best_ask_price: 0.06,
    last_price: 0.05,
    volume: 10,
  };
}
