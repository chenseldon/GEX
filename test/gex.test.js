import assert from "node:assert/strict";
import test from "node:test";

import {
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
