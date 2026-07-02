import { calculateGexSnapshot } from "../domain/gex.js";
import { instruments, optionChains, SAMPLE_AS_OF } from "../domain/sampleData.js";

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

export function createApiHandler() {
  const snapshots = new Map();

  function getSnapshot(symbol) {
    if (!snapshots.has(symbol)) {
      const instrument = instruments.find((item) => item.symbol === symbol);
      if (!instrument) {
        throw new Error(`Unsupported symbol: ${symbol}`);
      }
      snapshots.set(
        symbol,
        calculateGexSnapshot({
          symbol,
          spotPrice: instrument.spotPrice,
          asOf: SAMPLE_AS_OF,
          contracts: optionChains[symbol],
        }),
      );
    }
    return snapshots.get(symbol);
  }

  return async function handleRequest(request) {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/api/instruments") {
        return json({ instruments });
      }

      if (url.pathname === "/api/gex/summary") {
        const snapshot = getSnapshot(requiredSymbol(url));
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
          signalState: snapshot.signalState,
        });
      }

      if (url.pathname === "/api/gex/by-strike") {
        const snapshot = getSnapshot(requiredSymbol(url));
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

      if (url.pathname === "/api/gex/term-structure") {
        const snapshot = getSnapshot(requiredSymbol(url));
        return json({
          symbol: snapshot.symbol,
          rows: snapshot.byExpiry,
        });
      }

      if (url.pathname === "/api/signals") {
        const snapshot = getSnapshot(requiredSymbol(url));
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
        return json({
          sources: [
            {
              name: "sample-deribit-fixture",
              status: "healthy",
              lastSnapshotAt: SAMPLE_AS_OF,
              freshnessSeconds: 0,
              limitation: "Static fixture for model and UI validation; replace with live collector in V1.",
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
      const status = /Unsupported symbol|symbol is required/.test(error.message) ? 400 : 500;
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
