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
    if (source === "deribit" || source === "auto") {
      const deribit = await getDeribitSnapshot(symbol);
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
        const ui = buildUiMetrics({ ...snapshot, byStrike: rows });
        const trends = buildRealTrendSeries(snapshot);
        return json({
          symbol: snapshot.symbol,
          spotPrice: snapshot.spotPrice,
          asOf: snapshot.asOf,
          sourceLabel: snapshot.sourceLabel,
          mode: url.searchParams.get("mode") ?? "snapshot",
          rows,
          expiries: snapshot.byExpiry,
          markers: {
            gammaFlip: snapshot.gammaFlip,
            callWall: snapshot.callWall,
            putWall: snapshot.putWall,
            maxPainStrike: snapshot.maxPainStrike,
            peaks: ui.peaks,
            keyLevels: ui.studioKeyLevels,
          },
          summary: summaryPayload(snapshot, ui),
          summaryRail: buildSummaryRail({ ...snapshot, byStrike: rows }, trends),
          trends,
          forecast: buildForecastInput(snapshot),
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
      const status = /Unsupported symbol|symbol is required|type must be|coverage must be|Deribit data unavailable/.test(error.message)
        ? 400
        : 500;
      return json({ error: error.message }, status);
    }
  };
}

function requiredSymbol(url) {
  const symbol = url.searchParams.get("symbol")?.toUpperCase();
  if (!symbol) {
    throw new Error("symbol is required");
  }
  if (!optionChains[symbol]) {
    throw new Error(`Unsupported symbol: ${symbol}`);
  }
  return symbol;
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
    netGex: snapshot.netGex,
    netDelta: snapshot.netDelta,
    totalOpenInterest: snapshot.totalOpenInterest,
    gammaFlip: snapshot.gammaFlip,
    callWall: snapshot.callWall,
    putWall: snapshot.putWall,
    maxPainStrike: snapshot.maxPainStrike,
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

  const deribit = await getDeribitAvailableInstruments();
  if (deribit.length > 0 || source === "deribit") {
    return deribit;
  }

  return instruments;
}

async function getDeribitAvailableInstruments() {
  let repo;
  try {
    repo = await createDuckDbRepository({ dbPath: getDuckDbPath() });
    const available = await repo.getAvailableSymbols();
    const liveSymbols = new Set(available.filter((row) => row.tickerCount > 0).map((row) => row.symbol));
    return instruments
      .filter((instrument) => liveSymbols.has(instrument.symbol))
      .map((instrument) => ({
        ...instrument,
        venue: "Deribit",
        lastSnapshotAt: available.find((row) => row.symbol === instrument.symbol)?.lastSnapshotAt,
      }));
  } catch {
    return [];
  } finally {
    repo?.close();
  }
}

async function getDeribitSnapshot(symbol) {
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

function safeSnapshot(input) {
  try {
    return calculateGexSnapshot(input);
  } catch {
    return null;
  }
}

function buildRealTrendSeries(snapshot, { hours = 24 } = {}) {
  if (snapshot.sourceName !== "deribit-duckdb") {
    return buildTrendSeries(snapshot);
  }

  const points = historyForWindow(snapshot, hours).map((item) => trendPoint(item));
  const realPoints = points.length > 0 ? points : [trendPoint(snapshot)];

  return {
    symbol: snapshot.symbol,
    asOf: snapshot.asOf,
    source: "deribit-duckdb",
    status: realPoints.length >= 2 ? "ready" : "accumulating",
    warning: realPoints.length >= 2 ? null : "Not enough historical Deribit snapshots yet. Keep the collector running to build this view.",
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
  if (snapshot.sourceName !== "deribit-duckdb") {
    return buildHeatmapMatrix(snapshot, { type });
  }

  const history = historyForWindow(snapshot, windowHours(window));
  if (history.length < 2) {
    return {
      symbol: snapshot.symbol,
      type,
      source: "deribit-duckdb",
      status: "accumulating",
      warning: "Not enough historical Deribit snapshots yet. Keep the collector running to build this heatmap.",
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
    source: "deribit-duckdb",
    status: "ready",
    warning: null,
    columns,
    rows,
    indexPath: collapsedByTime.map(({ snapshot: item }) => ({ time: item.asOf, price: item.spotPrice })),
    flipPath: collapsedByTime.map(({ snapshot: item }) => ({ time: item.asOf, price: item.gammaFlip })),
  };
}

function buildRealChangeTable(snapshot, { coverage = 50 } = {}) {
  if (snapshot.sourceName !== "deribit-duckdb") {
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
      source: "deribit-duckdb",
      status: "accumulating",
      warning: "Not enough historical Deribit snapshots yet. Change percentages will appear after another collection point.",
      columns: selected.map((row) => row.strike),
      periods: ["Now"],
      rows: selected.map((row) => ({ strike: row.strike, now: Math.abs(row.gex), changes: {} })),
    };
  }

  const previous = new Map(collapseByStrike(history[0].byStrike).map((row) => [row.strike, row]));
  return {
    symbol: snapshot.symbol,
    coverage: normalizedCoverage,
    source: "deribit-duckdb",
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
  if (filtered.length === 0 && snapshot.sourceName === "deribit-duckdb") {
    return [snapshot];
  }
  return filtered;
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
