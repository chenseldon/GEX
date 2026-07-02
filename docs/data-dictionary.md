# Data Dictionary

## Instrument

- `symbol`: tradable underlying, one of `BTC`, `ETH`, `SOL`, `XRP`.
- `name`: display name.
- `venue`: source or fixture descriptor.
- `spotPrice`: underlying spot price used for calculations.

## OptionContract

- `instrumentName`: Deribit-style contract name, for example `BTC-26JUL24-60000-C`.
- `underlyingPrice`: spot price observed with the option chain.
- `strike`: option strike.
- `expiry`: ISO date.
- `optionType`: `call` or `put`.
- `impliedVolatility`: decimal volatility, for example `0.64`.
- `openInterest`: contract open interest.
- `volume`: contract volume.
- `markPrice`: option mark price.

## GexByStrike

- `expiry`: expiry bucket.
- `strike`: strike bucket.
- `callGex`: positive call-side gamma exposure estimate.
- `putGex`: negative put-side gamma exposure estimate.
- `gex`: signed net gamma exposure.
- `openInterest`: total OI at the row.
- `volume`: total volume at the row.
- `gamma`: Black-Scholes gamma estimate.

## GexByExpiry

- `expiry`: expiry bucket.
- `gex`: signed net GEX for the expiry.
- `openInterest`: total OI for the expiry.
- `volume`: total volume for the expiry.

## GexSnapshot

- `symbol`: underlying symbol.
- `spotPrice`: spot used for the snapshot.
- `asOf`: snapshot timestamp.
- `netGex`: sum of signed GEX rows.
- `netDelta`: approximate signed delta exposure from OI.
- `totalOpenInterest`: total OI in contracts.
- `gammaFlip`: estimated level where cumulative signed gamma changes sign.
- `callWall`: call strike with largest OI.
- `putWall`: put strike with largest OI.
- `maxPainStrike`: settlement strike minimizing option-holder payout.
- `signalState`: regime classification object.

## SignalState

- `regime`: `positive_gamma` or `negative_gamma`.
- `primaryRisk`: `pin_risk`, `breakout_risk`, `directional_acceleration`, `flip_zone`, or `wall_break`.
- `flipDistancePct`: distance from spot to gamma flip.
- `nearestWall`: closest wall level by absolute distance.
