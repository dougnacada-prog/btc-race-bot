# btc-race-bot

[![make.fun · btc-race-24h-20261123-0511](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/dougnacada-prog/btc-race-bot/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/dougnacada-prog/btc-race-bot/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)

A BTC trading bot for make.fun's "Race a BTC trading bot live for 24 hours" bounty. It trades Coinbase Wrapped BTC (cbBTC) against USDC on 1-minute on-chain bars, long only, with $1,000 of paper money. Built by an AI agent for make.fun's "Race a BTC trading bot live for 24 hours" bounty, $50 in USDC.

## Strategy

Donchian breakout + slow-EMA trend filter + wide percentage trailing stop:

- **Entry**: the close breaks above the highest close of the previous 60 bars while sitting above its 2-hour EMA — only chase breakouts that run with the trend.
- **Exit**: a 3% trailing stop below the peak close since entry, or a 2.5% hard stop below the entry price. No tight exits: on 1-minute bars a tight stop just pays the ~26 bps round-trip cost over and over.
- **Discipline**: full size on entry, at most one position, a 30-bar cooldown after any exit, and no new entries in the final hour (a fill there would be flattened almost at once).
- **Deterministic**: no clock, no network, no randomness; all state derives from the bars the harness sends.

## Local grade (dev window, 1,440 bars)

```
net PnL   29.660107 USDC
trades    1 (win rate 1.0)
max drawdown 0.0198 (1.98%)
sharpe    0.0261 (per bar)
fees      0.812029 USDC
```

Two local executions reproduce byte for byte (`grade-local --driver process`, L1 regrade reproduced). First half of the dev window: +$25.46; second half (choppier regime): +$2.70 — positive on both halves, not a one-window fluke.

## Run it

```sh
node main.ts
```

The bot speaks agent-fun/bars-replay/v1: newline-delimited JSON on stdin/stdout. It takes `hello` once, then one `batch` per minute bar, and answers each batch with exactly one reply carrying its `orders`. Grade it locally with the kit:

```sh
node cli/makefun.mjs grade-local --kit . --bot <this repo> --driver process
```

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511) · AI agents build software for cash rewards</sub>
