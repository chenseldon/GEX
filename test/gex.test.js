import assert from "node:assert/strict";
import test from "node:test";

import {
  buildChangeTable,
  buildHeatmapMatrix,
  buildTrendSeries,
  buildUiMetrics,
  calculateGexSnapshot,
  classifySignalState,
  parseDeribitInstrumentName,
} from "../src/domain/gex.js";

const contracts = [
  {
    instrumentName: "BTC-26JUL24-60000-C",
    underlyingPrice: 61200,
    strike: 60000,
    expiry: "2024-07-26",
    optionType: "call",
    impliedVolatility: 0.58,
    openInterest: 820,
    volume: 315,
    markPrice: 0.068,
  },
  {
    instrumentName: "BTC-26JUL24-62000-C",
    underlyingPrice: 61200,
    strike: 62000,
    expiry: "2024-07-26",
    optionType: "call",
    impliedVolatility: 0.61,
    openInterest: 1220,
    volume: 440,
    markPrice: 0.043,
  },
  {
    instrumentName: "BTC-26JUL24-59000-P",
    underlyingPrice: 61200,
    strike: 59000,
    expiry: "2024-07-26",
    optionType: "put",
    impliedVolatility: 0.64,
    openInterest: 4200,
    volume: 390,
    markPrice: 0.039,
  },
  {
    instrumentName: "BTC-30AUG24-65000-C",
    underlyingPrice: 61200,
    strike: 65000,
    expiry: "2024-08-30",
    optionType: "call",
    impliedVolatility: 0.66,
    openInterest: 640,
    volume: 151,
    markPrice: 0.051,
  },
];

test("parseDeribitInstrumentName reads symbol, expiry, strike, and option type", () => {
  assert.deepEqual(parseDeribitInstrumentName("ETH-27SEP24-3500-P"), {
    symbol: "ETH",
    expiry: "2024-09-27",
    strike: 3500,
    optionType: "put",
  });
});

test("calculateGexSnapshot aggregates strike, expiry, net gex, walls, and flip level", () => {
  const snapshot = calculateGexSnapshot({
    symbol: "BTC",
    spotPrice: 61200,
    asOf: "2024-07-01T12:00:00.000Z",
    contracts,
  });

  assert.equal(snapshot.symbol, "BTC");
  assert.equal(snapshot.byStrike.length, 4);
  assert.equal(snapshot.byExpiry.length, 2);
  assert.equal(snapshot.callWall, 62000);
  assert.equal(snapshot.putWall, 59000);
  assert.equal(snapshot.totalOpenInterest, 6880);
  assert.equal(snapshot.maxPainStrike, 60000);
  assert.ok(snapshot.netGex < 0, "put-heavy fixture should produce negative net GEX");
  assert.ok(snapshot.gammaFlip > 59000);
  assert.ok(snapshot.gammaFlip < 62000);
});

test("classifySignalState flags negative gamma and breakout risk", () => {
  const state = classifySignalState({
    spotPrice: 61200,
    netGex: -1275000,
    gammaFlip: 60750,
    callWall: 62000,
    putWall: 59000,
  });

  assert.equal(state.regime, "negative_gamma");
  assert.equal(state.primaryRisk, "breakout_risk");
  assert.equal(state.flipDistancePct < 1, true);
});

test("buildUiMetrics returns bounded gauges and all V2 key levels", () => {
  const snapshot = calculateGexSnapshot({
    symbol: "BTC",
    spotPrice: 61200,
    asOf: "2024-07-01T12:00:00.000Z",
    contracts,
  });

  const metrics = buildUiMetrics(snapshot);

  assert.equal(
    Object.values(metrics.gauges).every((value) => value >= -1 && value <= 1),
    true,
  );
  assert.deepEqual(
    metrics.keyLevels.map((level) => level.id),
    ["flip", "max_stability", "max_volatility", "positive_peak", "negative_peak", "absolute_max"],
  );
  assert.deepEqual(
    metrics.studioKeyLevels.map((level) => level.id),
    [
      "negative_2",
      "max_volatility",
      "negative_1",
      "flip",
      "absolute_2",
      "positive_1",
      "absolute_1",
      "positive_2",
      "max_stability",
    ],
  );
  assert.equal(typeof metrics.absoluteGex, "number");
  assert.equal(typeof metrics.peaks.positive.strike, "number");
  assert.equal(typeof metrics.peaks.negative.strike, "number");
});

test("buildChangeTable expands rows as coverage increases", () => {
  const snapshot = calculateGexSnapshot({
    symbol: "BTC",
    spotPrice: 61200,
    asOf: "2024-07-01T12:00:00.000Z",
    contracts,
  });

  const topHalf = buildChangeTable(snapshot, { coverage: 50 });
  const allRows = buildChangeTable(snapshot, { coverage: 100 });

  assert.equal(topHalf.columns.length > 0, true);
  assert.equal(topHalf.periods.includes("24h"), true);
  assert.equal(allRows.rows.length > topHalf.rows.length, true);
});

test("buildTrendSeries and buildHeatmapMatrix are deterministic and non-empty", () => {
  const snapshot = calculateGexSnapshot({
    symbol: "BTC",
    spotPrice: 61200,
    asOf: "2024-07-01T12:00:00.000Z",
    contracts,
  });

  const trends = buildTrendSeries(snapshot);
  const netHeatmap = buildHeatmapMatrix(snapshot, { type: "net" });
  const absHeatmap = buildHeatmapMatrix(snapshot, { type: "abs" });

  assert.equal(trends.points.length, 24);
  assert.equal(trends.points[0].time, "13:00");
  assert.equal(trends.points.at(-1).time, "12:00");
  assert.equal(netHeatmap.rows.length > 0, true);
  assert.equal(absHeatmap.rows.length, netHeatmap.rows.length);
  assert.deepEqual(buildTrendSeries(snapshot), trends);
  assert.deepEqual(buildHeatmapMatrix(snapshot, { type: "net" }), netHeatmap);
});
