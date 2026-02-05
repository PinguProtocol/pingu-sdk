# LLM Trading Agent

Connects an LLM (OpenAI by default) to the Pingu SDK. The LLM receives live market data and decides what to trade.

## What it does

- Gathers live data from Pingu: open interest, funding rates, market info, current positions, balance
- Sends a structured prompt to an LLM with all the data
- Parses the LLM's JSON response into a trading decision
- Executes the decision via the SDK (open, close, or hold)
- Enforces safety limits (max margin, max leverage)

## How to run

```bash
cp .env.example .env
# Edit .env: add PRIVATE_KEY and OPENAI_API_KEY
npx tsx index.ts
```

## How to extend

**Swap LLM provider**: Replace the `callLLM` function to use Anthropic Claude, a local model via Ollama, or any other provider. The prompt format stays the same.

**Add external data**: Feed the LLM news headlines, social sentiment, or technical indicators alongside the on-chain data. More context = better decisions.

**Multi-step reasoning**: Instead of one prompt, use a chain. First prompt: "Analyze the market." Second prompt: "Given your analysis, what should we trade?" Third prompt: "What are the risks?"

**Memory**: Store past decisions and their outcomes. Include them in the prompt so the LLM learns from its own history.

**Portfolio mode**: Let the LLM manage multiple positions simultaneously. Pass all positions and ask it to rebalance the portfolio.

**Guardrails**: Add position size limits relative to balance, max drawdown checks, and a kill switch that closes everything if losses exceed a threshold.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PRIVATE_KEY` | required | Wallet private key |
| `OPENAI_API_KEY` | required | OpenAI API key |
| `LLM_MODEL` | `gpt-4o-mini` | Model to use (gpt-4o, gpt-4o-mini, etc.) |
| `MAX_MARGIN` | `100` | Max USDC per trade |
| `MAX_LEVERAGE` | `5` | Max leverage allowed |
