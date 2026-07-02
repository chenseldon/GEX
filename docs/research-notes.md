# Research Notes

## Product References

- GammaFlip public site: https://gammaflip.io/
- GammaFlip app URL supplied by user: https://gammaflip.io/app
- GammaFlip docs quickstart: https://docs.gammaflip.io/quickstart
- GammaFlip API index for LLMs: https://docs.gammaflip.io/llms.txt

Observed public feature set includes crypto GEX dashboards, GEX+, net delta, OI, skew, term structure, and key marker concepts such as pin, wall, and flip regions.

## Academic Starting Points

- Option Market Making with Hedging-Induced Market Impact: https://arxiv.org/abs/2511.22766
- Beta-Dependent Gamma Feedback: https://arxiv.org/abs/2511.02518
- Demand-Based Option Pricing, Garleanu, Pedersen, and Poteshman, Review of Financial Studies.
- Stock Price Clustering on Option Expiration Dates, Ni, Pearson, and Poteshman.

## Research Questions

- Does crypto options GEX have stronger intraday relevance around large expiries?
- Are gamma flip levels stable enough to support event playback studies?
- Does negative GEX coincide with higher realized volatility after controlling for funding, perp open interest, and macro events?
- How often do call walls and put walls behave as resistance/support versus simple OI clusters?

## Next Validation Work

- Replace static fixtures with live option-chain snapshots.
- Persist raw option chains before calculating aggregates.
- Compare the platform output against GammaFlip API or screenshots where licensing permits.
- Backtest signal labels against spot path and realized volatility.
