const DAY_MS = 24 * 60 * 60 * 1000;
const YEAR_DAYS = 365;
const MONTHS = new Map([
  ["JAN", 0],
  ["FEB", 1],
  ["MAR", 2],
  ["APR", 3],
  ["MAY", 4],
  ["JUN", 5],
  ["JUL", 6],
  ["AUG", 7],
  ["SEP", 8],
  ["OCT", 9],
  ["NOV", 10],
  ["DEC", 11],
]);

export const SUPPORTED_SYMBOLS = ["BTC", "ETH", "SOL", "XRP"];

export function parseDeribitInstrumentName(instrumentName) {
  const match = /^([A-Z]+)-(\d{2})([A-Z]{3})(\d{2})-(\d+(?:\.\d+)?)-([CP])$/.exec(
    instrumentName,
  );

  if (!match) {
    throw new Error(`Invalid Deribit instrument name: ${instrumentName}`);
  }

  const [, symbol, dayText, monthText, yearText, strikeText, typeText] = match;
  const month = MONTHS.get(monthText);

  if (month === undefined) {
    throw new Error(`Invalid expiry month in instrument: ${instrumentName}`);
  }

  const year = 2000 + Number(yearText);
  const expiryDate = new Date(Date.UTC(year, month, Number(dayText)));

  return {
    symbol,
    expiry: expiryDate.toISOString().slice(0, 10),
    strike: Number(strikeText),
    optionType: typeText === "C" ? "call" : "put",
  };
}

export function calculateGexSnapshot({ symbol, spotPrice, asOf, contracts }) {
  if (!SUPPORTED_SYMBOLS.includes(symbol)) {
    throw new Error(`Unsupported symbol: ${symbol}`);
  }
  if (!Number.isFinite(spotPrice) || spotPrice <= 0) {
    throw new Error("spotPrice must be a positive number");
  }
  if (!Array.isArray(contracts) || contracts.length === 0) {
    throw new Error("contracts must contain at least one option contract");
  }

  const normalized = contracts.map((contract) =>
    normalizeContract(contract, symbol, spotPrice, asOf),
  );
  const byStrike = aggregateByStrike(normalized);
  const byExpiry = aggregateByExpiry(normalized);
  const totalOpenInterest = normalized.reduce(
    (sum, contract) => sum + contract.openInterest,
    0,
  );
  const netGex = byStrike.reduce((sum, row) => sum + row.gex, 0);
  const netDelta = normalized.reduce((sum, contract) => sum + contract.netDelta, 0);
  const callWall = largestOpenInterestStrike(normalized, "call");
  const putWall = largestOpenInterestStrike(normalized, "put");
  const maxPainStrike = calculateMaxPainStrike(normalized, spotPrice);
  const gammaFlip = calculateGammaFlip(byStrike, spotPrice, netGex);

  return {
    symbol,
    spotPrice,
    asOf,
    netGex: round(netGex, 2),
    netDelta: round(netDelta, 2),
    totalOpenInterest,
    gammaFlip,
    callWall,
    putWall,
    maxPainStrike,
    byStrike,
    byExpiry,
    signalState: classifySignalState({
      spotPrice,
      netGex,
      gammaFlip,
      callWall,
      putWall,
    }),
  };
}

export function classifySignalState({
  spotPrice,
  netGex,
  gammaFlip,
  callWall,
  putWall,
}) {
  const flipDistancePct = Math.abs((spotPrice - gammaFlip) / spotPrice) * 100;
  const regime = netGex >= 0 ? "positive_gamma" : "negative_gamma";
  const nearFlip = flipDistancePct <= 1;
  const betweenWalls = spotPrice > putWall && spotPrice < callWall;

  let primaryRisk = "pin_risk";
  if (regime === "negative_gamma" && nearFlip) {
    primaryRisk = "breakout_risk";
  } else if (regime === "negative_gamma") {
    primaryRisk = "directional_acceleration";
  } else if (nearFlip) {
    primaryRisk = "flip_zone";
  } else if (!betweenWalls) {
    primaryRisk = "wall_break";
  }

  return {
    regime,
    primaryRisk,
    flipDistancePct: round(flipDistancePct, 2),
    nearestWall:
      Math.abs(spotPrice - callWall) <= Math.abs(spotPrice - putWall)
        ? callWall
        : putWall,
  };
}

function normalizeContract(contract, symbol, spotPrice, asOf) {
  const parsed = contract.instrumentName
    ? parseDeribitInstrumentName(contract.instrumentName)
    : {};
  const optionType = contract.optionType ?? parsed.optionType;
  const strike = Number(contract.strike ?? parsed.strike);
  const expiry = contract.expiry ?? parsed.expiry;
  const impliedVolatility = Number(contract.impliedVolatility);
  const openInterest = Number(contract.openInterest);
  const volume = Number(contract.volume ?? 0);
  const markPrice = Number(contract.markPrice ?? 0);
  const timeToExpiryYears = yearsToExpiry(expiry, asOf);
  const gamma = blackScholesGamma({
    spotPrice,
    strike,
    volatility: impliedVolatility,
    timeToExpiryYears,
  });
  const delta = approximateDelta({ spotPrice, strike, optionType });
  const direction = optionType === "put" ? -1 : 1;
  const gex = direction * gamma * spotPrice * spotPrice * 0.01 * openInterest;

  return {
    symbol,
    instrumentName: contract.instrumentName,
    expiry,
    strike,
    optionType,
    impliedVolatility,
    openInterest,
    volume,
    markPrice,
    gamma,
    gex,
    netDelta: direction * Math.abs(delta) * openInterest,
  };
}

function yearsToExpiry(expiry, asOf) {
  const expiryTime = new Date(`${expiry}T08:00:00.000Z`).getTime();
  const asOfTime = new Date(asOf).getTime();
  return Math.max((expiryTime - asOfTime) / DAY_MS / YEAR_DAYS, 1 / YEAR_DAYS);
}

function blackScholesGamma({ spotPrice, strike, volatility, timeToExpiryYears }) {
  const sigma = Math.max(volatility, 0.01);
  const sqrtT = Math.sqrt(timeToExpiryYears);
  const d1 =
    (Math.log(spotPrice / strike) + 0.5 * sigma * sigma * timeToExpiryYears) /
    (sigma * sqrtT);
  return normalPdf(d1) / (spotPrice * sigma * sqrtT);
}

function approximateDelta({ spotPrice, strike, optionType }) {
  const moneyness = spotPrice / strike - 1;
  const magnitude = clamp(0.5 + moneyness * 6, 0.05, 0.95);
  return optionType === "call" ? magnitude : magnitude - 1;
}

function normalPdf(value) {
  return Math.exp(-0.5 * value * value) / Math.sqrt(2 * Math.PI);
}

function aggregateByStrike(contracts) {
  const groups = new Map();

  for (const contract of contracts) {
    const key = `${contract.expiry}:${contract.strike}`;
    const row = groups.get(key) ?? {
      expiry: contract.expiry,
      strike: contract.strike,
      callGex: 0,
      putGex: 0,
      gex: 0,
      openInterest: 0,
      volume: 0,
      gamma: 0,
    };

    if (contract.optionType === "call") {
      row.callGex += contract.gex;
    } else {
      row.putGex += contract.gex;
    }
    row.gex += contract.gex;
    row.openInterest += contract.openInterest;
    row.volume += contract.volume;
    row.gamma += contract.gamma;
    groups.set(key, row);
  }

  return [...groups.values()]
    .sort((a, b) => a.expiry.localeCompare(b.expiry) || a.strike - b.strike)
    .map((row) => ({
      ...row,
      callGex: round(row.callGex, 2),
      putGex: round(row.putGex, 2),
      gex: round(row.gex, 2),
      gamma: round(row.gamma, 8),
    }));
}

function aggregateByExpiry(contracts) {
  const groups = new Map();

  for (const contract of contracts) {
    const row = groups.get(contract.expiry) ?? {
      expiry: contract.expiry,
      gex: 0,
      openInterest: 0,
      volume: 0,
    };
    row.gex += contract.gex;
    row.openInterest += contract.openInterest;
    row.volume += contract.volume;
    groups.set(contract.expiry, row);
  }

  return [...groups.values()]
    .sort((a, b) => a.expiry.localeCompare(b.expiry))
    .map((row) => ({ ...row, gex: round(row.gex, 2) }));
}

function largestOpenInterestStrike(contracts, optionType) {
  return contracts
    .filter((contract) => contract.optionType === optionType)
    .sort((a, b) => b.openInterest - a.openInterest || a.strike - b.strike)[0]
    ?.strike;
}

function calculateMaxPainStrike(contracts, spotPrice) {
  const strikes = [...new Set(contracts.map((contract) => contract.strike))].sort(
    (a, b) => a - b,
  );
  const payouts = strikes.map((settlement) => {
    const payout = contracts.reduce((sum, contract) => {
      if (contract.optionType === "call") {
        return sum + Math.max(settlement - contract.strike, 0) * contract.openInterest;
      }
      return sum + Math.max(contract.strike - settlement, 0) * contract.openInterest;
    }, 0);
    return { strike: settlement, payout };
  });
  const minPayout = Math.min(...payouts.map((row) => row.payout));
  return payouts
    .filter((row) => row.payout === minPayout)
    .sort((a, b) => Math.abs(a.strike - spotPrice) - Math.abs(b.strike - spotPrice))[0]
    .strike;
}

function calculateGammaFlip(byStrike, spotPrice, netGex) {
  const sorted = [...byStrike].sort((a, b) => a.strike - b.strike);
  let previous = sorted[0];
  let cumulative = previous.gex;

  for (const row of sorted.slice(1)) {
    const next = cumulative + row.gex;
    if (Math.sign(cumulative) !== Math.sign(next)) {
      const weight = Math.abs(cumulative) / (Math.abs(cumulative) + Math.abs(next));
      return round(previous.strike + (row.strike - previous.strike) * weight, 2);
    }
    cumulative = next;
    previous = row;
  }

  if (sorted.length >= 2) {
    const lower = sorted.findLast((row) => row.strike <= spotPrice) ?? sorted[0];
    const upper = sorted.find((row) => row.strike >= spotPrice) ?? sorted.at(-1);
    const pressure = clamp(Math.abs(netGex) / 5_000_000, 0, 1);
    const anchor = netGex < 0 ? upper.strike : lower.strike;
    return round(spotPrice * (1 - pressure) + anchor * pressure, 2);
  }

  return sorted[0].strike;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
