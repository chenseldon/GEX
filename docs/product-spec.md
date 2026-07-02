# Product Spec

## Goal

Build a crypto options research platform focused on dealer gamma exposure, key strike levels, and regime interpretation. The first market scope is BTC, ETH, SOL, and XRP.

## Primary User

An options or volatility researcher who wants a fast view of where gamma, open interest, and dealer hedging pressure may cluster across strikes and expiries.

## Current Version

The current implementation is a local first version:

- Static Deribit-style fixtures instead of live data.
- Tested Node.js model and API.
- Code-native browser dashboard.
- No login, subscriptions, trading, or alerts.

## Core Screens

- Dashboard: selected symbol, expiry filter, key metrics, GEX by strike, signal regime.
- Strikes: signed GEX, call GEX, put GEX, open interest, volume by strike and expiry.
- Term Structure: aggregate GEX by expiry.
- Signals: positive gamma, negative gamma, flip zone, pin risk, breakout risk.
- Research Notes: lightweight local notes placeholder for future persistence.
- Data Health: source status, freshness, coverage, limitations.

## Non-goals

- No trade execution.
- No brokerage integration.
- No paid subscription layer in the first version.
- No US equity options until crypto data ingestion and model QA are stable.

## Release Discipline

Each version should be committed, tested, pushed to GitHub, and tagged. Draft PRs are preferred for review checkpoints.
