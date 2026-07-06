import { parseDeribitInstrumentName } from "../domain/gex.js";

export function normalizeDeribitOptionTicker({ instrument, ticker, observedAt }) {
  const instrumentName = ticker?.instrument_name ?? instrument?.instrument_name;
  const parsed = parseDeribitInstrumentName(instrumentName);
  const markIv = Number(ticker?.mark_iv);
  const openInterest = Number(ticker?.open_interest);
  const underlyingPrice = Number(ticker?.underlying_price);
  const missing = [];

  if (!Number.isFinite(markIv) || markIv <= 0) missing.push("mark_iv");
  if (!Number.isFinite(openInterest)) missing.push("open_interest");
  if (!Number.isFinite(underlyingPrice) || underlyingPrice <= 0) missing.push("underlying_price");

  if (missing.length > 0) {
    return {
      contract: null,
      warning: `${instrumentName} missing unusable fields: ${missing.join(", ")}`,
    };
  }

  const expiry = expiryFromInstrument(instrument) ?? parsed.expiry;
  const optionType = normalizeOptionType(instrument?.option_type) ?? parsed.optionType;
  const strike = Number(instrument?.strike ?? parsed.strike);

  return {
    warning: null,
    contract: {
      instrumentName,
      underlyingPrice,
      strike,
      expiry,
      optionType,
      impliedVolatility: normalizeIv(markIv),
      openInterest,
      volume: Number(ticker?.stats?.volume ?? 0),
      markPrice: Number(ticker?.mark_price ?? 0),
      bidPrice: nullableNumber(ticker?.best_bid_price ?? ticker?.bid_price),
      askPrice: nullableNumber(ticker?.best_ask_price ?? ticker?.ask_price),
      lastPrice: nullableNumber(ticker?.last_price),
      greeks: ticker?.greeks ?? {},
      raw: ticker,
      observedAt,
    },
  };
}

export function normalizeTickerForStorage({ ticker, observedAt }) {
  const instrumentName = ticker.instrument_name;
  const greeks = ticker.greeks ?? {};
  return {
    instrumentName,
    observedAt,
    underlyingPrice: Number(ticker.underlying_price),
    openInterest: Number(ticker.open_interest),
    markIv: Number(ticker.mark_iv),
    markPrice: Number(ticker.mark_price ?? 0),
    bidPrice: nullableNumber(ticker.best_bid_price ?? ticker.bid_price),
    askPrice: nullableNumber(ticker.best_ask_price ?? ticker.ask_price),
    lastPrice: nullableNumber(ticker.last_price),
    volume: Number(ticker.stats?.volume ?? 0),
    greeks,
    raw: ticker,
  };
}

export function normalizeIv(value) {
  const iv = Number(value);
  return iv > 3 ? iv / 100 : iv;
}

function expiryFromInstrument(instrument) {
  const timestamp = Number(instrument?.expiration_timestamp);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return null;
  }
  return new Date(timestamp).toISOString().slice(0, 10);
}

function normalizeOptionType(optionType) {
  if (optionType === "call" || optionType === "put") {
    return optionType;
  }
  if (optionType === "C") return "call";
  if (optionType === "P") return "put";
  return null;
}

function nullableNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
