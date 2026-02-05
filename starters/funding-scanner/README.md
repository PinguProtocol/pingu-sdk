# Funding Rate Scanner

Scans all 70+ Pingu markets for funding rate anomalies. No wallet needed.

## What it does

- Connects to Pingu Exchange via the SDK (read-only)
- Fetches funding rates for every available market
- Sorts by absolute rate and flags anomalies above a configurable threshold
- Displays a ranked table of the most extreme funding rates

## How to run

```bash
cp .env.example .env
npx tsx index.ts
```

No private key required. This starter is read-only.

## How to extend

**Turn it into a trading bot**: When the scanner detects an anomaly (e.g. funding rate on ETH-USD is extremely positive), open a short position to collect funding payments. Add a `PinguTrader` and wire the anomaly detection to order execution.

**Add alerts**: Send notifications via Discord webhook, Telegram bot, or email when anomalies are detected.

**Track over time**: Store snapshots in a database or CSV. Analyze how funding rates evolve and when they mean-revert. Use historical patterns to predict the best entry timing.

**Cross-exchange comparison**: Fetch funding rates from other exchanges (Binance, Hyperliquid) and compare with Pingu. Trade the exchange with the most favorable rate.

## Configuration

Edit the constants at the top of `index.ts`:

| Variable | Default | Description |
|----------|---------|-------------|
| `SCAN_INTERVAL_MS` | `60000` | Milliseconds between scans |
| `FUNDING_THRESHOLD` | `0.01` | Alert threshold (absolute %) |
