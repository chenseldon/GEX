import assert from "node:assert/strict";
import test from "node:test";

import { calculateGexSnapshot } from "../src/domain/gex.js";
import {
  normalizeAkshareGreeksRows,
  normalizeAkshareCommodityOptionTable,
  normalizeAkshareFinancialOptions,
  parseAkshareInstrumentName,
} from "../src/integrations/akshareNormalize.js";
import { buildTradFiSnapshotFromAkshareReport } from "../src/data/akshareCollector.js";

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

test("Eastmoney risk rows with raw gamma normalize directly into TradFi contracts", () => {
  const result = normalizeAkshareGreeksRows(
    [
      {
        "代码": "IO2607-C-4200",
        "名称": "沪深300股指期权",
        "持仓量": 1250,
        "最新价": 88.6,
        "隐含波动率": "21.5%",
        "Delta": 0.52,
        "Gamma": 0.0008,
        "Vega": 13.2,
        "Theta": -4.6,
      },
    ],
    {
      symbol: "CN.CFFEX.IO",
      venue: "CFFEX",
      expiry: "2026-07-17",
      underlyingPrice: 4210,
      contractMultiplier: 100,
      sourceName: "AKShare Eastmoney",
      asOf: AS_OF,
    },
  );

  assert.equal(result.skippedRows.length, 0);
  assert.equal(result.contracts.length, 1);
  assert.equal(result.contracts[0].instrumentName, "IO2607-C-4200");
  assert.equal(result.contracts[0].impliedVolatility, 0.215);
  assert.equal(result.contracts[0].gamma, 0.0008);
  assert.equal(result.contracts[0].greeks.delta, 0.52);
  assert.equal(result.contracts[0].greeks.vega, 13.2);
  assert.equal(result.contracts[0].sourceName, "AKShare Eastmoney");
});

test("SSE risk indicator rows with IV but no raw gamma are accepted for model gamma calculation", () => {
  const result = normalizeAkshareGreeksRows(
    [
      {
        "合约交易代码": "510050C2607M03000",
        "持仓量": 980,
        "行权价": 3,
        "认购认沽": "认购",
        "隐含波动率": 0.22,
      },
    ],
    {
      symbol: "CN.SSE.510050",
      venue: "SSE",
      underlying: "510050",
      expiry: "2026-07-22",
      underlyingPrice: 3.12,
      contractMultiplier: 10000,
      sourceName: "AKShare SSE",
      asOf: AS_OF,
    },
  );
  const snapshot = calculateGexSnapshot({
    symbol: "CN.SSE.510050",
    spotPrice: 3.12,
    asOf: AS_OF,
    contracts: result.contracts,
  });

  assert.equal(result.skippedRows.length, 0);
  assert.equal(result.contracts[0].gamma, undefined);
  assert.equal(result.contracts[0].model, "blackScholes");
  assert.equal(snapshot.byStrike.length, 1);
});

test("AKShare collector report normalizes raw rows into TradFi snapshot payload", () => {
  const payload = buildTradFiSnapshotFromAkshareReport({
    sourceName: "akshare",
    observedAt: AS_OF,
    requestedSymbols: ["CN.SHFE.au"],
    status: "ok",
    snapshots: [
      {
        symbol: "CN.SHFE.au",
        venue: "SHFE",
        region: "CN",
        underlying: "au",
        assetClass: "commodity_option",
        status: "ok",
        rowCount: 1,
        metadataPlaceholders: {
          expiry: "2026-08-25",
          impliedVolatility: 0.18,
          contractMultiplier: 1000,
          underlyingPrice: 998,
        },
        rawRows: [
          {
            interface: "option_commodity_contract_table_sina",
            role: "option_table",
            rows: [
              {
                [STRIKE]: 1000,
                [CALL_NAME]: "au2608C1000",
                [CALL_OI]: 310,
                [PUT_NAME]: "au2608P1000",
                [PUT_OI]: 280,
              },
            ],
          },
        ],
      },
    ],
  });

  assert.equal(payload.sourceName, "akshare");
  assert.equal(payload.snapshots[0].normalized.contracts.length, 2);
  assert.equal(payload.snapshots[0].normalized.contracts[0].symbol, "CN.SHFE.au");
  assert.equal(payload.snapshots[0].normalized.contracts[0].model, "black76");
  assert.equal(payload.snapshots[0].normalized.warnings.skippedContracts, 0);
});

test("AKShare collector report records source warnings and normalizes Greeks role rows", () => {
  const payload = buildTradFiSnapshotFromAkshareReport({
    sourceName: "akshare",
    observedAt: AS_OF,
    requestedSymbols: ["CN.CFFEX.IO"],
    status: "partial",
    warnings: ["option_current_em unavailable: proxy error"],
    snapshots: [
      {
        symbol: "CN.CFFEX.IO",
        venue: "CFFEX",
        region: "CN",
        underlying: "IO",
        assetClass: "index_option",
        status: "ok",
        rowCount: 1,
        metadataPlaceholders: {
          expiry: "2026-07-17",
          contractMultiplier: 100,
          underlyingPrice: 4210,
        },
        rawRows: [
          {
            interface: "option_risk_analysis_em",
            role: "greeks",
            rows: [
              {
                "代码": "IO2607-P-4200",
                "持仓量": 120,
                "隐含波动率": "22%",
                "Gamma": 0.0009,
              },
            ],
          },
        ],
      },
    ],
  });

  assert.deepEqual(payload.warnings, ["option_current_em unavailable: proxy error"]);
  assert.equal(payload.snapshots[0].normalized.contracts.length, 1);
  assert.equal(payload.snapshots[0].normalized.contracts[0].optionType, "put");
  assert.equal(payload.snapshots[0].normalized.contracts[0].gamma, 0.0009);
});

test("AKShare dry-run plans are preserved as TradFi source snapshots", () => {
  const payload = buildTradFiSnapshotFromAkshareReport({
    sourceName: "akshare",
    observedAt: AS_OF,
    requestedSymbols: ["CN.CFFEX.IF"],
    status: "ok",
    plans: [
      {
        symbol: "CN.CFFEX.IF",
        venue: "CFFEX",
        region: "CN",
        underlying: "IF",
        assetClass: "index_option",
        status: "planned",
        interfaces: [{ name: "option_finance_board", role: "option_board" }],
      },
    ],
  });

  assert.equal(payload.snapshots.length, 1);
  assert.equal(payload.snapshots[0].symbol, "CN.CFFEX.IF");
  assert.equal(payload.snapshots[0].normalized.contracts.length, 0);
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
