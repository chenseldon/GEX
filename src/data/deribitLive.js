import { performance } from "node:perf_hooks";

import { calculateGexSnapshot } from "../domain/gex.js";
import { createDeribitJsonRpcClient } from "../integrations/deribitClient.js";
import { normalizeDeribitOptionTicker } from "../integrations/deribitNormalize.js";
import { createDuckDbRepository, getDuckDbPath } from "./duckdbRepository.js";

const DEFAULT_TTL_MS = 30_000;
const cache = new Map();

export async function getLiveDeribitSnapshot({
  symbol,
  client = createDeribitJsonRpcClient(),
  ttlMs = Number(process.env.DERIBIT_REALTIME_TTL_MS ?? DEFAULT_TTL_MS),
  includeHistory = true,
} = {}) {
  const normalizedSymbol = String(symbol ?? "").trim().toUpperCase();
  if (!normalizedSymbol) {
    throw new Error("symbol is required");
  }

  const cached = cache.get(normalizedSymbol);
  const now = Date.now();
  if (cached?.snapshot && now - cached.createdAt <= ttlMs) {
    return { ...cached.snapshot, cacheHit: true };
  }
  if (cached?.pending) {
    const snapshot = await cached.pending;
    return { ...snapshot, cacheHit: true };
  }

  const pending = loadLiveSnapshot({ symbol: normalizedSymbol, client, includeHistory })
    .finally(() => {
      const current = cache.get(normalizedSymbol);
      if (current?.pending === pending) {
        cache.set(normalizedSymbol, { ...current, pending: null });
      }
    });
  cache.set(normalizedSymbol, { createdAt: now, pending });
  const snapshot = await pending;
  cache.set(normalizedSymbol, { createdAt: Date.now(), snapshot, pending: null });
  return snapshot;
}

export async function measureDeribitLatency({
  symbol = "BTC",
  samples = 5,
  client = createDeribitJsonRpcClient(),
} = {}) {
  const measurements = [];
  for (let index = 0; index < samples; index += 1) {
    const startedAt = performance.now();
    const result = await client.getBookSummaryByCurrency(symbol, "option");
    measurements.push({
      ms: Math.round(performance.now() - startedAt),
      contracts: result.length,
    });
  }
  const values = measurements.map((row) => row.ms).sort((a, b) => a - b);
  return {
    symbol,
    samples: measurements,
    minMs: values[0] ?? null,
    p50Ms: values[Math.floor(values.length / 2)] ?? null,
    maxMs: values.at(-1) ?? null,
  };
}

async function loadLiveSnapshot({ symbol, client, includeHistory }) {
  const observedAt = new Date().toISOString();
  const startedAt = performance.now();
  const summaries = await client.getBookSummaryByCurrency(symbol, "option");
  const contracts = [];
  const warnings = [];

  for (const ticker of summaries) {
    const normalized = normalizeDeribitOptionTicker({
      instrument: { instrument_name: ticker.instrument_name },
      ticker,
      observedAt,
    });
    if (normalized.warning) {
      warnings.push(normalized.warning);
    } else {
      contracts.push(normalized.contract);
    }
  }

  const snapshot = calculateGexSnapshot({
    symbol,
    spotPrice: spotPriceFromContracts(contracts),
    asOf: observedAt,
    contracts,
  });
  const historySnapshots = includeHistory ? await readDuckDbHistory(symbol) : [];

  return {
    ...snapshot,
    sourceLabel: "Deribit Live",
    sourceName: "deribit-live",
    requestLatencyMs: Math.round(performance.now() - startedAt),
    sourceWarnings: warnings,
    historySnapshots,
  };
}

async function readDuckDbHistory(symbol) {
  let repo;
  try {
    repo = await createDuckDbRepository({ dbPath: getDuckDbPath() });
    const historyInputs = await repo.getOptionChainHistory(symbol, { hours: 90 * 24, limit: 720 });
    return historyInputs
      .map((input) => {
        try {
          return calculateGexSnapshot(input);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  } finally {
    repo?.close();
  }
}

function spotPriceFromContracts(contracts) {
  return contracts.find((contract) => Number.isFinite(Number(contract.underlyingPrice)))?.underlyingPrice;
}
