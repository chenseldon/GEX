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
  const match = /^([A-Z]+)-(\d{1,2})([A-Z]{3})(\d{2})-(\d+(?:\.\d+)?)-([CP])$/.exec(
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
  const averageImpliedVolatility = normalized.reduce(
    (sum, contract) => sum + contract.impliedVolatility * contract.openInterest,
    0,
  ) / Math.max(totalOpenInterest, 1);
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
    averageImpliedVolatility: round(averageImpliedVolatility, 4),
    gammaFlip,
    callWall,
    putWall,
    maxPainStrike,
    byStrike,
    byExpiry,
    ui: buildUiMetricsFromRows({
      spotPrice,
      netGex,
      gammaFlip,
      callWall,
      putWall,
      maxPainStrike,
      byStrike,
    }),
    signalState: classifySignalState({
      spotPrice,
      netGex,
      gammaFlip,
      callWall,
      putWall,
    }),
  };
}

export function buildUiMetrics(snapshot) {
  return buildUiMetricsFromRows(snapshot);
}

export function buildTrendSeries(snapshot) {
  const ui = buildUiMetrics(snapshot);
  const asOf = new Date(snapshot.asOf);
  const points = [];

  for (let offset = 23; offset >= 0; offset -= 1) {
    const date = new Date(asOf.getTime() - offset * 60 * 60 * 1000);
    const phase = (23 - offset) / 23;
    const wave = Math.sin(phase * Math.PI * 2);
    const pulse = Math.cos(phase * Math.PI * 4) * 0.35;
    const drift = (phase - 0.5) * 0.22;

    points.push({
      time: date.toISOString().slice(11, 16),
      indexPrice: round(snapshot.spotPrice * (1 + wave * 0.006 + drift * 0.01), 2),
      flipPoint: round(snapshot.gammaFlip * (1 + pulse * 0.002), 2),
      callPut: round(clamp(ui.gauges.callPut + wave * 0.08, -1, 1), 3),
      upDown: round(clamp(ui.gauges.upDown + pulse * 0.08, -1, 1), 3),
      netGex: round(snapshot.netGex * (1 + wave * 0.22 + drift), 2),
      absGex: round(ui.absoluteGex * (1 + Math.abs(wave) * 0.12 + phase * 0.08), 2),
      hedgingPressure: round(ui.positiveGex - ui.negativeGex + ui.absoluteGex * wave * 0.04, 2),
    });
  }

  return { symbol: snapshot.symbol, asOf: snapshot.asOf, points };
}

export function buildHeatmapMatrix(snapshot, { type = "net" } = {}) {
  if (!["net", "abs"].includes(type)) {
    throw new Error("type must be net or abs");
  }

  const strikes = collapseStrikeRows(snapshot.byStrike)
    .sort((a, b) => a.strike - b.strike)
    .map((row) => row.strike);
  const asOf = new Date(snapshot.asOf);
  const columns = Array.from({ length: 18 }, (_, index) => {
    const date = new Date(asOf.getTime() - (17 - index) * 4 * 60 * 60 * 1000);
    return date.toISOString().slice(5, 16).replace("T", " ");
  });
  const baseRows = collapseStrikeRows(snapshot.byStrike);
  const byStrike = new Map(baseRows.map((row) => [row.strike, row]));

  const rows = strikes.map((strike, strikeIndex) => {
    const row = byStrike.get(strike);
    const values = columns.map((_, columnIndex) => {
      const wave = Math.sin((strikeIndex + 1) * 0.8 + columnIndex * 0.55);
      const trend = 1 + columnIndex / columns.length * 0.2;
      const raw = type === "abs" ? Math.abs(row.gex) : row.gex;
      return round(raw * trend + Math.abs(raw) * wave * 0.18, 2);
    });
    return { strike, values };
  });

  return {
    symbol: snapshot.symbol,
    type,
    columns,
    rows,
    indexPath: columns.map((time, index) => ({
      time,
      price: round(snapshot.spotPrice * (1 + Math.sin(index * 0.45) * 0.006), 2),
    })),
    flipPath: columns.map((time, index) => ({
      time,
      price: round(snapshot.gammaFlip * (1 + Math.cos(index * 0.35) * 0.002), 2),
    })),
  };
}

export function buildChangeTable(snapshot, { coverage = 50 } = {}) {
  const allowed = [50, 80, 90, 100];
  const normalizedCoverage = Number(coverage);
  if (!allowed.includes(normalizedCoverage)) {
    throw new Error("coverage must be one of 50, 80, 90, 100");
  }

  const ranked = collapseStrikeRows(snapshot.byStrike).sort(
    (a, b) => Math.abs(b.gex) - Math.abs(a.gex) || a.strike - b.strike,
  );
  const count = Math.max(1, Math.ceil(ranked.length * (normalizedCoverage / 100)));
  const rows = ranked
    .slice(0, count)
    .sort((a, b) => a.strike - b.strike)
    .map((row, index) => {
      const base = Math.max(Math.abs(row.gex), 1);
      return {
        strike: row.strike,
        now: round(base, 2),
        changes: {
          "24h": round(((index % 3) - 1) * 18 + Math.sign(row.gex) * 34, 1),
          "2d": round(((index % 4) - 1.5) * 12 + Math.sign(row.gex) * 18, 1),
          "3d": round(((index % 5) - 2) * 10 + Math.sign(row.gex) * 24, 1),
          "1w": round(((index % 6) - 2.5) * 16 + Math.sign(row.gex) * 42, 1),
        },
      };
    });

  return {
    symbol: snapshot.symbol,
    coverage: normalizedCoverage,
    columns: rows.map((row) => row.strike),
    periods: ["Now", "24h", "2d", "3d", "1w"],
    rows,
  };
}

export function buildSummaryRail(snapshot, trendSeries = buildTrendSeries(snapshot)) {
  const ui = buildUiMetrics(snapshot);
  const trends = trendSeries.points;

  return [
    {
      id: "flip_point",
      title: "Flip Point",
      label: "Regime boundary · 24h",
      value: snapshot.gammaFlip,
      formattedValue: priceLabel(snapshot.gammaFlip),
      accent: "#ff00ff",
      status: snapshot.spotPrice >= snapshot.gammaFlip ? "Above flip · positive" : "Below flip · negative",
      series: trends.map((point) => ({ time: point.time, value: point.flipPoint })),
    },
    {
      id: "hedging_pressure",
      title: "Hedging Pressure",
      label: "Net GEX · 24h",
      value: snapshot.netGex,
      formattedValue: compactLabel(snapshot.netGex),
      accent: snapshot.netGex >= 0 ? "#31c46b" : "#e5384f",
      status: ui.gauges.regime >= 0 ? "Dealers dampen moves" : "Dealers amplify moves",
      series: trends.map((point) => ({ time: point.time, value: point.hedgingPressure })),
    },
    {
      id: "absolute_gex",
      title: "Absolute GEX",
      label: "Total magnitude · 24h",
      value: ui.absoluteGex,
      formattedValue: compactLabel(ui.absoluteGex),
      accent: "#7d20ff",
      status: "Liquidity depth",
      series: trends.map((point) => ({ time: point.time, value: point.absGex })),
    },
  ];
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

function buildUiMetricsFromRows({
  spotPrice,
  netGex,
  gammaFlip,
  callWall,
  putWall,
  maxPainStrike,
  byStrike,
  symbol = "",
  asOf = "",
}) {
  const rows = collapseStrikeRows(byStrike);
  const positiveRows = rows.filter((row) => row.gex >= 0);
  const negativeRows = rows.filter((row) => row.gex < 0);
  const positiveGex = positiveRows.reduce((sum, row) => sum + row.gex, 0);
  const negativeGex = Math.abs(negativeRows.reduce((sum, row) => sum + row.gex, 0));
  const absoluteGex = rows.reduce((sum, row) => sum + Math.abs(row.gex), 0);
  const callAbs = rows.reduce((sum, row) => sum + Math.abs(row.callGex), 0);
  const putAbs = rows.reduce((sum, row) => sum + Math.abs(row.putGex), 0);
  const aboveAbs = rows
    .filter((row) => row.strike >= spotPrice)
    .reduce((sum, row) => sum + Math.abs(row.gex), 0);
  const belowAbs = rows
    .filter((row) => row.strike < spotPrice)
    .reduce((sum, row) => sum + Math.abs(row.gex), 0);
  const positivePeak = maxBy(positiveRows, (row) => row.gex) ?? maxBy(rows, (row) => row.gex);
  const negativePeak = maxBy(negativeRows, (row) => Math.abs(row.gex)) ?? maxBy(rows, (row) => Math.abs(row.gex));
  const absolutePeak = maxBy(rows, (row) => Math.abs(row.gex));
  const positiveRanked = positiveRows.slice().sort((a, b) => b.gex - a.gex || a.strike - b.strike);
  const negativeRanked = negativeRows.slice().sort((a, b) => Math.abs(b.gex) - Math.abs(a.gex) || a.strike - b.strike);
  const absoluteRanked = rows.slice().sort((a, b) => Math.abs(b.gex) - Math.abs(a.gex) || a.strike - b.strike);
  const negative1 = negativeRanked[0] ?? negativePeak;
  const negative2 = negativeRanked.find((row) => row.strike !== negative1?.strike)
    ?? negative1;
  const volatilityPoint = negativeRanked[0] ?? negativePeak ?? absolutePeak;
  const positive1 = positiveRanked[0] ?? positivePeak;
  const positive2 = positiveRanked.find((row) => row.strike !== positive1?.strike) ?? positiveRanked[1] ?? positive1;
  const stabilityThreshold = Math.max(Math.abs(positivePeak?.gex ?? 0) * 0.25, 1);
  const stabilityCandidates = positiveRows
    .filter((row) => row.strike >= spotPrice && row.gex >= stabilityThreshold)
    .slice()
    .sort((a, b) => b.strike - a.strike || b.gex - a.gex);
  const stabilityPoint = stabilityCandidates[0]
    ?? positiveRows.filter((row) => row.strike >= spotPrice).sort((a, b) => b.strike - a.strike || b.gex - a.gex)[0]
    ?? positive1;
  const absolute1 = absoluteRanked[0] ?? absolutePeak;
  const absolute2 = absoluteRanked.find((row) => row.strike !== absolute1?.strike) ?? absoluteRanked[1] ?? absolute1;
  const vOverlapsN1 = volatilityPoint?.strike === negative1?.strike;
  const studioKeyLevels = sortMarkerLevels([
    level("negative_2", "Vol. Trigger", negative2?.strike ?? putWall, negative2?.gex ?? negativePeak?.gex ?? 0, "#ff5b6f", {
      shortLabel: "N2",
      system: "negative",
      role: "Secondary Negative Gamma Wall",
      description: "Second negative gamma wall. Below this band, dealer hedging can keep amplifying realized volatility.",
    }),
    level("max_volatility", "Max Volatility", volatilityPoint?.strike ?? gammaFlip, volatilityPoint?.gex ?? 0, "#e5384f", {
      shortLabel: vOverlapsN1 ? "N1v" : "V",
      system: "negative",
      role: "Volatility Point",
      description: "Largest negative gamma magnitude. This is the strongest volatility amplification warning level.",
    }),
    level("negative_1", "Vol. Trigger", negative1?.strike ?? putWall, negative1?.gex ?? 0, "#ff3d57", {
      shortLabel: "N1",
      system: "negative",
      role: "Primary Negative Gamma Wall",
      description: "Largest negative gamma wall by absolute exposure. Treat it as trend acceleration risk, not automatic support.",
    }),
    level("flip", "Regime Change", gammaFlip, 0, "#ff00ff", {
      shortLabel: "F",
      system: "neutral",
      role: "Gamma Flip Point",
      description: "Estimated zero net gamma boundary. Above it the market is more positive-gamma; below it negative-gamma effects dominate.",
    }),
    level("absolute_2", "Magnet", absolute2?.strike ?? maxPainStrike, Math.abs(absolute2?.gex ?? absolutePeak?.gex ?? 0), "#9b5cff", {
      shortLabel: "A2",
      system: "neutral",
      role: "Secondary Absolute Gamma Wall",
      description: "Second largest absolute gamma concentration. It extends the pinning and magnet zone.",
    }),
    level("positive_1", "Gamma Resist.", positive1?.strike ?? callWall, positive1?.gex ?? 0, "#2fcf6f", {
      shortLabel: "P1",
      system: "positive",
      role: "Primary Positive Gamma Wall",
      description: "Largest positive gamma wall. Dealer hedging can dampen upside volatility and create resistance.",
    }),
    level("absolute_1", "Magnet", absolute1?.strike ?? maxPainStrike, Math.abs(absolute1?.gex ?? 0), "#7d20ff", {
      shortLabel: "A1",
      system: "neutral",
      role: "Primary Absolute Gamma Wall",
      description: "Largest absolute gamma concentration. Price can pin or mean-revert around this magnet level.",
    }),
    level("positive_2", "Gamma Resist.", positive2?.strike ?? callWall, positive2?.gex ?? positivePeak?.gex ?? 0, "#20b963", {
      shortLabel: "P2",
      system: "positive",
      role: "Secondary Positive Gamma Wall",
      description: "Second positive gamma wall. It marks the broader volatility-dampening resistance zone.",
    }),
    level("max_stability", "Max Stability", stabilityPoint?.strike ?? maxPainStrike, stabilityPoint?.gex ?? 0, "#1fcb6a", {
      shortLabel: "S",
      system: "positive",
      role: "Stability Point",
      description: "Right-side strong positive gamma stability wall. A move into this zone can dampen volatility and favor range behavior.",
    }),
  ]);
  const markerBands = [
    markerBand("negative_dense", "N1-N2 Volatility Acceleration Band", negative1, negative2, "#ff3d57", "Negative gamma concentration band. Inside it, dealer hedging can amplify trend moves and realized volatility."),
    markerBand("absolute_dense", "A1-A2 Magnet Band", absolute1, absolute2, "#7d20ff", "Absolute gamma concentration band. It is the main pinning and magnet area around heavy option positioning."),
    markerBand("positive_dense", "P1-P2 Stability Band", positive1, positive2, "#2fcf6f", "Positive gamma concentration band. Inside it, dealer hedging can dampen volatility and favor mean reversion."),
  ].filter(Boolean);

  return {
    symbol,
    asOf,
    absoluteGex: round(absoluteGex, 2),
    positiveGex: round(positiveGex, 2),
    negativeGex: round(negativeGex, 2),
    callPutRatio: round(ratio(callAbs, putAbs), 3),
    upDownRatio: round(ratio(aboveAbs, belowAbs), 3),
    gauges: {
      regime: round(clamp(netGex / Math.max(absoluteGex, 1), -1, 1), 3),
      callPut: round(ratio(callAbs, putAbs), 3),
      upDown: round(ratio(aboveAbs, belowAbs), 3),
    },
    peaks: {
      positive: peakShape(positivePeak),
      negative: peakShape(negativePeak),
      absolute: peakShape(absolutePeak),
    },
    keyLevels: [
      level("flip", "Flip Point", gammaFlip, netGex, "#ff00ff"),
      level("max_stability", "Max Stability", stabilityPoint?.strike ?? maxPainStrike, stabilityPoint?.gex ?? 0, "#1fcb6a"),
      level("max_volatility", "Max Volatility", volatilityPoint?.strike ?? gammaFlip, volatilityPoint?.gex ?? 0, "#e5384f"),
      level("positive_peak", "Positive Peak", positivePeak?.strike ?? callWall, positivePeak?.gex ?? 0, "#31c46b"),
      level("negative_peak", "Negative Peak", negativePeak?.strike ?? putWall, negativePeak?.gex ?? 0, "#e5384f"),
      level("absolute_max", "Absolute Max", absolutePeak?.strike ?? maxPainStrike, absolutePeak?.gex ?? 0, "#7d20ff"),
    ],
    studioKeyLevels,
    markerBands,
  };
}

function collapseStrikeRows(rows) {
  const groups = new Map();

  for (const row of rows) {
    const current = groups.get(row.strike) ?? {
      expiry: "ALL",
      strike: row.strike,
      callGex: 0,
      putGex: 0,
      gex: 0,
      openInterest: 0,
      volume: 0,
      gamma: 0,
    };
    current.callGex += row.callGex;
    current.putGex += row.putGex;
    current.gex += row.gex;
    current.openInterest += row.openInterest;
    current.volume += row.volume;
    current.gamma += row.gamma;
    groups.set(row.strike, current);
  }

  return [...groups.values()]
    .sort((a, b) => a.strike - b.strike)
    .map((row) => ({
      ...row,
      callGex: round(row.callGex, 2),
      putGex: round(row.putGex, 2),
      gex: round(row.gex, 2),
      gamma: round(row.gamma, 8),
    }));
}

function ratio(positive, negative) {
  return clamp((positive - negative) / Math.max(positive + negative, 1), -1, 1);
}

function maxBy(rows, selector) {
  return rows.reduce((best, row) => (best === undefined || selector(row) > selector(best) ? row : best), undefined);
}

function peakShape(row) {
  return {
    strike: row?.strike ?? 0,
    gex: round(row?.gex ?? 0, 2),
    openInterest: round(row?.openInterest ?? 0, 2),
  };
}

function level(id, labelText, strike, value, color, metadata = {}) {
  return {
    id,
    label: labelText,
    strike: round(strike, 2),
    value: round(value, 2),
    color,
    ...metadata,
  };
}

function sortMarkerLevels(levels) {
  const systemRank = { negative: 0, neutral: 1, positive: 2 };
  return levels
    .filter((entry) => Number.isFinite(entry.strike))
    .sort((a, b) => a.strike - b.strike || (systemRank[a.system] ?? 9) - (systemRank[b.system] ?? 9) || a.id.localeCompare(b.id));
}

function markerBand(id, labelText, fromRow, toRow, color, description) {
  if (!fromRow || !toRow) return null;
  const from = Math.min(fromRow.strike, toRow.strike);
  const to = Math.max(fromRow.strike, toRow.strike);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  const halfWidth = from === to ? Math.max(Math.abs(from) * 0.005, 1) : 0;
  return {
    id,
    label: labelText,
    from: round(from - halfWidth, 2),
    to: round(to + halfWidth, 2),
    color,
    description,
  };
}

function compactLabel(value) {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${round(abs / 1_000_000, 1)}M`;
  if (abs >= 1_000) return `${sign}${round(abs / 1_000, 1)}K`;
  return `${sign}${round(abs, 1)}`;
}

function priceLabel(value) {
  return value >= 1000 ? round(value, 0).toLocaleString("en-US") : String(round(value, 3));
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
