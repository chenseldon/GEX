export const SAMPLE_AS_OF = "2024-07-01T12:00:00.000Z";

export const instruments = [
  {
    symbol: "BTC",
    name: "Bitcoin",
    venue: "Deribit + Bybit + OKX fixture",
    spotPrice: 60288,
  },
  {
    symbol: "ETH",
    name: "Ethereum",
    venue: "Deribit + Bybit + OKX fixture",
    spotPrice: 3420,
  },
  {
    symbol: "SOL",
    name: "Solana",
    venue: "Deribit + Bybit + OKX fixture",
    spotPrice: 146,
  },
  {
    symbol: "XRP",
    name: "XRP",
    venue: "Deribit + Bybit + OKX fixture",
    spotPrice: 0.62,
  },
];

const STRIKES = {
  BTC: [56500, 57500, 58000, 59000, 59500, 60000, 60500, 61000, 61500, 62000, 63000, 64000],
  ETH: [3000, 3100, 3200, 3300, 3350, 3400, 3450, 3500, 3600, 3700, 3800, 4000],
  SOL: [118, 126, 132, 138, 142, 146, 150, 156, 164, 172, 184, 196],
  XRP: [0.48, 0.52, 0.55, 0.58, 0.6, 0.62, 0.65, 0.68, 0.72, 0.76, 0.82, 0.9],
};

const EXPIRIES = ["2024-07-26", "2024-08-30"];
const BASE_IV = { BTC: 0.62, ETH: 0.68, SOL: 0.82, XRP: 0.9 };

export const optionChains = Object.fromEntries(
  instruments.map((instrument) => [
    instrument.symbol,
    generateOptionChain(instrument.symbol, instrument.spotPrice),
  ]),
);

function generateOptionChain(symbol, spotPrice) {
  return EXPIRIES.flatMap((expiry, expiryIndex) =>
    STRIKES[symbol].flatMap((strike, strikeIndex) => {
      const distance = Math.abs(strike / spotPrice - 1);
      const gravity = Math.max(0, 1 - distance * 7);
      const skew = strike < spotPrice ? 1.16 : 0.94;
      const callOpenInterest = Math.round((420 + strikeIndex * 74 + expiryIndex * 210) * (0.8 + gravity));
      const putOpenInterest = Math.round((520 + (STRIKES[symbol].length - strikeIndex) * 82 + expiryIndex * 160) * (0.75 + gravity) * skew);
      const impliedVolatility = BASE_IV[symbol] + distance * 0.85 + expiryIndex * 0.045;

      return [
        option(
          instrumentName(symbol, expiry, strike, "C"),
          spotPrice,
          strike,
          expiry,
          "call",
          impliedVolatility,
          callOpenInterest,
          Math.round(callOpenInterest * (0.19 + gravity * 0.1)),
          round(Math.max(0.004, (spotPrice / strike - 0.96) * 0.12 + 0.035 + expiryIndex * 0.006), 4),
        ),
        option(
          instrumentName(symbol, expiry, strike, "P"),
          spotPrice,
          strike,
          expiry,
          "put",
          impliedVolatility * 1.04,
          putOpenInterest,
          Math.round(putOpenInterest * (0.17 + gravity * 0.12)),
          round(Math.max(0.004, (strike / spotPrice - 0.96) * 0.11 + 0.033 + expiryIndex * 0.006), 4),
        ),
      ];
    }),
  );
}

function instrumentName(symbol, expiry, strike, type) {
  const date = new Date(`${expiry}T00:00:00.000Z`);
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = date.toLocaleString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase();
  const year = String(date.getUTCFullYear()).slice(2);
  return `${symbol}-${day}${month}${year}-${strike}-${type}`;
}

function option(
  instrumentName,
  underlyingPrice,
  strike,
  expiry,
  optionType,
  impliedVolatility,
  openInterest,
  volume,
  markPrice,
) {
  return {
    instrumentName,
    underlyingPrice,
    strike,
    expiry,
    optionType,
    impliedVolatility: round(impliedVolatility, 4),
    openInterest,
    volume,
    markPrice,
  };
}

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
