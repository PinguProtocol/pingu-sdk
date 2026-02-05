# Trend Follower

A simple momentum-based trading agent. Reads on-chain data and opens positions when it detects directional bias.

## What it does

- Connects to Pingu Exchange with a wallet
- Analyzes a target market using open interest imbalance and funding rates
- Generates a directional signal (long / short / neutral) with a confidence score
- Executes trades when confidence exceeds the threshold
- Closes positions that conflict with the current signal

## How to run

```bash
cp .env.example .env
# Edit .env and add your private key
npx tsx index.ts
```

## How to extend

**Add more signals**: The current logic uses OI imbalance and funding rates. Add price momentum (compare current price to a moving average via external API), volume analysis, or cross-market correlation.

**Multi-market**: Run the agent on multiple markets simultaneously. Compare signals across crypto, FX, and metals to find the strongest trends.

**Position sizing**: Scale margin and leverage based on signal confidence. Higher confidence = larger position.

**Stop-loss / take-profit**: Monitor position PnL and close automatically when hitting predefined levels. Use `trader.getPositions()` to check current state.

**Risk limits**: Add max drawdown checks, daily loss limits, and position concentration caps.

## Configuration

Set via environment variables or edit the constants in `index.ts`:

| Variable | Default | Description |
|----------|---------|-------------|
| `PRIVATE_KEY` | required | Wallet private key |
| `MARKET` | `ETH-USD` | Market to trade |
| `MARGIN` | `50` | USDC margin per trade |
| `LEVERAGE` | `5` | Leverage multiplier |
