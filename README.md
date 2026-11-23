# Dalgon

Dalgon is a Node.js trading assistant for Kraken. It retrieves OHLC market data, calculates technical indicators and candidate grades, submits buy orders, manages take-profit orders, and exposes account and trading commands through Viber.

By default, asset decisions are deterministic and based on moving averages, MACD reversals, on-balance volume, candle patterns, and price changes. An optional OpenRouter advisory/auto mode can evaluate the same structured market snapshot with a hosted model.

## How it works

- `src/app.js` loads configuration and runs the main analysis and trading loop.
- `src/Analysis.js` evaluates assets and produces graded candidates.
- `src/Order.js` validates balances and trading conditions, submits buy and sell orders, and handles stale take-profit orders.
- `src/selling-worker.js` runs stale and profitable take-profit order management in a worker thread.
- `src/Dalgon.js` wraps Kraken public and signed private API calls.
- `src/DalgonViberBot.js` provides Viber commands and persisted trading controls.
- `src/OpenRouterClient.js` calls OpenRouter-compatible chat completion APIs and persists a bounded session.
- `src/TradingDecision.js` validates model decisions and maintains the session memo.
- `test/` contains unit tests and fixture-based simulation responses.

## Requirements

- Node.js and npm
- A Kraken API key and private API key
- Optional: a Viber bot token and publicly reachable webhook
- Optional: ngrok for exposing the local Viber webhook

## Configuration

Copy `assets/default.properties.template` to `env/default.properties`, then configure the Kraken API public key, base currency, asset list, trading limits, whitelist, exceptions, profit target, and stale-order settings.

Secrets should be passed on the command line or supplied by the local environment, not committed to templates or launch scripts:

```bash
npm install
npm run build
node dist/app.js --privAPIKey YOUR_KRAKEN_PRIVATE_KEY --botAuthToken YOUR_VIBER_TOKEN
```

Use `node dist/app.js --help` to view CLI options. Simulation mode is available for fixture-based execution:

```bash
node dist/app.js --simulation --privAPIKey NO_KEY_NEEDED
```

For a prepared launch script, run `dalgon_start.sh`. The script also starts ngrok, updates the Viber callback URL, and schedules the log archiver.

## OpenRouter

Set `OPENROUTER_API_KEY` in the process environment. Configure the `[openrouter]` section in `env/default.properties`:

- `ENABLED=false` keeps AI analysis disabled.
- `MODE=shadow` logs decisions without affecting trades.
- `MODE=advisory` sends AI summaries through Viber without affecting trades.
- `MODE=auto` allows a model `BUY` decision to reach the existing deterministic buy checks. `HOLD` and `SELL` do not authorize buys.

The default is shadow. An AI API failure, malformed response, invalid confidence, or timeout fails closed and does not affect order execution. Sessions are persisted in `env/<environment>.openrouter-session.json`, including a bounded conversation history and rolling memo.

Viber AI commands:

- `ai ask MESSAGE` starts or continues a general conversation.
- `ai status` reports the mode, model, and session ID.
- `ai memo` reports the current trading-session memo.
- `ai reset` starts a new session.

## Trading flow

1. Discover Kraken pairs for the configured assets.
2. Fetch OHLC data at multiple horizons.
3. Calculate technical conditions and a candidate grade.
4. Apply the configured grade threshold and buy whitelist/exceptions.
5. Check balance, minimum balance, open orders, and tradeable pairs.
6. Submit a limit buy with a conditional take-profit order.
7. Run the selling worker to cancel stale orders or replace them with sell orders.

Auto-trading remains an operationally dangerous feature: market-losses are possible, API output can be stale or incomplete, and the current BTC stop/start condition should be reviewed before using it as a safety control.

## Tests

```bash
npm test
```

The suite includes simulation fixtures for analysis, ledgers, OHLC calculations, tickers, orders, and tradeable pairs. It does not place live Kraken orders.

## Build

```bash
npm run build
```

Compiled output is written to `dist/`.
