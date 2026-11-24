# Backtest report: Dalgon strategies, 2022-01 to 2026-10

Date: 2026-11-24. Branch: `strategy/risk-managed-macd-obv`.

## Summary

- The original MACD/OBV dip signal has no edge. It lost money in every year and on every coin, and its entries did no better than random ones.
- No parameter setting (2,160 tried) was reliably profitable on data held out from the tuning.
- A second round of signal research (19 pre-specified rules, 17 coins) found nothing that cleared a pre-set significance bar or survived realistic execution.
- The one lead is rare: buying a coin after a fall of 20% or more within 24 hours (`SIGNAL_MODE=capitulation`). It made +4.5% per trade (standard error 2.0) over 33 trades, positive in every year. It is unproven and was chosen after looking at results.
- Recommendation: do not trade the MACD/OBV signal with real money. Treat capitulation as a hypothesis to collect live evidence for, at small size.

## Data and method

- Prices: Binance public monthly 1-minute archives (`data.binance.vision`), 2022-01 to 2026-10, as a proxy because Kraken's API returns at most 720 candles per interval. Quote pairs: EUR (BTC, ETH, SOL, XRP, LINK) and USDT (XRP, ADA, SOL plus up to 17 liquid coins). USDC pairs have no archive between 2022-10 and 2023-11, so USDT stands in for USDC.
- Analysis replay: the real `Analysis` code is run at every 15-minute step against candles as they looked at that moment, with no lookahead. Month-long chunks run in parallel workers; results are cached per source hash.
- Execution model (deliberately pessimistic):
  - Post-only limit entry at the bid, which is the last close minus 0.05%. It fills only if a later 1-minute low trades below the price, within 30 minutes.
  - The stop is checked before the target within a minute. A gap through the stop fills at the open, plus 0.1% slippage.
  - A target counts only when a 1-minute close is at or above it. Time exits sell at the close minus the half spread.
  - Fees 0.25% maker and 0.40% taker. One position at a time, with the daily and weekly loss limits.
- Comparisons: a random-entry benchmark under the same execution model, equal-weight buy and hold, and held-out time blocks (A 2022-01 to 2023-06, B 2023-07 to 2024-12, C 2025-01 to 2026-10).

## Results

### MACD/OBV signal

| Setup | Trades | Win rate | Expectancy per trade | Net |
| --- | --- | --- | --- | --- |
| BTC, ETH, SOL, XRP, LINK in EUR, 2.5% stop, 5% target | 295 | 35.3% (42% needed) | -0.88% (±0.17) | -€326 (-65%) |
| Random entries, same model | n/a | 31.8% | -0.88% | n/a |
| XRP, ADA, SOL in USDT, grade ≥ 0.7 | 267 | 35.6% | -0.67% (±0.20) | -€225 (-45%) |
| Random entries, same model | n/a | 31.5% | -0.88% | n/a |

- Every year and every asset was negative. Equal-weight buy and hold of the same coins: -0.3% (EUR set) and -26% (USDT set).
- Gross forward return after the signal was no better than random: 24h -0.18% against +0.04%, and 48h -0.27% against +0.09%. Higher grades were not better.
- Parameter grid (2,160 sets: grade threshold 0.7 to 1.2, target 5 to 15%, stop 2.5% to none, hold 48 to 168h, three target step-down schedules, volatility filter, BTC-drop gate): holdout median -€52 per €100 traded per trade slot, 28% of sets profitable. The 12 sets picked on 2022 to 2024 averaged -€7 on the holdout.

### Signal research, round 1 (hourly bars, 10 coins)

- Trend, breakout, momentum, relative-strength and volume-spike entries showed no gross edge over costs of about 0.7%.
- Shallow dips and oversold readings (RSI, Bollinger) had small positive gross returns that costs erased.
- After large drops, forward returns grew with the drop size in all four windows tested (1h, 4h, 12h, 24h) and in all three time blocks. Example: a fall of 15% in 24h was followed by +4.6% over 72h (195 events, t about 4).

### Capitulation signal through the real code (15-minute steps)

| Variant | Trades | Win rate | Result |
| --- | --- | --- | --- |
| Drop ≥ 20% in 24h, 15% stop, 12% target, 24h hold | 33 | 72.7% | +4.5% per trade (±2.0), profit factor 2.3, positive in every year |
| Same, €5 risk per trade, €10/day and €20/week limits | 33 | 72.7% | +€47 over 4.8 years on €500 |
| Same, €20 risk, €40/day and €80/week limits (€125 position) | 33 | 72.7% | +€189, maximum drawdown €55 |
| Drop ≥ 15% | 43 to 56 | about 55% | about break-even (+0.2% to +1.2% per trade, depending on the decision time grid) |
| Drops of 5% to 20% only | 43 to 364 | 42 to 58% | lost money in every variant (-3% to -56% of traded capital) |

- Random entries: -0.75% per trade. Buy and hold of the same coins: -51%.
- The profit came from drops of 20% or more.

### Signal research, round 2 (17 coins, pre-specified rules)

- 19 rules on volatility-normalised drops, coin-specific versus market-wide moves, bounce confirmation, the weakest coin of the day and the 50-day trend, tuned on 2022 to 2024 and checked on 2025 to 2026.
- No rule cleared the pre-set bar (gross return above 1.0% with a daily-clustered t of at least 3).
- Gross returns after 3σ to 4σ drops were positive and held up on the holdout, for example +2.9% at 24h after a 3σ drop over 24h.
- With fills, stops and fees, none of 72 settings (and none of 240 in a wider grid) was profitable in all three blocks, apart from a few noise-sized ones (+€4 on 13 trades). The holdout median was negative.

## Caveats

- The capitulation threshold and exits were chosen after looking at results. The same signal at a 15% threshold, or with a different decision time grid, was near break-even, and an hourly-bar version gave +4.5% where the live-style version gave +0.2%. Expect the true edge to be smaller than reported.
- Only about 7 trades happen per year, so real evidence builds slowly and the standard error is large.
- Survivorship: coins that collapsed to zero are missing from the data, which flatters dip-buying. A 15% stop does not protect against a gap far below it.
- Binance prices differ from Kraken's in liquidity and wicks. The simulator cannot reproduce real order-book queues or partial fills.
- Kraken's public pair data no longer lists fee tiers, so fees come from the `[strategy]` configuration.

## Reproduce

```bash
node backtest/download.js --quote USDT --assets XRP,ADA,SOL --from 2022-01 --to 2026-10
node backtest/run.js --quote USDT --assets XRP,ADA,SOL --gradeThreshold 0.7 --nullRuns 5
node backtest/tune.js --quote USDT --assets XRP,ADA,SOL
node backtest/edge.js --quote USDT --assets XRP,ADA,SOL
node backtest/research.js --quote USDT --assets XRP,ADA,SOL,ETH,LINK,DOGE,AVAX,LTC,DOT
node backtest/research2.js --quote USDT --assets XRP,ADA,SOL,ETH,LINK,DOGE,AVAX,LTC,DOT,ATOM,UNI,NEAR,AAVE,ETC,BCH,XLM,TRX
node backtest/explore.js --quote USDT --assets XRP,ADA,SOL,ETH,LINK,DOGE,AVAX,LTC,DOT
node backtest/explore2.js --quote USDT --assets XRP,ADA,SOL,ETH,LINK,DOGE,AVAX,LTC,DOT,ATOM,UNI,NEAR,AAVE,ETC,BCH,XLM,TRX
node backtest/run.js --quote USDT --assets XRP,ADA,SOL,ETH,LINK,DOGE,AVAX,LTC,DOT --signalMode capitulation --capitulationDropPercent 20 --capitulationWindowHours 24 --gradeThreshold 0 --btcMaxDropPercent 100000 --atrStopMultiple 0 --minNetRewardRisk 0.7 --stopLossPercent 15 --takeProfitPercent 12 --maxHoldHours 24 --nullRuns 5
```

Downloads (`backtest/data`), signal caches (`backtest/cache`) and result files (`backtest/results`) are gitignored. The data set is about 1.6 GB for 26 pairs.

## Recommendation

1. Turn auto-trading off, or switch it to `SIGNAL_MODE=capitulation` with the settings in `assets/default.properties.template` and a small `MAX_RISK_AMOUNT`.
2. Collect live evidence for the capitulation rule; judge it after a meaningful number of trades, not a handful.
3. Further signal searches on this same data carry growing selection bias. Prefer new data or forward testing.
