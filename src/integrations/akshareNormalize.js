const FINANCIAL_INSTRUMENT_RE = /^([A-Za-z]+)(\d{2})(\d{2})-([CP])-([0-9]+(?:\.[0-9]+)?)$/;
const COMMODITY_INSTRUMENT_RE = /^([A-Za-z]+)(\d{2})(\d{2})([CP])([0-9]+(?:\.[0-9]+)?)$/;

const FINANCIAL_ALIASES = {
  instrumentName: ["instrument", "instrumentName", "\u5408\u7ea6\u4ee3\u7801", "\u5408\u7ea6\u540d\u79f0"],
  openInterest: ["position", "openInterest", "\u6301\u4ed3\u91cf", "\u6301\u4ed3"],
  volume: ["volume", "\u6210\u4ea4\u91cf"],
  markPrice: ["lastprice", "lastPrice", "\u6700\u65b0\u4ef7", "\u73b0\u4ef7"],
  bidPrice: ["bprice", "bidPrice", "\u4e70\u4ef7", "\u4e70\u5165\u4ef7"],
  bidSize: ["bamount", "bidSize", "\u4e70\u91cf", "\u4e70\u5165\u91cf"],
  askPrice: ["sprice", "askPrice", "\u5356\u4ef7", "\u5356\u51fa\u4ef7"],
  askSize: ["samount", "askSize", "\u5356\u91cf", "\u5356\u51fa\u91cf"],
};

const GREEKS_ALIASES = {
  instrumentName: [
    "instrument",
    "instrumentName",
    "contractCode",
    "code",
    "\u4ee3\u7801",
    "\u8bc1\u5238\u4ee3\u7801",
    "\u671f\u6743\u4ee3\u7801",
    "\u5408\u7ea6\u4ee3\u7801",
    "\u5408\u7ea6\u7f16\u7801",
    "\u5408\u7ea6\u4ea4\u6613\u4ee3\u7801",
  ],
  openInterest: ["position", "openInterest", "\u6301\u4ed3\u91cf", "\u6301\u4ed3"],
  volume: ["volume", "\u6210\u4ea4\u91cf"],
  markPrice: ["lastprice", "lastPrice", "\u6700\u65b0\u4ef7", "\u73b0\u4ef7"],
  strike: ["strike", "\u884c\u6743\u4ef7", "\u6267\u884c\u4ef7"],
  optionType: ["optionType", "type", "\u8ba4\u8d2d\u8ba4\u6cbd", "\u671f\u6743\u7c7b\u578b"],
  impliedVolatility: [
    "impliedVolatility",
    "markIv",
    "iv",
    "IV",
    "\u9690\u542b\u6ce2\u52a8\u7387",
    "\u9690\u6ce2",
  ],
  delta: ["delta", "Delta", "\u5fb7\u5c14\u5854", "\u0394"],
  gamma: ["gamma", "Gamma", "\u4f3d\u9a6c", "\u03b3"],
  vega: ["vega", "Vega"],
  theta: ["theta", "Theta"],
};

const COMMODITY_ALIASES = {
  strike: ["strike", "\u884c\u6743\u4ef7", "\u6267\u884c\u4ef7"],
  callInstrumentName: [
    "callInstrumentName",
    "\u770b\u6da8\u5408\u7ea6",
    "\u770b\u6da8\u671f\u6743\u5408\u7ea6",
    "\u8ba4\u8d2d\u5408\u7ea6",
    "\u770b\u6da8\u5408\u7ea6\u540d\u79f0",
    "\u770b\u6da8\u5408\u7ea6-\u770b\u6da8\u671f\u6743\u5408\u7ea6",
  ],
  callOpenInterest: [
    "callOpenInterest",
    "\u770b\u6da8\u6301\u4ed3\u91cf",
    "\u8ba4\u8d2d\u6301\u4ed3\u91cf",
    "\u770b\u6da8\u6301\u4ed3",
    "\u770b\u6da8\u5408\u7ea6-\u6301\u4ed3\u91cf",
  ],
  callVolume: ["callVolume", "\u770b\u6da8\u6210\u4ea4\u91cf", "\u8ba4\u8d2d\u6210\u4ea4\u91cf"],
  callMarkPrice: ["callMarkPrice", "\u770b\u6da8\u6700\u65b0\u4ef7", "\u8ba4\u8d2d\u6700\u65b0\u4ef7", "\u770b\u6da8\u5408\u7ea6-\u6700\u65b0\u4ef7"],
  callBidPrice: ["callBidPrice", "\u770b\u6da8\u4e70\u4ef7", "\u8ba4\u8d2d\u4e70\u4ef7", "\u770b\u6da8\u5408\u7ea6-\u4e70\u4ef7"],
  callAskPrice: ["callAskPrice", "\u770b\u6da8\u5356\u4ef7", "\u8ba4\u8d2d\u5356\u4ef7", "\u770b\u6da8\u5408\u7ea6-\u5356\u4ef7"],
  putInstrumentName: [
    "putInstrumentName",
    "\u770b\u8dcc\u5408\u7ea6",
    "\u770b\u8dcc\u671f\u6743\u5408\u7ea6",
    "\u8ba4\u6cbd\u5408\u7ea6",
    "\u770b\u8dcc\u5408\u7ea6\u540d\u79f0",
    "\u770b\u8dcc\u5408\u7ea6-\u770b\u8dcc\u671f\u6743\u5408\u7ea6",
  ],
  putOpenInterest: [
    "putOpenInterest",
    "\u770b\u8dcc\u6301\u4ed3\u91cf",
    "\u8ba4\u6cbd\u6301\u4ed3\u91cf",
    "\u770b\u8dcc\u6301\u4ed3",
    "\u770b\u8dcc\u5408\u7ea6-\u6301\u4ed3\u91cf",
  ],
  putVolume: ["putVolume", "\u770b\u8dcc\u6210\u4ea4\u91cf", "\u8ba4\u6cbd\u6210\u4ea4\u91cf"],
  putMarkPrice: ["putMarkPrice", "\u770b\u8dcc\u6700\u65b0\u4ef7", "\u8ba4\u6cbd\u6700\u65b0\u4ef7", "\u770b\u8dcc\u5408\u7ea6-\u6700\u65b0\u4ef7"],
  putBidPrice: ["putBidPrice", "\u770b\u8dcc\u4e70\u4ef7", "\u8ba4\u6cbd\u4e70\u4ef7", "\u770b\u8dcc\u5408\u7ea6-\u4e70\u4ef7"],
  putAskPrice: ["putAskPrice", "\u770b\u8dcc\u5356\u4ef7", "\u8ba4\u6cbd\u5356\u4ef7", "\u770b\u8dcc\u5408\u7ea6-\u5356\u4ef7"],
};

export function normalizeAkshareFinancialOptions(rows, metadata = {}) {
  return normalizeRows(rows, metadata, normalizeFinancialRow);
}

export function normalizeAkshareGreeksRows(rows, metadata = {}) {
  return normalizeRows(rows, metadata, normalizeGreeksRow);
}

export function normalizeAkshareCommodityOptionTable(rows, metadata = {}) {
  return normalizeRows(rows, metadata, normalizeCommodityRow);
}

export function parseAkshareInstrumentName(instrumentName, { expiry } = {}) {
  const text = String(instrumentName ?? "").trim();
  const financial = FINANCIAL_INSTRUMENT_RE.exec(text);
  if (financial) {
    const [, underlying, yy, mm, typeText, strikeText] = financial;
    return {
      underlying,
      expiry: expiry ?? null,
      expiryMonth: `20${yy}-${mm}`,
      strike: Number(strikeText),
      optionType: typeText === "C" ? "call" : "put",
    };
  }

  const commodity = COMMODITY_INSTRUMENT_RE.exec(text);
  if (commodity) {
    const [, underlying, yy, mm, typeText, strikeText] = commodity;
    return {
      underlying,
      expiry: expiry ?? null,
      expiryMonth: `20${yy}-${mm}`,
      strike: Number(strikeText),
      optionType: typeText === "C" ? "call" : "put",
    };
  }

  return null;
}

function normalizeRows(rows, metadata, normalizer) {
  if (!Array.isArray(rows)) {
    throw new Error("rows must be an array");
  }

  const report = emptyReport();
  for (const row of rows) {
    const entries = normalizer(row, metadata);
    for (const entry of entries) {
      addCandidate(entry, metadata, report);
    }
  }

  return report;
}

function normalizeFinancialRow(row, metadata) {
  const instrumentName = textValue(pick(row, FINANCIAL_ALIASES.instrumentName));
  if (!instrumentName) {
    return [skipCandidate(row, "missing instrument")];
  }

  const parsed = parseAkshareInstrumentName(instrumentName, {
    expiry: resolveOverride(metadata, "expiry", { row, instrumentName }),
  });
  if (!parsed) {
    return [skipCandidate(row, "unsupported instrument format", { instrumentName })];
  }

  return [
    {
      raw: row,
      symbol: resolveSymbol(metadata, parsed),
      venue:
        resolveOverride(metadata, "venue", { row, instrumentName, parsed }) ?? "CFFEX",
      region:
        resolveOverride(metadata, "region", { row, instrumentName, parsed }) ?? "CN",
      underlying:
        resolveOverride(metadata, "underlying", { row, instrumentName, parsed }) ??
        parsed.underlying,
      instrumentName,
      expiry: parsed.expiry,
      strike: parsed.strike,
      optionType: parsed.optionType,
      openInterest: numberValue(pick(row, FINANCIAL_ALIASES.openInterest)),
      volume: numberValue(pick(row, FINANCIAL_ALIASES.volume)),
      markPrice: numberValue(pick(row, FINANCIAL_ALIASES.markPrice)),
      bidPrice: numberValue(pick(row, FINANCIAL_ALIASES.bidPrice)),
      bidSize: numberValue(pick(row, FINANCIAL_ALIASES.bidSize)),
      askPrice: numberValue(pick(row, FINANCIAL_ALIASES.askPrice)),
      askSize: numberValue(pick(row, FINANCIAL_ALIASES.askSize)),
    },
  ];
}

function normalizeGreeksRow(row, metadata) {
  const instrumentName = textValue(pick(row, GREEKS_ALIASES.instrumentName));
  if (!instrumentName) {
    return [skipCandidate(row, "missing instrument")];
  }

  const parsed = parseAkshareInstrumentName(instrumentName, {
    expiry: resolveOverride(metadata, "expiry", { row, instrumentName }),
  });
  const strike = numberValue(pick(row, GREEKS_ALIASES.strike)) ?? parsed?.strike;
  const optionType = normalizeOptionType(
    pick(row, GREEKS_ALIASES.optionType) ?? parsed?.optionType,
    instrumentName,
  );
  const underlying =
    resolveOverride(metadata, "underlying", { row, instrumentName, parsed }) ??
    parsed?.underlying;

  return [
    {
      raw: row,
      symbol: resolveSymbol(metadata, parsed ?? { underlying }),
      venue:
        resolveOverride(metadata, "venue", { row, instrumentName, parsed }) ?? "UNKNOWN",
      region:
        resolveOverride(metadata, "region", { row, instrumentName, parsed }) ?? "CN",
      underlying,
      instrumentName,
      expiry: parsed?.expiry ?? resolveOverride(metadata, "expiry", { row, instrumentName, parsed }),
      strike,
      optionType,
      openInterest: numberValue(pick(row, GREEKS_ALIASES.openInterest)),
      volume: numberValue(pick(row, GREEKS_ALIASES.volume)),
      markPrice: numberValue(pick(row, GREEKS_ALIASES.markPrice)),
      impliedVolatility: numberValue(pick(row, GREEKS_ALIASES.impliedVolatility)),
      gamma: numberValue(pick(row, GREEKS_ALIASES.gamma)),
      greeks: compactGreeks({
        delta: numberValue(pick(row, GREEKS_ALIASES.delta)),
        gamma: numberValue(pick(row, GREEKS_ALIASES.gamma)),
        vega: numberValue(pick(row, GREEKS_ALIASES.vega)),
        theta: numberValue(pick(row, GREEKS_ALIASES.theta)),
      }),
    },
  ];
}

function normalizeCommodityRow(row, metadata) {
  const strike = numberValue(pick(row, COMMODITY_ALIASES.strike));
  const candidates = [];
  candidates.push(
    buildCommodityCandidate(row, metadata, {
      instrumentName: textValue(pick(row, COMMODITY_ALIASES.callInstrumentName)),
      optionType: "call",
      strike,
      openInterest: numberValue(pick(row, COMMODITY_ALIASES.callOpenInterest)),
      volume: numberValue(pick(row, COMMODITY_ALIASES.callVolume)),
      markPrice: numberValue(pick(row, COMMODITY_ALIASES.callMarkPrice)),
      bidPrice: numberValue(pick(row, COMMODITY_ALIASES.callBidPrice)),
      askPrice: numberValue(pick(row, COMMODITY_ALIASES.callAskPrice)),
    }),
  );
  candidates.push(
    buildCommodityCandidate(row, metadata, {
      instrumentName: textValue(pick(row, COMMODITY_ALIASES.putInstrumentName)),
      optionType: "put",
      strike,
      openInterest: numberValue(pick(row, COMMODITY_ALIASES.putOpenInterest)),
      volume: numberValue(pick(row, COMMODITY_ALIASES.putVolume)),
      markPrice: numberValue(pick(row, COMMODITY_ALIASES.putMarkPrice)),
      bidPrice: numberValue(pick(row, COMMODITY_ALIASES.putBidPrice)),
      askPrice: numberValue(pick(row, COMMODITY_ALIASES.putAskPrice)),
    }),
  );

  return candidates.filter(Boolean);
}

function buildCommodityCandidate(row, metadata, candidate) {
  if (!candidate.instrumentName) {
    return null;
  }

  const parsed = parseAkshareInstrumentName(candidate.instrumentName, {
    expiry: resolveOverride(metadata, "expiry", {
      row,
      instrumentName: candidate.instrumentName,
    }),
  });
  if (!parsed) {
    return skipCandidate(row, "unsupported instrument format", {
      instrumentName: candidate.instrumentName,
    });
  }

  return {
    raw: row,
    symbol: resolveSymbol(metadata, parsed),
    venue:
      resolveOverride(metadata, "venue", {
        row,
        instrumentName: candidate.instrumentName,
        parsed,
      }) ?? "UNKNOWN",
    region:
      resolveOverride(metadata, "region", {
        row,
        instrumentName: candidate.instrumentName,
        parsed,
      }) ?? "CN",
    underlying:
      resolveOverride(metadata, "underlying", {
        row,
        instrumentName: candidate.instrumentName,
        parsed,
      }) ?? parsed.underlying,
    instrumentName: candidate.instrumentName,
    expiry: parsed.expiry,
    strike: positiveNumber(candidate.strike) ?? parsed.strike,
    optionType: candidate.optionType ?? parsed.optionType,
    openInterest: candidate.openInterest,
    volume: candidate.volume,
    markPrice: candidate.markPrice,
    bidPrice: candidate.bidPrice,
    askPrice: candidate.askPrice,
  };
}

function addCandidate(candidate, metadata, report) {
  if (candidate.skip) {
    report.warnings.skippedContracts += 1;
    report.skippedRows.push(candidate);
    return;
  }

  const context = {
    row: candidate.raw,
    instrumentName: candidate.instrumentName,
    parsed: candidate,
  };
  const impliedVolatility = numberValue(
    resolveOverride(metadata, "impliedVolatility", context) ?? candidate.impliedVolatility,
  );
  const gamma = numberValue(resolveOverride(metadata, "gamma", context) ?? candidate.gamma);
  const contractMultiplier = numberValue(
    resolveOverride(metadata, "contractMultiplier", context) ?? candidate.contractMultiplier,
  );
  const underlyingPrice = numberValue(
    resolveOverride(metadata, "underlyingPrice", context) ?? candidate.underlyingPrice,
  );
  const riskFreeRate = numberValue(resolveOverride(metadata, "riskFreeRate", context) ?? candidate.riskFreeRate);
  const model = resolveOverride(metadata, "model", context) ?? defaultModel(candidate.venue);
  const sourceName = resolveOverride(metadata, "sourceName", context) ?? "AKShare";
  const asOf = resolveOverride(metadata, "asOf", context) ?? new Date(0).toISOString();
  const reasons = [];

  if (!Number.isFinite(candidate.openInterest) || candidate.openInterest < 0) {
    report.warnings.missingOi += 1;
    reasons.push("missing open interest");
  }
  if (!positiveNumber(contractMultiplier)) {
    report.warnings.missingMultiplier += 1;
    reasons.push("missing contract multiplier");
  }
  if (!positiveNumber(underlyingPrice)) {
    report.warnings.missingUnderlyingPrice += 1;
    reasons.push("missing underlying price");
  }
  if (!positiveNumber(impliedVolatility)) {
    report.warnings.missingIv += 1;
    if (!positiveNumber(gamma)) {
      reasons.push("missing implied volatility or gamma");
    }
  }
  if (!positiveNumber(candidate.strike)) {
    reasons.push("missing strike");
  }
  if (!["call", "put"].includes(candidate.optionType)) {
    reasons.push("missing option type");
  }
  if (!candidate.expiry) {
    reasons.push("missing expiry");
  }

  if (reasons.length > 0) {
    report.warnings.skippedContracts += 1;
    report.skippedRows.push(
      skipCandidate(candidate.raw, reasons.join("; "), {
        instrumentName: candidate.instrumentName,
      }),
    );
    return;
  }

  const contract = {
    symbol: candidate.symbol,
    venue: candidate.venue,
    region: candidate.region,
    underlying: candidate.underlying,
    instrumentName: candidate.instrumentName,
    expiry: candidate.expiry,
    strike: candidate.strike,
    optionType: candidate.optionType,
    openInterest: candidate.openInterest,
    impliedVolatility: positiveNumber(impliedVolatility) ?? null,
    gamma: positiveNumber(gamma) ?? undefined,
    contractMultiplier,
    underlyingPrice,
    asOf,
    sourceName,
    model,
    riskFreeRate: Number.isFinite(riskFreeRate) ? riskFreeRate : 0,
    volume: Number.isFinite(candidate.volume) ? candidate.volume : 0,
    markPrice: Number.isFinite(candidate.markPrice) ? candidate.markPrice : undefined,
    bidPrice: Number.isFinite(candidate.bidPrice) ? candidate.bidPrice : undefined,
    bidSize: Number.isFinite(candidate.bidSize) ? candidate.bidSize : undefined,
    askPrice: Number.isFinite(candidate.askPrice) ? candidate.askPrice : undefined,
    askSize: Number.isFinite(candidate.askSize) ? candidate.askSize : undefined,
  };
  if (candidate.greeks && Object.keys(candidate.greeks).length > 0) {
    contract.greeks = candidate.greeks;
  }
  report.contracts.push(contract);
}

function emptyReport() {
  return {
    contracts: [],
    skippedRows: [],
    warnings: {
      missingIv: 0,
      missingOi: 0,
      missingMultiplier: 0,
      missingUnderlyingPrice: 0,
      skippedContracts: 0,
    },
  };
}

function skipCandidate(row, reason, extra = {}) {
  return {
    skip: true,
    reason,
    row,
    ...extra,
  };
}

function resolveSymbol(metadata, parsed) {
  const symbol = resolveOverride(metadata, "symbol", { parsed });
  if (symbol) return symbol;
  const region = resolveOverride(metadata, "region", { parsed }) ?? "CN";
  const venue = resolveOverride(metadata, "venue", { parsed });
  const underlying = parsed?.underlying ?? resolveOverride(metadata, "underlying", { parsed }) ?? "UNKNOWN";
  return venue ? `${region}.${venue}.${underlying}` : `${region}.${underlying}`;
}

function resolveOverride(metadata, key, context) {
  const value = metadata?.[key];
  if (typeof value === "function") {
    return value(context);
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value[context.instrumentName] ?? value[context.parsed?.underlying] ?? value.default;
  }
  return value;
}

function defaultModel(venue) {
  return ["SHFE", "DCE", "CZCE", "INE", "GFEX"].includes(venue)
    ? "black76"
    : "blackScholes";
}

function pick(row, aliases) {
  for (const alias of aliases) {
    if (Object.hasOwn(row, alias)) return row[alias];
  }
  return undefined;
}

function textValue(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function numberValue(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value === undefined || value === null || value === "") return null;
  const normalized = String(value).replace(/,/g, "").replace(/%$/, "").trim();
  const number = Number(normalized);
  if (!Number.isFinite(number)) return null;
  return String(value).trim().endsWith("%") ? number / 100 : number;
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizeOptionType(value, instrumentName) {
  const text = String(value ?? "").trim().toLowerCase();
  if (["call", "c", "\u8ba4\u8d2d", "\u770b\u6da8"].includes(text)) return "call";
  if (["put", "p", "\u8ba4\u6cbd", "\u770b\u8dcc"].includes(text)) return "put";
  if (/[cp]/i.test(String(instrumentName))) {
    const match = /(?:^|[^a-z])([CP])(?:\d|M|-)/i.exec(String(instrumentName));
    if (match) return match[1].toUpperCase() === "C" ? "call" : "put";
  }
  return null;
}

function compactGreeks(values) {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => Number.isFinite(value)),
  );
}
