import { createDeribitJsonRpcClient } from "../integrations/deribitClient.js";
import {
  normalizeDeribitOptionTicker,
  normalizeTickerForStorage,
} from "../integrations/deribitNormalize.js";
import { createDuckDbRepository } from "./duckdbRepository.js";

const DEFAULT_SYMBOLS = ["BTC", "ETH"];

export async function collectDeribitSnapshot({
  symbols = DEFAULT_SYMBOLS,
  observedAt = new Date().toISOString(),
  client = createDeribitJsonRpcClient(),
  repository,
  concurrency = Number(process.env.DERIBIT_MAX_CONCURRENCY ?? 8),
} = {}) {
  const repo = repository ?? await createDuckDbRepository();
  const closeRepo = !repository;
  const results = [];

  try {
    for (const symbol of normalizeSymbols(symbols)) {
      let instruments;
      try {
        instruments = (await client.getInstruments(symbol))
          .filter((instrument) => instrument.kind === "option" || instrument.kind === undefined)
          .filter((instrument) => instrument.is_active !== false);
      } catch (error) {
        await repo.recordSourceFailure({
          venue: "deribit",
          symbol,
          observedAt,
          error,
        });
        throw error;
      }
      const tickers = [];
      const warnings = [];

      await mapWithConcurrency(instruments, concurrency, async (instrument) => {
        try {
          const ticker = await client.getTicker(instrument.instrument_name);
          const normalized = normalizeDeribitOptionTicker({ instrument, ticker, observedAt });
          if (normalized.warning) {
            warnings.push(normalized.warning);
            return;
          }
          tickers.push(normalizeTickerForStorage({ ticker, observedAt }));
        } catch (error) {
          warnings.push(`${instrument.instrument_name}: ${error.message}`);
        }
      });

      await repo.insertDeribitSnapshot({
        symbol,
        observedAt,
        instruments,
        tickers,
        warnings,
      });

      results.push({
        symbol,
        observedAt,
        instruments: instruments.length,
        tickers: tickers.length,
        warnings,
      });
    }
  } finally {
    if (closeRepo) {
      repo.close();
    }
  }

  return results;
}

export function defaultDeribitSymbols() {
  return DEFAULT_SYMBOLS;
}

function normalizeSymbols(symbols) {
  if (typeof symbols === "string") {
    return symbols.split(",").map((symbol) => symbol.trim().toUpperCase()).filter(Boolean);
  }
  return symbols.map((symbol) => String(symbol).trim().toUpperCase()).filter(Boolean);
}

async function mapWithConcurrency(items, limit, worker) {
  const workers = Array.from({ length: Math.max(1, limit) }, async (_, workerIndex) => {
    for (let index = workerIndex; index < items.length; index += Math.max(1, limit)) {
      await worker(items[index], index);
    }
  });
  await Promise.all(workers);
}
