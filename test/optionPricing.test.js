import assert from "node:assert/strict";
import test from "node:test";

import { calculateGexSnapshot } from "../src/domain/gex.js";
import {
  black76Gamma,
  blackScholesGamma,
  resolveOptionGamma,
} from "../src/domain/optionPricing.js";

test("Black-76 gamma returns finite positive gamma for futures options", () => {
  const gamma = black76Gamma({
    underlyingPrice: 3650,
    strike: 3600,
    timeToExpiryYears: 30 / 365,
    riskFreeRate: 0.02,
    impliedVolatility: 0.22,
  });

  assert.equal(Number.isFinite(gamma), true);
  assert.equal(gamma > 0, true);
});

test("Black-Scholes gamma returns finite positive gamma for spot-style options", () => {
  const gamma = blackScholesGamma({
    underlyingPrice: 5.2,
    strike: 5.1,
    timeToExpiryYears: 45 / 365,
    riskFreeRate: 0.018,
    impliedVolatility: 0.28,
  });

  assert.equal(Number.isFinite(gamma), true);
  assert.equal(gamma > 0, true);
});

test("missing or invalid IV does not create synthetic gamma", () => {
  assert.equal(
    black76Gamma({
      underlyingPrice: 3650,
      strike: 3600,
      timeToExpiryYears: 30 / 365,
      impliedVolatility: null,
    }),
    null,
  );
  assert.equal(
    resolveOptionGamma({
      underlyingPrice: 3650,
      strike: 3600,
      timeToExpiryYears: 30 / 365,
      impliedVolatility: 0,
      model: "black76",
    }),
    null,
  );
});

test("raw valid gamma is reused before model calculation", () => {
  assert.equal(
    resolveOptionGamma({
      gamma: 0.0123,
      underlyingPrice: 3650,
      strike: 3600,
      timeToExpiryYears: 30 / 365,
      impliedVolatility: null,
      model: "black76",
    }),
    0.0123,
  );
});

test("contract multiplier scales GEX magnitude", () => {
  const base = calculateGexSnapshot({
    symbol: "CN.SHFE.au",
    spotPrice: 500,
    asOf: "2026-07-08T00:00:00.000Z",
    contracts: [tradFiContract({ contractMultiplier: 1 })],
  });
  const multiplied = calculateGexSnapshot({
    symbol: "CN.SHFE.au",
    spotPrice: 500,
    asOf: "2026-07-08T00:00:00.000Z",
    contracts: [tradFiContract({ contractMultiplier: 10 })],
  });

  assert.equal(multiplied.netGex, base.netGex * 10);
  assert.equal(multiplied.byStrike[0].gex, base.byStrike[0].gex * 10);
});

test("calculateGexSnapshot skips contracts without usable gamma inputs", () => {
  const snapshot = calculateGexSnapshot({
    symbol: "CN.SHFE.au",
    spotPrice: 500,
    asOf: "2026-07-08T00:00:00.000Z",
    contracts: [
      tradFiContract({ contractMultiplier: 10 }),
      {
        instrumentName: "BAD-IV",
        expiry: "2026-08-01",
        strike: 510,
        optionType: "call",
        openInterest: 100,
        impliedVolatility: null,
        underlyingPrice: 500,
        model: "black76",
        contractMultiplier: 10,
      },
    ],
  });

  assert.equal(snapshot.byStrike.length, 1);
  assert.equal(snapshot.skippedContracts.length, 1);
  assert.equal(snapshot.skippedContracts[0].instrumentName, "BAD-IV");
});

test("calculateGexSnapshot still handles legacy fixture-style contracts", () => {
  const snapshot = calculateGexSnapshot({
    symbol: "BTC",
    spotPrice: 61200,
    asOf: "2024-07-01T12:00:00.000Z",
    contracts: [
      {
        instrumentName: "BTC-26JUL24-60000-C",
        strike: 60000,
        expiry: "2024-07-26",
        optionType: "call",
        impliedVolatility: 0.58,
        openInterest: 820,
        volume: 315,
        markPrice: 0.068,
      },
      {
        instrumentName: "BTC-26JUL24-59000-P",
        strike: 59000,
        expiry: "2024-07-26",
        optionType: "put",
        impliedVolatility: 0.64,
        openInterest: 4200,
        volume: 390,
        markPrice: 0.039,
      },
    ],
  });

  assert.equal(snapshot.symbol, "BTC");
  assert.equal(snapshot.skippedContracts.length, 0);
  assert.equal(snapshot.byStrike.length, 2);
  assert.equal(Number.isFinite(snapshot.netGex), true);
});

function tradFiContract({ contractMultiplier }) {
  return {
    instrumentName: `AU-202608-500-C-${contractMultiplier}`,
    expiry: "2026-08-01",
    strike: 500,
    optionType: "call",
    openInterest: 100,
    gamma: 0.004,
    underlyingPrice: 500,
    timeToExpiryYears: 24 / 365,
    riskFreeRate: 0.02,
    model: "black76",
    contractMultiplier,
  };
}
