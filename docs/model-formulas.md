# Model Formulas

## Instrument Parsing

Deribit-style names use:

```text
SYMBOL-DDMMMYY-STRIKE-C
SYMBOL-DDMMMYY-STRIKE-P
```

The parser converts those names into symbol, expiry, strike, and option type.

## Gamma

The first version uses Black-Scholes gamma:

```text
d1 = (ln(S / K) + 0.5 * sigma^2 * T) / (sigma * sqrt(T))
gamma = phi(d1) / (S * sigma * sqrt(T))
```

Where:

- `S`: spot price.
- `K`: strike.
- `sigma`: implied volatility.
- `T`: years to expiry.
- `phi`: standard normal probability density.

## Gamma Exposure

The platform estimates per-strike signed GEX as:

```text
gex = direction * gamma * S^2 * 0.01 * open_interest
```

Where:

- `direction = +1` for calls.
- `direction = -1` for puts.
- `0.01` approximates exposure for a 1% spot move.

This is a research approximation. Production versions should verify contract multipliers, venue conventions, and whether OI better represents customer or dealer positioning.

## Gamma Flip

Rows are sorted by strike. The model computes cumulative signed GEX and linearly interpolates the first zero crossing. If no crossing exists, it anchors the estimate between spot and the closest strike in the direction of net gamma pressure.

## Walls

- `callWall`: call strike with the largest open interest.
- `putWall`: put strike with the largest open interest.

## Max Pain

For each candidate settlement strike, calculate total option-holder payout:

```text
call_payout = max(settlement - strike, 0) * call_oi
put_payout = max(strike - settlement, 0) * put_oi
```

The max pain strike minimizes total payout. Ties choose the strike closest to spot.

## Signal Regime

- `positive_gamma`: net GEX is non-negative.
- `negative_gamma`: net GEX is negative.
- `breakout_risk`: negative gamma while spot is within 1% of gamma flip.
- `pin_risk`: default positive gamma state near walls.

These labels are descriptive research states, not deterministic forecasts.
