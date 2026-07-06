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
    const source = process.env.DATA_SOURCE ?? "fixture";
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
        return json({ instruments });
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
          trends: buildTrendSeries(snapshot),
          heatmaps: {
            net: buildHeatmapMatrix(snapshot, { type: "net" }),
            abs: buildHeatmapMatrix(snapshot, { type: "abs" }),
          },
          changeTable: buildChangeTable(snapshot, { coverage: Number(url.searchParams.get("coverage") ?? 50) }),
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
        return json({
          symbol: snapshot.symbol,
          spotPrice: snapshot.spotPrice,
          asOf: snapshot.asOf,
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
          summaryRail: buildSummaryRail({ ...snapshot, byStrike: rows }),
          trends: buildTrendSeries(snapshot),
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
        return json(buildTrendSeries(snapshot));
      }

      if (url.pathname === "/api/gex/heatmap") {
        const snapshot = await getSnapshot(requiredSymbol(url));
        return json(buildHeatmapMatrix(snapshot, { type: url.searchParams.get("type") ?? "net" }));
      }

      if (url.pathname === "/api/gex/change-table") {
        const snapshot = await getSnapshot(requiredSymbol(url));
        return json(
          buildChangeTable(snapshot, {
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

async function getDeribitSnapshot(symbol) {
  let repo;
  try {
    repo = await createDuckDbRepository({ dbPath: getDuckDbPath() });
    const latest = await repo.getLatestOptionChain(symbol);
    if (!latest || latest.contracts.length === 0) {
      return null;
    }
    const snapshot = calculateGexSnapshot(latest);
    return {
      ...snapshot,
      sourceLabel: "Deribit",
      sourceName: "deribit-duckdb",
    };
  } catch {
    return null;
  } finally {
    repo?.close();
  }
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
