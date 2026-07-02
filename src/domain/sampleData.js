export const SAMPLE_AS_OF = "2024-07-01T12:00:00.000Z";

export const instruments = [
  {
    symbol: "BTC",
    name: "Bitcoin",
    venue: "Deribit-style fixture",
    spotPrice: 61200,
  },
  {
    symbol: "ETH",
    name: "Ethereum",
    venue: "Deribit-style fixture",
    spotPrice: 3420,
  },
  {
    symbol: "SOL",
    name: "Solana",
    venue: "Deribit-style fixture",
    spotPrice: 146,
  },
  {
    symbol: "XRP",
    name: "XRP",
    venue: "Deribit-style fixture",
    spotPrice: 0.62,
  },
];

export const optionChains = {
  BTC: [
    option("BTC-26JUL24-58000-P", 61200, 58000, "2024-07-26", "put", 0.69, 900, 184, 0.022),
    option("BTC-26JUL24-59000-P", 61200, 59000, "2024-07-26", "put", 0.64, 1500, 390, 0.039),
    option("BTC-26JUL24-60000-C", 61200, 60000, "2024-07-26", "call", 0.58, 820, 315, 0.068),
    option("BTC-26JUL24-62000-C", 61200, 62000, "2024-07-26", "call", 0.61, 1220, 440, 0.043),
    option("BTC-30AUG24-65000-C", 61200, 65000, "2024-08-30", "call", 0.66, 640, 151, 0.051),
    option("BTC-30AUG24-56000-P", 61200, 56000, "2024-08-30", "put", 0.71, 520, 103, 0.028),
  ],
  ETH: [
    option("ETH-26JUL24-3200-P", 3420, 3200, "2024-07-26", "put", 0.72, 2100, 410, 0.026),
    option("ETH-26JUL24-3300-P", 3420, 3300, "2024-07-26", "put", 0.67, 1740, 312, 0.038),
    option("ETH-26JUL24-3500-C", 3420, 3500, "2024-07-26", "call", 0.64, 2680, 530, 0.041),
    option("ETH-30AUG24-3800-C", 3420, 3800, "2024-08-30", "call", 0.69, 1120, 211, 0.055),
    option("ETH-30AUG24-3000-P", 3420, 3000, "2024-08-30", "put", 0.75, 980, 140, 0.021),
  ],
  SOL: [
    option("SOL-26JUL24-130-P", 146, 130, "2024-07-26", "put", 0.86, 1880, 420, 0.018),
    option("SOL-26JUL24-140-P", 146, 140, "2024-07-26", "put", 0.81, 2310, 500, 0.032),
    option("SOL-26JUL24-150-C", 146, 150, "2024-07-26", "call", 0.78, 2600, 610, 0.044),
    option("SOL-30AUG24-170-C", 146, 170, "2024-08-30", "call", 0.89, 1160, 240, 0.057),
  ],
  XRP: [
    option("XRP-26JUL24-0.55-P", 0.62, 0.55, "2024-07-26", "put", 0.92, 3200, 680, 0.012),
    option("XRP-26JUL24-0.60-P", 0.62, 0.6, "2024-07-26", "put", 0.88, 2700, 590, 0.018),
    option("XRP-26JUL24-0.65-C", 0.62, 0.65, "2024-07-26", "call", 0.84, 4100, 750, 0.02),
    option("XRP-30AUG24-0.75-C", 0.62, 0.75, "2024-08-30", "call", 0.95, 1900, 290, 0.027),
  ],
};

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
    impliedVolatility,
    openInterest,
    volume,
    markPrice,
  };
}
