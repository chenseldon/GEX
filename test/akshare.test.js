import assert from "node:assert/strict";
import test from "node:test";

import { calculateGexSnapshot } from "../src/domain/gex.js";
import {
  normalizeAkshareCommodityOptionTable,
  normalizeAkshareFinancialOptions,
  parseAkshareInstrumentName,
} from "../src/integrations/akshareNormalize.js";

const AS_OF = "2026-07-08T01:00:00.000Z";
const STRIKE = "\u884c\u6743\u4ef7";
const CALL_NAME = "\u770b\u6da8\u5408\u7ea6-\u770b\u6da8\u671f\u6743\u5408\u7ea6";
const CALL_OI = "\u770b\u6da8\u5408\u7ea6-\u6301\u4ed3\u91cf";
const CALL_LAST = "\u770b\u6da8\u5408\u7ea6-\u6700\u65b0\u4ef7";
const CALL_BID = "\u770b\u6da8\u5408\u7ea6-\u4e70\u4ef7";
const CALL_ASK = "\u770b\u6da8\u5408\u7ea6-\u5356\u4ef7";
const PUT_NAME = "\u770b\u8dcc\u5408\u7ea6-\u770b\u8dcc\u671f\u6743\u5408\u7ea6";
const PUT_OI = "\u770b\u8dcc\u5408\u7ea6-\u6301\u4ed3\u91cf";
const PUT_LAST = "\u770b\u8dcc\u5408\u7ea6-\u6700\u65b0\u4ef7";
const PUT_BID = "\u770b\u8dcc\u5408\u7ea6-\u4e70\u4ef7";
const PUT_ASK = "\u770b\u8dcc\u5408\u7ea6-\u5356\u4ef7";

test("financial option row normalizes to common contract shape", () => {
  const result = normalizeAkshareFinancialOptions(
    [
      {
        instrument: "IO2607-C-4200",
        position: "1,250",
        volume: 320,
        lastprice: 88.6,
        updown: 1.2,
        bprice: 88,
        bamount: 20,
        sprice: 89,
        samount: 25,
      },
    ],
    {
      symbol: "CN.CFFEX.IO",
      venue: "CFFEX",
      expiry: "2026-07-17",
      underlyingPrice: 4210,
      impliedVolatility: 0.21,
      contractMultiplier: 100,
      asOf: AS_OF,
    },
  );

  assert.equal(result.skippedRows.length, 0);
  assert.deepEqual(result.warnings, {
    missingIv: 0,
    missingOi: 0,
    missingMultiplier: 0,
    missingUnderlyingPrice: 0,
    skippedContracts: 0,
  });
  assert.deepEqual(result.contracts[0], {
    symbol: "CN.CFFEX.IO",
    venue: "CFFEX",
    region: "CN",
    underlying: "IO",
    instrumentName: "IO2607-C-4200",
    expiry: "2026-07-17",
    strike: 4200,
    optionType: "call",
    openInterest: 1250,
    impliedVolatility: 0.21,
    gamma: undefined,
    contractMultiplier: 100,
    underlyingPrice: 4210,
    asOf: AS_OF,
    sourceName: "AKShare",
    model: "blackScholes",
    riskFreeRate: 0,
    volume: 320,
    markPrice: 88.6,
    bidPrice: 88,
    bidSize: 20,
    askPrice: 89,
    askSize: 25,
  });
});

test("commodity T-row expands real AKShare Chinese columns to call and put contracts", () => {
  const result = normalizeAkshareCommodityOptionTable(
    [
      {
        [STRIKE]: 1000,
        [CALL_NAME]: "au2608C1000",
        [CALL_OI]: 310,
        [CALL_LAST]: 12.5,
        [CALL_BID]: 12.2,
        [CALL_ASK]: 12.8,
        [PUT_NAME]: "au2608P1000",
        [PUT_OI]: 280,
        [PUT_LAST]: 10.2,
        [PUT_BID]: 10,
        [PUT_ASK]: 10.4,
      },
    ],
    {
      symbol: "CN.SHFE.au",
      venue: "SHFE",
      expiry: "2026-08-25",
      underlyingPrice: 998,
      impliedVolatility: { au: 0.18 },
      contractMultiplier: { au: 1000 },
      riskFreeRate: 0.015,
      asOf: AS_OF,
    },
  );

  assert.equal(result.contracts.length, 2);
  assert.equal(result.skippedRows.length, 0);
  assert.equal(result.contracts[0].instrumentName, "au2608C1000");
  assert.equal(result.contracts[0].optionType, "call");
  assert.equal(result.contracts[0].expiry, "2026-08-25");
  assert.equal(result.contracts[0].model, "black76");
  assert.equal(result.contracts[0].markPrice, 12.5);
  assert.equal(result.contracts[1].instrumentName, "au2608P1000");
  assert.equal(result.contracts[1].optionType, "put");
  assert.equal(result.contracts[1].openInterest, 280);
  assert.equal(result.contracts[1].bidPrice, 10);
});

test("missing OI IV multiplier underlying price and expiry rows are skipped with warnings", () => {
  const result = normalizeAkshareFinancialOptions(
    [{ instrument: "IO2607-P-4200", position: "", volume: 20 }],
    { symbol: "CN.CFFEX.IO", venue: "CFFEX", asOf: AS_OF },
  );

  assert.equal(result.contracts.length, 0);
  assert.equal(result.skippedRows.length, 1);
  assert.equal(result.warnings.missingOi, 1);
  assert.equal(result.warnings.missingIv, 1);
  assert.equal(result.warnings.missingMultiplier, 1);
  assert.equal(result.warnings.missingUnderlyingPrice, 1);
  assert.equal(result.warnings.skippedContracts, 1);
  assert.match(result.skippedRows[0].reason, /missing open interest/);
  assert.match(result.skippedRows[0].reason, /missing implied volatility or gamma/);
  assert.match(result.skippedRows[0].reason, /missing expiry/);
});

test("valid raw gamma path is accepted without synthetic IV", () => {
  const result = normalizeAkshareFinancialOptions(
    [{ instrument: "IO2607-P-4200", position: 120 }],
    {
      symbol: "CN.CFFEX.IO",
      venue: "CFFEX",
      expiry: "2026-07-17",
      underlyingPrice: 4210,
      gamma: 0.0008,
      contractMultiplier: 100,
      asOf: AS_OF,
    },
  );

  assert.equal(result.contracts.length, 1);
  assert.equal(result.warnings.missingIv, 1);
  assert.equal(result.warnings.skippedContracts, 0);
  assert.equal(result.contracts[0].impliedVolatility, null);
  assert.equal(result.contracts[0].gamma, 0.0008);
});

test("metadata IV path produces contracts accepted by GEX snapshot", () => {
  const result = normalizeAkshareCommodityOptionTable(
    [
      {
        strike: 1000,
        callInstrumentName: "au2608C1000",
        callOpenInterest: 310,
        putInstrumentName: "au2608P1000",
        putOpenInterest: 280,
      },
    ],
    {
      symbol: "CN.SHFE.au",
      venue: "SHFE",
      expiry: "2026-08-25",
      underlyingPrice: 998,
      impliedVolatility: 0.18,
      contractMultiplier: 1000,
      asOf: AS_OF,
    },
  );
  const snapshot = calculateGexSnapshot({
    symbol: "CN.SHFE.au",
    spotPrice: 998,
    asOf: AS_OF,
    contracts: result.contracts,
  });

  assert.equal(result.skippedRows.length, 0);
  assert.equal(snapshot.symbol, "CN.SHFE.au");
  assert.equal(snapshot.byStrike.length, 1);
  assert.equal(Number.isFinite(snapshot.netGex), true);
});

test("AKShare instrument parser requires explicit expiry for precise GEX inputs", () => {
  assert.deepEqual(parseAkshareInstrumentName("IO2607-C-4200"), {
    underlying: "IO",
    expiry: null,
    expiryMonth: "2026-07",
    strike: 4200,
    optionType: "call",
  });
  assert.deepEqual(parseAkshareInstrumentName("au2608P1000", { expiry: "2026-08-25" }), {
    underlying: "au",
    expiry: "2026-08-25",
    expiryMonth: "2026-08",
    strike: 1000,
    optionType: "put",
  });
});
