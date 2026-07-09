import {
  buildChangeTable,
  buildHeatmapMatrix,
  buildSummaryRail,
  buildTrendSeries,
  buildUiMetrics,
  calculateGexSnapshot,
} from "../domain/gex.js";
import { instruments, optionChains, SAMPLE_AS_OF } from "../domain/sampleData.js";
import { createDuckDbRepository, getDuckDbPath } from "../data/duckdbRepository.js";
import { getLiveDeribitSnapshot, measureDeribitLatency } from "../data/deribitLive.js";

const TRADFI_CATALOG = [
  { symbol: "CN.CFFEX.IF", name: "CSI 300 Index Options (AKShare IF alias)", venue: "CFFEX", exchanges: ["CFFEX"], group: "China Index/ETF Options", connector: "akshare", supportStatus: "partial" },
  { symbol: "CN.CFFEX.IO", name: "CSI 300 Index Options", venue: "CFFEX", exchanges: ["CFFEX"], group: "China Index/ETF Options", connector: "akshare", supportStatus: "partial" },
  { symbol: "CN.CFFEX.MO", name: "CSI 1000 Index Options", venue: "CFFEX", exchanges: ["CFFEX"], group: "China Index/ETF Options", connector: "akshare", supportStatus: "planned" },
  { symbol: "CN.CFFEX.HO", name: "SSE 50 Index Options", venue: "CFFEX", exchanges: ["CFFEX"], group: "China Index/ETF Options", connector: "akshare", supportStatus: "planned" },
  { symbol: "CN.SSE.510050", name: "SSE 50 ETF Options", venue: "SSE", exchanges: ["SSE"], group: "China Index/ETF Options", connector: "akshare", supportStatus: "planned" },
  { symbol: "CN.SSE.510300", name: "SSE 300 ETF Options", venue: "SSE", exchanges: ["SSE"], group: "China Index/ETF Options", connector: "akshare", supportStatus: "planned" },
  { symbol: "CN.SZSE.159919", name: "SZSE 300 ETF Options", venue: "SZSE", exchanges: ["SZSE"], group: "China Index/ETF Options", connector: "akshare", supportStatus: "planned" },
  { symbol: "CN.SHFE.au", name: "SHFE Gold Options", venue: "SHFE", exchanges: ["SHFE"], group: "China Commodity Options", connector: "akshare", supportStatus: "partial" },
  { symbol: "CN.SHFE.ag", name: "SHFE Silver Options", venue: "SHFE", exchanges: ["SHFE"], group: "China Commodity Options", connector: "akshare", supportStatus: "planned" },
  { symbol: "CN.SHFE.cu", name: "SHFE Copper Options", venue: "SHFE", exchanges: ["SHFE"], group: "China Commodity Options", connector: "akshare", supportStatus: "planned" },
  { symbol: "CN.INE.sc", name: "INE Crude Oil Options", venue: "INE", exchanges: ["INE"], group: "China Commodity Options", connector: "akshare", supportStatus: "planned" },
  { symbol: "CN.DCE.i", name: "DCE Iron Ore Options", venue: "DCE", exchanges: ["DCE"], group: "China Commodity Options", connector: "akshare", supportStatus: "planned" },
  { symbol: "CN.DCE.m", name: "DCE Soymeal Options", venue: "DCE", exchanges: ["DCE"], group: "China Commodity Options", connector: "akshare", supportStatus: "planned" },
  { symbol: "CN.CZCE.SR", name: "CZCE Sugar Options", venue: "CZCE", exchanges: ["CZCE"], group: "China Commodity Options", connector: "akshare", supportStatus: "planned" },
  { symbol: "CN.CZCE.CF", name: "CZCE Cotton Options", venue: "CZCE", exchanges: ["CZCE"], group: "China Commodity Options", connector: "akshare", supportStatus: "planned" },
  { symbol: "US.CBOE.SPX", name: "S&P 500 Index Options", venue: "CBOE", exchanges: ["CBOE"], group: "US Index/Futures Options", connector: null, supportStatus: "unsupported" },
  { symbol: "US.CBOE.NDX", name: "Nasdaq-100 Index Options", venue: "CBOE", exchanges: ["CBOE"], group: "US Index/Futures Options", connector: null, supportStatus: "unsupported" },
  { symbol: "US.CME.ES", name: "E-mini S&P 500 Futures Options", venue: "CME", exchanges: ["CME"], group: "US Index/Futures Options", connector: null, supportStatus: "unsupported" },
  { symbol: "US.CME.NQ", name: "E-mini Nasdaq-100 Futures Options", venue: "CME", exchanges: ["CME"], group: "US Index/Futures Options", connector: null, supportStatus: "unsupported" },
  { symbol: "US.CME.GC", name: "COMEX Gold Options", venue: "CME", exchanges: ["CME", "COMEX"], group: "US Index/Futures Options", connector: null, supportStatus: "unsupported" },
  { symbol: "US.NYMEX.CL", name: "NYMEX WTI Crude Oil Options", venue: "NYMEX", exchanges: ["NYMEX", "CME"], group: "US Index/Futures Options", connector: null, supportStatus: "unsupported" },
];

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

export function createApiHandler() {
  const snapshots = new Map();

  function getFixtureSnapshot(symbol) {
    if (!snapshots.has(symbol)) {
      const instrument = instruments.find((item) => item.symbol === symbol);
      if (!instrument) {
        throw new Error(`Unsupported symbol: ${symbol}`);
      }
      const snapshot = calculateGexSnapshot({
          symbol,
          spotPrice: instrument.spotPrice,
          asOf: SAMPLE_AS_OF,
          contracts: optionChains[symbol],
        });
      snapshots.set(symbol, {
        ...snapshot,
        sourceLabel: "Deribit + Bybit + OKX",
        sourceName: "sample-deribit-fixture",
      });
    }
    return snapshots.get(symbol);
  }

  async function getSnapshot(symbol) {
    const source = process.env.DATA_SOURCE ?? "auto";
    if (isTradFiSymbol(symbol)) {
      return getDuckDbTradFiSnapshot(symbol, source);
    }

    if (source === "akshare") {
      throw new Error(`AKShare data unavailable for symbol: ${symbol}`);
    }

    if (source === "duckdb") {
      const duckdb = await getDuckDbDeribitSnapshot(symbol);
      if (duckdb) {
        return duckdb;
      }
      throw new Error(`DuckDB data unavailable for symbol: ${symbol}`);
    }
    if (source === "deribit" || source === "auto") {
      const deribit = await getCurrentDeribitSnapshot(symbol);
      if (deribit) {
        return deribit;
      }
      if (source === "deribit") {
        throw new Error(`Deribit data unavailable for symbol: ${symbol}`);
      }
    }
    return getFixtureSnapshot(symbol);
  }

  return async function handleRequest(request) {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/api/instruments") {
        return json({ instruments: await getInstrumentList() });
      }

      if (url.pathname === "/api/deribit/latency") {
        const symbol = (url.searchParams.get("symbol") ?? "BTC").toUpperCase();
        const samples = Number(url.searchParams.get("samples") ?? 3);
        return json(await measureDeribitLatency({ symbol, samples }));
      }

      if (url.pathname === "/api/gex/summary") {
        const snapshot = await getSnapshot(requiredSymbol(url));
        const ui = buildUiMetrics(snapshot);
        return json({
          symbol: snapshot.symbol,
          spotPrice: snapshot.spotPrice,
          asOf: snapshot.asOf,
          netGex: snapshot.netGex,
          netDelta: snapshot.netDelta,
          totalOpenInterest: snapshot.totalOpenInterest,
          gammaFlip: snapshot.gammaFlip,
          callWall: snapshot.callWall,
          putWall: snapshot.putWall,
          maxPainStrike: snapshot.maxPainStrike,
          absoluteGex: ui.absoluteGex,
          gauges: ui.gauges,
          keyLevels: ui.keyLevels,
          signalState: snapshot.signalState,
        });
      }

      if (url.pathname === "/api/gex/dashboard") {
        const snapshot = await getSnapshot(requiredSymbol(url));
        const ui = buildUiMetrics(snapshot);
        return json({
          symbol: snapshot.symbol,
          spotPrice: snapshot.spotPrice,
          asOf: snapshot.asOf,
          sourceLabel: snapshot.sourceLabel,
          requestLatencyMs: snapshot.requestLatencyMs,
          gauges: [
            gauge("Gamma Regime", ui.gauges.regime, ui.gauges.regime >= 0 ? "Positive" : "Negative"),
            gauge("GEX Call/Put", ui.gauges.callPut, Math.abs(ui.gauges.callPut) < 0.15 ? "Neutral" : ui.gauges.callPut > 0 ? "Call led" : "Put led"),
            gauge("GEX Up/Down", ui.gauges.upDown, Math.abs(ui.gauges.upDown) < 0.15 ? "Balanced" : ui.gauges.upDown > 0 ? "Upside" : "Downside"),
          ],
          summary: summaryPayload(snapshot, ui),
          keyLevels: ui.keyLevels,
          rows: snapshot.byStrike,
          expiries: snapshot.byExpiry,
          trends: buildRealTrendSeries(snapshot),
          heatmaps: {
            net: buildRealHeatmapMatrix(snapshot, { type: "net" }),
            abs: buildRealHeatmapMatrix(snapshot, { type: "abs" }),
          },
          changeTable: buildRealChangeTable(snapshot, { coverage: Number(url.searchParams.get("coverage") ?? 50) }),
        });
      }

      if (url.pathname === "/api/gex/by-strike") {
        const snapshot = await getSnapshot(requiredSymbol(url));
        const expiry = url.searchParams.get("expiry");
        const rows = expiry
          ? snapshot.byStrike.filter((row) => row.expiry === expiry)
          : snapshot.byStrike;
        return json({
          symbol: snapshot.symbol,
          rows,
          markers: {
            gammaFlip: snapshot.gammaFlip,
            callWall: snapshot.callWall,
            putWall: snapshot.putWall,
            maxPainStrike: snapshot.maxPainStrike,
          },
        });
      }

      if (url.pathname === "/api/gex/studio") {
        const snapshot = await getSnapshot(requiredSymbol(url));
        const expiry = url.searchParams.get("expiry");
        const rows = expiry
          ? snapshot.byStrike.filter((row) => row.expiry === expiry)
          : snapshot.byStrike;
        const scopedSnapshot = { ...snapshot, byStrike: rows };
        const ui = buildUiMetrics(scopedSnapshot);
        const trends = buildRealTrendSeries(snapshot);
        return json({
          symbol: snapshot.symbol,
          spotPrice: snapshot.spotPrice,
          asOf: snapshot.asOf,
          sourceLabel: snapshot.sourceLabel,
          requestLatencyMs: snapshot.requestLatencyMs,
          mode: url.searchParams.get("mode") ?? "snapshot",
          rows,
          expiries: snapshot.byExpiry,
          markers: {
            gammaFlip: ui.gammaFlip,
            callWall: ui.callWall,
            putWall: ui.putWall,
            maxPainStrike: ui.maxPainStrike,
            peaks: ui.peaks,
            keyLevels: ui.studioKeyLevels,
            bands: ui.markerBands,
          },
          summary: summaryPayload(snapshot, ui),
          summaryRail: buildSummaryRail(scopedSnapshot, trends),
          trends,
          forecast: buildForecastInput({ ...scopedSnapshot, gammaFlip: ui.gammaFlip, netGex: ui.netGex }),
        });
      }

      if (url.pathname === "/api/gex/term-structure") {
        const snapshot = await getSnapshot(requiredSymbol(url));
        return json({
          symbol: snapshot.symbol,
          rows: snapshot.byExpiry,
        });
      }

      if (url.pathname === "/api/gex/trends") {
        const snapshot = await getSnapshot(requiredSymbol(url));
        return json(buildRealTrendSeries(snapshot));
      }

      if (url.pathname === "/api/gex/heatmap") {
        const snapshot = await getSnapshot(requiredSymbol(url));
        return json(buildRealHeatmapMatrix(snapshot, {
          type: url.searchParams.get("type") ?? "net",
          window: url.searchParams.get("window") ?? "24h",
        }));
      }

      if (url.pathname === "/api/gex/change-table") {
        const snapshot = await getSnapshot(requiredSymbol(url));
        return json(
          buildRealChangeTable(snapshot, {
            coverage: Number(url.searchParams.get("coverage") ?? 50),
          }),
        );
      }

      if (url.pathname === "/api/signals") {
        const snapshot = await getSnapshot(requiredSymbol(url));
        return json({
          symbol: snapshot.symbol,
          spotPrice: snapshot.spotPrice,
          signalState: snapshot.signalState,
          levels: {
            gammaFlip: snapshot.gammaFlip,
            callWall: snapshot.callWall,
            putWall: snapshot.putWall,
            maxPainStrike: snapshot.maxPainStrike,
          },
        });
      }

      if (url.pathname === "/api/data-health") {
        const deribit = await getDeribitHealth();
        const akshare = deribit.akshare ?? {
          status: "empty",
          lastRunAt: null,
          sourceRuns: 0,
          contracts: 0,
          skippedContracts: 0,
          warnings: [],
        };
        return json({
          sources: [
            {
              name: "sample-deribit-fixture",
              status: "healthy",
              lastSnapshotAt: SAMPLE_AS_OF,
              freshnessSeconds: 0,
              limitation: "Static fixture for model and UI validation; replace with live collector in V1.",
            },
            deribit,
            {
              name: "akshare-duckdb",
              status: akshare.status,
              lastSnapshotAt: akshare.lastRunAt,
              sourceRuns: akshare.sourceRuns,
              rawSnapshots: akshare.rawSnapshots,
              contracts: akshare.contracts,
              skippedContracts: akshare.skippedContracts,
              missingIv: akshare.missingIv,
              missingGamma: akshare.missingGamma,
              missingOi: akshare.missingOi,
              missingMultiplier: akshare.missingMultiplier,
              missingExpiry: akshare.missingExpiry,
              missingUnderlyingPrice: akshare.missingUnderlyingPrice,
              warnings: akshare.warnings,
            },
          ],
          coverage: {
            symbols: instruments.length,
            contracts: Object.values(optionChains).flat().length,
            expiries: new Set(Object.values(optionChains).flat().map((row) => row.expiry)).size,
          },
        });
      }

      return json({ error: "Not found" }, 404);
    } catch (error) {
      const status = /Unsupported symbol|symbol is required|type must be|coverage must be|Deribit data unavailable|DuckDB data unavailable|AKShare data unavailable/.test(error.message)
        ? 400
        : 500;
      return json(
        {
          error: error.message,
          status: /data unavailable/.test(error.message) ? "unavailable" : undefined,
        },
        status,
      );
    }
  };
}

function requiredSymbol(url) {
  const raw = url.searchParams.get("symbol")?.trim();
  if (!raw) {
    throw new Error("symbol is required");
  }
  const cryptoSymbol = raw.toUpperCase();
  if (optionChains[cryptoSymbol]) {
    return cryptoSymbol;
  }
  if (isTradFiSymbol(raw)) {
    return canonicalTradFiSymbol(raw);
  }
  throw new Error(`Unsupported symbol: ${raw}`);
}

function isTradFiSymbol(symbol) {
  return /^[A-Za-z]{2}\.[A-Za-z0-9]+\.[A-Za-z0-9_.-]+$/.test(String(symbol ?? ""));
}

function canonicalTradFiSymbol(symbol) {
  const parts = String(symbol).trim().split(".");
  if (parts.length < 3) return String(symbol).trim();
  return `${parts[0].toUpperCase()}.${parts[1].toUpperCase()}.${parts.slice(2).join(".")}`;
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: jsonHeaders,
  });
}

function gauge(label, value, state) {
  return {
    label,
    value,
    state,
  };
}

function summaryPayload(snapshot, ui) {
  return {
    netGex: ui.netGex,
    netDelta: snapshot.netDelta,
    totalOpenInterest: snapshot.totalOpenInterest,
    gammaFlip: ui.gammaFlip,
    callWall: ui.callWall,
    putWall: ui.putWall,
    maxPainStrike: ui.maxPainStrike,
    absoluteGex: ui.absoluteGex,
    positiveGex: ui.positiveGex,
    negativeGex: ui.negativeGex,
    callPutRatio: ui.callPutRatio,
    upDownRatio: ui.upDownRatio,
    signalState: snapshot.signalState,
  };
}

function buildForecastInput(snapshot) {
  const nearestExpiry = snapshot.byExpiry[0]?.expiry;
  const expiryDate = nearestExpiry ? new Date(`${nearestExpiry}T08:00:00.000Z`) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const asOfDate = new Date(snapshot.asOf);
  const dte = Math.max(0.25, (expiryDate.getTime() - asOfDate.getTime()) / (24 * 60 * 60 * 1000));
  const iv = Math.max(0.01, Number(snapshot.averageImpliedVolatility ?? 0.5));
  const span = snapshot.spotPrice * Math.max(0.08, Math.min(0.32, iv * Math.sqrt(dte / 365) * 2.8));

  return {
    symbol: snapshot.symbol,
    startPrice: round(snapshot.spotPrice, 2),
    flipPrice: round(snapshot.gammaFlip, 2),
    iv: round(iv, 4),
    dte: round(dte, 2),
    expiryLabel: nearestExpiry ?? "Next expiry",
    stepLabel: "1h",
    pathCount: 20000,
    visiblePathCount: 220,
    steps: Math.max(24, Math.min(240, Math.round(dte * 24))),
    yMin: round(Math.max(0.01, snapshot.spotPrice - span), 2),
    yMax: round(snapshot.spotPrice + span, 2),
    hoverDefault: round(snapshot.gammaFlip, 2),
    terminalSkew: round(snapshot.signalState.regime === "negative_gamma" ? -0.53 : -0.18, 2),
    positiveDrift: 0.0003,
    negativeDrift: -0.00065,
    positiveGammaWarp: 0.68,
    negativeGammaWarp: 1.1,
    flipPull: 0.012,
  };
}

async function getInstrumentList() {
  const source = process.env.DATA_SOURCE ?? "auto";
  if (source === "fixture") {
    return instruments;
  }

  const includeCrypto = source !== "akshare";
  const includeTradFi = ["auto", "duckdb", "akshare"].includes(source);
  const lists = [];

  if (includeCrypto) {
    const deribit = await getDeribitAvailableInstruments();
    if (deribit.length > 0 || source === "deribit") {
      lists.push(...deribit);
    } else {
      lists.push(...instruments);
    }
  }

  if (includeTradFi) {
    lists.push(...await getTradFiAvailableInstruments());
  }

  return lists;
}

async function getDeribitAvailableInstruments() {
  let repo;
  try {
    repo = await createDuckDbRepository({ dbPath: getDuckDbPath() });
    const available = await repo.getAvailableSymbols();
    const liveSymbols = new Set(available.filter((row) => row.tickerCount > 0).map((row) => row.symbol));
    const symbols = liveSymbols.size > 0 ? liveSymbols : new Set(["BTC", "ETH"]);
    return instruments
      .filter((instrument) => symbols.has(instrument.symbol))
      .map((instrument) => ({
        ...instrument,
        venue: "Deribit Live",
        lastSnapshotAt: available.find((row) => row.symbol === instrument.symbol)?.lastSnapshotAt,
      }));
  } catch {
    return instruments
      .filter((instrument) => ["BTC", "ETH"].includes(instrument.symbol))
      .map((instrument) => ({ ...instrument, venue: "Deribit Live" }));
  } finally {
    repo?.close();
  }
}

async function getCurrentDeribitSnapshot(symbol) {
  if (process.env.DERIBIT_REALTIME !== "0") {
    try {
      return await getLiveDeribitSnapshot({ symbol });
    } catch {
      if ((process.env.DATA_SOURCE ?? "auto") === "deribit") {
        throw new Error(`Deribit live data unavailable for symbol: ${symbol}`);
      }
    }
  }
  return getDuckDbDeribitSnapshot(symbol);
}

async function getDuckDbDeribitSnapshot(symbol) {
  let repo;
  try {
    repo = await createDuckDbRepository({ dbPath: getDuckDbPath() });
    const latest = await repo.getLatestOptionChain(symbol);
    if (!latest || latest.contracts.length === 0) {
      return null;
    }
    const historyInputs = await repo.getOptionChainHistory(symbol, { hours: 90 * 24, limit: 720 });
    const historySnapshots = historyInputs
      .map((input) => safeSnapshot(input))
      .filter(Boolean);
    const snapshot = calculateGexSnapshot(latest);
    return {
      ...snapshot,
      sourceLabel: "Deribit",
      sourceName: "deribit-duckdb",
      historySnapshots,
    };
  } catch {
    return null;
  } finally {
    repo?.close();
  }
}

async function getDuckDbTradFiSnapshot(symbol, source) {
  if (!["auto", "duckdb", "akshare"].includes(source)) {
    throw new Error(`AKShare data unavailable for symbol: ${symbol}`);
  }

  let repo;
  try {
    repo = await createDuckDbRepository({ dbPath: getDuckDbPath() });
    const resolvedSymbol = await resolveTradFiSymbol(repo, symbol);
    const latest = resolvedSymbol ? await repo.getLatestTradFiOptionChain(resolvedSymbol) : null;
    if (!latest || latest.contracts.length === 0) {
      throw new Error(`AKShare data unavailable for symbol: ${symbol}`);
    }
    const snapshot = calculateGexSnapshot(latest);
    return {
      ...snapshot,
      sourceLabel: "AKShare",
      sourceName: "akshare-duckdb",
      historySnapshots: [],
    };
  } catch (error) {
    if (/AKShare data unavailable/.test(error.message)) {
      throw error;
    }
    throw new Error(`AKShare data unavailable for symbol: ${symbol}`);
  } finally {
    repo?.close();
  }
}

async function getTradFiAvailableInstruments() {
  const catalog = new Map(TRADFI_CATALOG.map((item) => [item.symbol, catalogInstrument(item)]));
  let repo;
  try {
    repo = await createDuckDbRepository({ dbPath: getDuckDbPath() });
    const available = await repo.getTradFiAvailableSymbols();
    for (const row of available.filter((item) => item.lastSnapshotAt)) {
      const base = catalog.get(row.symbol) ?? catalogInstrument({
        symbol: row.symbol,
        name: tradFiDisplayName(row.symbol),
        venue: tradFiVenue(row.symbol),
        exchanges: [tradFiVenue(row.symbol)],
        group: tradFiGroup(row.symbol),
        connector: "akshare",
        supportStatus: "partial",
      });
      catalog.set(row.symbol, {
        ...base,
        lastSnapshotAt: row.lastSnapshotAt,
        tickerCount: row.tickerCount,
        contractCount: row.contractCount,
        dataStatus: Number(row.contractCount ?? row.tickerCount ?? 0) > 0 ? "available" : "needs_fields",
        status: Number(row.contractCount ?? row.tickerCount ?? 0) > 0 ? "available" : row.status ?? "needs_fields",
      });
    }
    return [...catalog.values()];
  } catch {
    return [...catalog.values()];
  } finally {
    repo?.close();
  }
}

function catalogInstrument(item) {
  return {
    symbol: item.symbol,
    name: item.name,
    venue: item.venue,
    exchanges: item.exchanges ?? [item.venue].filter(Boolean),
    assetClass: "TradFi",
    market: "tradfi",
    group: item.group ?? tradFiGroup(item.symbol),
    spotPrice: null,
    lastSnapshotAt: null,
    tickerCount: 0,
    contractCount: 0,
    connector: item.connector,
    supportStatus: item.supportStatus,
    dataStatus: item.supportStatus === "unsupported" ? "unsupported" : "needs_collector",
    status: item.supportStatus === "unsupported" ? "unsupported" : "needs_collector",
  };
}

async function resolveTradFiSymbol(repo, symbol) {
  const available = await repo.getTradFiAvailableSymbols();
  const exact = available.find((row) => row.symbol === symbol);
  if (exact) return exact.symbol;
  const lower = String(symbol).toLowerCase();
  return available.find((row) => String(row.symbol).toLowerCase() === lower)?.symbol ?? symbol;
}

function tradFiVenue(symbol) {
  return String(symbol).split(".")[1] ?? "TradFi";
}

function tradFiDisplayName(symbol) {
  const [region, venue, underlying] = String(symbol).split(".");
  if (!region || !venue || !underlying) return String(symbol);
  return `${underlying.toUpperCase()} ${venue} Options`;
}

function tradFiGroup(symbol) {
  const venue = tradFiVenue(symbol).toUpperCase();
  if (["CFFEX", "SSE", "SZSE"].includes(venue)) {
    return "China Index/ETF Options";
  }
  if (["SHFE", "DCE", "CZCE", "INE", "GFEX"].includes(venue)) {
    return "China Commodity Options";
  }
  if (String(symbol).toUpperCase().startsWith("US.")) {
    return "US Index/Futures Options";
  }
  return "TradFi Options";
}

function safeSnapshot(input) {
  try {
    return calculateGexSnapshot(input);
  } catch {
    return null;
  }
}

function buildRealTrendSeries(snapshot, { hours = 24 } = {}) {
  if (!isRealMarketSnapshot(snapshot)) {
    return buildTrendSeries(snapshot);
  }

  const points = historyForWindow(snapshot, hours).map((item) => trendPoint(item));
  const realPoints = points.length > 0 ? points : [trendPoint(snapshot)];

  return {
    symbol: snapshot.symbol,
    asOf: snapshot.asOf,
    source: snapshot.sourceName,
    status: realPoints.length >= 2 ? "ready" : "accumulating",
    warning: realPoints.length >= 2 ? null : notEnoughHistoryWarning(snapshot, "view"),
    points: realPoints,
  };
}

function trendPoint(snapshot) {
  const ui = buildUiMetrics(snapshot);
  return {
    time: new Date(snapshot.asOf).toISOString().slice(11, 16),
    observedAt: snapshot.asOf,
    indexPrice: round(snapshot.spotPrice, 2),
    flipPoint: round(snapshot.gammaFlip, 2),
    callPut: ui.gauges.callPut,
    upDown: ui.gauges.upDown,
    netGex: snapshot.netGex,
    absGex: ui.absoluteGex,
    hedgingPressure: round(ui.positiveGex - ui.negativeGex, 2),
  };
}

function buildRealHeatmapMatrix(snapshot, { type = "net", window = "24h" } = {}) {
  if (!["net", "abs"].includes(type)) {
    throw new Error("type must be net or abs");
  }
  if (!isRealMarketSnapshot(snapshot)) {
    return buildHeatmapMatrix(snapshot, { type });
  }

  const history = historyForWindow(snapshot, windowHours(window));
  if (history.length < 2) {
    return {
      symbol: snapshot.symbol,
      type,
      source: snapshot.sourceName,
      status: "accumulating",
      warning: notEnoughHistoryWarning(snapshot, "heatmap"),
      columns: [],
      rows: [],
      indexPath: [],
      flipPath: [],
    };
  }

  const collapsedByTime = history.map((item) => ({
    snapshot: item,
    rows: collapseByStrike(item.byStrike),
  }));
  const latestStrikes = collapsedByTime.at(-1).rows.map((row) => row.strike);
  const columns = collapsedByTime.map(({ snapshot: item }) => new Date(item.asOf).toISOString().slice(5, 16).replace("T", " "));
  const rows = latestStrikes.map((strike) => ({
    strike,
    values: collapsedByTime.map(({ rows: strikeRows }) => {
      const row = strikeRows.find((candidate) => candidate.strike === strike);
      const value = row?.gex ?? 0;
      return type === "abs" ? Math.abs(value) : value;
    }),
  }));

  return {
    symbol: snapshot.symbol,
    type,
    source: snapshot.sourceName,
    status: "ready",
    warning: null,
    columns,
    rows,
    indexPath: collapsedByTime.map(({ snapshot: item }) => ({ time: item.asOf, price: item.spotPrice })),
    flipPath: collapsedByTime.map(({ snapshot: item }) => ({ time: item.asOf, price: item.gammaFlip })),
  };
}

function buildRealChangeTable(snapshot, { coverage = 50 } = {}) {
  if (!isRealMarketSnapshot(snapshot)) {
    return buildChangeTable(snapshot, { coverage });
  }
  const allowed = [50, 80, 90, 100];
  const normalizedCoverage = Number(coverage);
  if (!allowed.includes(normalizedCoverage)) {
    throw new Error("coverage must be one of 50, 80, 90, 100");
  }

  const ranked = collapseByStrike(snapshot.byStrike).sort(
    (a, b) => Math.abs(b.gex) - Math.abs(a.gex) || a.strike - b.strike,
  );
  const count = Math.max(1, Math.ceil(ranked.length * (normalizedCoverage / 100)));
  const selected = ranked.slice(0, count).sort((a, b) => a.strike - b.strike);
  const history = historyForWindow(snapshot, 24);

  if (history.length < 2) {
    return {
      symbol: snapshot.symbol,
      coverage: normalizedCoverage,
      source: snapshot.sourceName,
      status: "accumulating",
      warning: notEnoughHistoryWarning(snapshot, "change table"),
      columns: selected.map((row) => row.strike),
      periods: ["Now"],
      rows: selected.map((row) => ({ strike: row.strike, now: Math.abs(row.gex), changes: {} })),
    };
  }

  const previous = new Map(collapseByStrike(history[0].byStrike).map((row) => [row.strike, row]));
  return {
    symbol: snapshot.symbol,
    coverage: normalizedCoverage,
    source: snapshot.sourceName,
    status: "ready",
    warning: null,
    columns: selected.map((row) => row.strike),
    periods: ["Now", "24h"],
    rows: selected.map((row) => {
      const base = Math.abs(previous.get(row.strike)?.gex ?? 0);
      const now = Math.abs(row.gex);
      return {
        strike: row.strike,
        now,
        changes: {
          "24h": base > 0 ? round(((now - base) / base) * 100, 1) : null,
        },
      };
    }),
  };
}

function historyForWindow(snapshot, hours) {
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  const history = Array.isArray(snapshot.historySnapshots) ? snapshot.historySnapshots : [];
  const filtered = history
    .filter((item) => new Date(item.asOf).getTime() >= cutoff)
    .sort((a, b) => new Date(a.asOf) - new Date(b.asOf));
  if (filtered.length === 0 && isRealMarketSnapshot(snapshot)) {
    return [snapshot];
  }
  return filtered;
}

function isRealMarketSnapshot(snapshot) {
  return ["deribit-duckdb", "deribit-live", "akshare-duckdb"].includes(snapshot.sourceName);
}

function notEnoughHistoryWarning(snapshot, view) {
  const label = snapshot.sourceName === "akshare-duckdb" ? "AKShare" : "Deribit";
  return `Not enough ${label} snapshots yet. Keep the collector running to build this ${view}.`;
}

function windowHours(window) {
  return {
    "24h": 24,
    "3d": 72,
    "7d": 168,
    "30d": 720,
    "90d": 2160,
  }[String(window).toLowerCase()] ?? 24;
}

function collapseByStrike(rows) {
  const groups = new Map();
  for (const row of rows) {
    const current = groups.get(row.strike) ?? {
      strike: row.strike,
      callGex: 0,
      putGex: 0,
      gex: 0,
      openInterest: 0,
      volume: 0,
    };
    current.callGex += row.callGex;
    current.putGex += row.putGex;
    current.gex += row.gex;
    current.openInterest += row.openInterest;
    current.volume += row.volume;
    groups.set(row.strike, current);
  }
  return [...groups.values()].sort((a, b) => a.strike - b.strike);
}

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

async function getDeribitHealth() {
  let repo;
  try {
    repo = await createDuckDbRepository({ dbPath: getDuckDbPath() });
    return await repo.getHealth();
  } catch (error) {
    return {
      name: "deribit-duckdb",
      status: "unavailable",
      lastSnapshotAt: null,
      freshnessSeconds: null,
      dbPath: getDuckDbPath(),
      instruments: 0,
      tickers: 0,
      error: error.message,
    };
  } finally {
    repo?.close();
  }
}
