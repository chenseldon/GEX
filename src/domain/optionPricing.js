const SQRT_TWO_PI = Math.sqrt(2 * Math.PI);

export function blackScholesGamma({
  underlyingPrice,
  strike,
  timeToExpiryYears,
  riskFreeRate = 0,
  impliedVolatility,
} = {}) {
  const input = normalizePricingInput({
    underlyingPrice,
    strike,
    timeToExpiryYears,
    riskFreeRate,
    impliedVolatility,
  });
  if (!input) return null;

  const { underlying, strikePrice, time, rate, volatility } = input;
  const sqrtT = Math.sqrt(time);
  const d1 =
    (Math.log(underlying / strikePrice) + (rate + 0.5 * volatility * volatility) * time) /
    (volatility * sqrtT);
  const gamma = normalPdf(d1) / (underlying * volatility * sqrtT);
  return finitePositive(gamma) ? gamma : null;
}

export function black76Gamma({
  underlyingPrice,
  strike,
  timeToExpiryYears,
  riskFreeRate = 0,
  impliedVolatility,
} = {}) {
  const input = normalizePricingInput({
    underlyingPrice,
    strike,
    timeToExpiryYears,
    riskFreeRate,
    impliedVolatility,
  });
  if (!input) return null;

  const { underlying, strikePrice, time, rate, volatility } = input;
  const sqrtT = Math.sqrt(time);
  const d1 =
    (Math.log(underlying / strikePrice) + 0.5 * volatility * volatility * time) /
    (volatility * sqrtT);
  const discount = Math.exp(-rate * time);
  const gamma = (discount * normalPdf(d1)) / (underlying * volatility * sqrtT);
  return finitePositive(gamma) ? gamma : null;
}

export function resolveOptionGamma({
  gamma,
  greeks,
  underlyingPrice,
  strike,
  timeToExpiryYears,
  riskFreeRate = 0,
  impliedVolatility,
  model = "blackScholes",
} = {}) {
  const rawGamma = Number(gamma ?? greeks?.gamma);
  if (finitePositive(rawGamma)) {
    return rawGamma;
  }

  if (model === "black76") {
    return black76Gamma({
      underlyingPrice,
      strike,
      timeToExpiryYears,
      riskFreeRate,
      impliedVolatility,
    });
  }

  if (model === "blackScholes") {
    return blackScholesGamma({
      underlyingPrice,
      strike,
      timeToExpiryYears,
      riskFreeRate,
      impliedVolatility,
    });
  }

  return null;
}

function normalizePricingInput({
  underlyingPrice,
  strike,
  timeToExpiryYears,
  riskFreeRate,
  impliedVolatility,
}) {
  const underlying = Number(underlyingPrice);
  const strikePrice = Number(strike);
  const time = Number(timeToExpiryYears);
  const rate = Number(riskFreeRate ?? 0);
  const volatility = Number(impliedVolatility);

  if (
    !finitePositive(underlying) ||
    !finitePositive(strikePrice) ||
    !finitePositive(time) ||
    !Number.isFinite(rate) ||
    !finitePositive(volatility)
  ) {
    return null;
  }

  return { underlying, strikePrice, time, rate, volatility };
}

function normalPdf(value) {
  return Math.exp(-0.5 * value * value) / SQRT_TWO_PI;
}

function finitePositive(value) {
  return Number.isFinite(value) && value > 0;
}
