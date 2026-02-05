# @pingu-exchange/sdk

TypeScript SDK for trading on [Pingu Exchange](https://pingu.exchange), a decentralized perpetuals DEX on [Monad](https://monad.xyz).

Trade 70+ markets (crypto, FX, metals, commodities, equities) with a few lines of code.

## Installation

```bash
npm install github:PinguProtocol/pingu-agent-sdk
```

**Requirements:**
- Node.js >= 18
- A private key (for trading. Read-only queries work without one)
- A [The Graph API key](https://thegraph.com/studio/) (only for historical data via `PinguGraph`)

## Quick Start

### Read market data (no wallet needed)

```typescript
import { PinguClient, PinguReader } from "@pingu-exchange/sdk";

const client = new PinguClient();
const reader = new PinguReader(client);

const markets = await reader.getMarkets();
console.log(`${markets.length} markets available`);

const eth = await reader.getMarketInfo("ETH-USD");
console.log(`ETH-USD: max ${eth.maxLeverage}x leverage, ${eth.fee}% fee`);
```

### Open a position

```typescript
import { PinguClient, PinguTrader } from "@pingu-exchange/sdk";

const client = new PinguClient({ privateKey: process.env.PRIVATE_KEY });
const trader = new PinguTrader(client);

// Approve USDC (one-time)
await trader.approveUSDC();

// 10x long ETH with $100 margin
const receipt = await trader.submitMarketOrder({
  market: "ETH-USD",
  isLong: true,
  margin: 100,
  leverage: 10,
});
console.log(`Order submitted: ${receipt.transactionHash}`);
```

### Close a position

```typescript
await trader.closePosition({ market: "ETH-USD", isLong: true });
```

### Query trade history

```typescript
import { PinguGraph } from "@pingu-exchange/sdk";

// Pass your API key directly
const graph = new PinguGraph(process.env.GRAPH_API_KEY);

const stats = await graph.getUserStats("0x...");
console.log(`Win rate: ${stats.winRate}%, PnL: $${stats.totalPnl}`);
```

## API Reference

### PinguClient

Core connection. Handles RPC with automatic fallback, signer, and contract resolution.

```typescript
const client = new PinguClient({
  rpcUrl?: string,          // Optional custom RPC (fallbacks to public RPCs)
  privateKey?: string,      // Optional (read-only if absent)
  chainConfig?: ChainConfig // Default: MONAD_CONFIG
});
```

| Method | Description |
|--------|-------------|
| `getContractAddress(name)` | Resolve contract address via DataStore |
| `getContract(name, withSigner?)` | Get ethers.Contract instance |
| `getErc20Contract(address, withSigner?)` | Get ERC20 contract |
| `getAddress()` | Get signer wallet address |
| `withFallback(fn)` | Execute RPC call with automatic fallback |
| `getCurrentRpcUrl()` | Get current RPC endpoint |

### PinguTrader

Trading operations. Requires a private key.

```typescript
const trader = new PinguTrader(client);
```

**Trading**

| Method | Description |
|--------|-------------|
| `submitMarketOrder({ market, isLong, margin, leverage, asset? })` | Open market order |
| `submitLimitOrder({ market, isLong, margin, leverage, price, asset? })` | Open limit order |
| `closePosition({ market, isLong, asset?, size? })` | Close position (full or partial) |
| `cancelOrder(orderId)` | Cancel a single order |
| `cancelOrders(orderIds)` | Cancel multiple orders |
| `addMargin(market, amount, asset?)` | Add margin to position |
| `removeMargin(market, amount, asset?)` | Remove margin (uses Pyth price) |

**Account**

| Method | Description |
|--------|-------------|
| `getPositions(address?)` | Get open positions |
| `getOrders(address?)` | Get pending orders |
| `getBalance(asset?)` | Wallet balance |
| `getAllowance(asset?)` | Asset allowance |
| `approveAsset(asset?, amount?)` | Approve asset spending |
| `approveUSDC(amount?)` | Approve USDC spending |

### PinguReader

Read-only market data. No private key needed.

```typescript
const reader = new PinguReader(client);
```

| Method | Description |
|--------|-------------|
| `getMarkets()` | All available markets (70+) |
| `getMarketInfo(market)` | Market config (leverage, fees, etc.) |
| `getOpenInterest(market, asset?)` | OI breakdown (total, long, short) |
| `getFundingRate(market, asset?)` | Capped EMA funding rate (8h updates) |
| `getRealTimeFundingTracker(market, asset?)` | Real-time funding tracker |
| `getAccruedFunding(market, size, fundingTracker, asset?)` | Accrued funding for position |
| `getLastFundingUpdate(market, asset?)` | Last funding update timestamp |
| `getPoolBalance(asset?)` | Total pool balance |
| `getMaxPositionSize(market, asset?)` | Max position size |
| `getMaxOI(market, asset?)` | Max open interest |

### PinguGraph

Historical data via [The Graph](https://thegraph.com). Requires an [API key](https://thegraph.com/studio/).

```typescript
// Pass API key directly
const graph = new PinguGraph(process.env.GRAPH_API_KEY);

// Or pass full endpoint URL
const graph = new PinguGraph(
  "https://gateway.thegraph.com/api/<YOUR_API_KEY>/subgraphs/id/G3dQNfEnDw4q3bn6QRSJUmcLzi7JKTDGYGWwPeYWYa6X"
);
```

| Method | Description |
|--------|-------------|
| `getUserHistory(address, limit?)` | Trade history |
| `getUserStats(address)` | Win rate, PnL, volume stats |
| `getUserVolume(address)` | Total trading volume |
| `getUserDeposits(address)` | LP deposit history |

### PinguPool

Liquidity pool operations. Requires a private key.

```typescript
const pool = new PinguPool(client);
```

| Method | Description |
|--------|-------------|
| `deposit(amount, asset?, lockupIndex?)` | Deposit into pool |
| `withdraw(amount, asset?)` | Withdraw from pool |
| `getDepositTax(amount, asset?, lockupIndex?)` | Preview deposit fee |
| `getWithdrawalTax(amount, asset?)` | Preview withdrawal fee |
| `getUserBalance(address?, asset?)` | LP position (withdrawable, locked, total) |

## Markets

70+ perpetual markets fetched on-chain from MarketStore. Use `reader.getMarkets()` for the live list.

| Category | Count | Examples |
|----------|-------|---------|
| Crypto | 51 | ETH-USD, BTC-USD, SOL-USD, DOGE-USD, MON-USD |
| FX | 8 | EUR-USD, GBP-USD, USD-JPY |
| Equities | 9 | TSLA-USD, NVDA-USD, AAPL-USD, MSFT-USD, SPY-USD |
| Metals | 2 | XAU-USD, XAG-USD |
| Commodities | 1 | USOILSPOT-USD |

## Configuration

The SDK targets **Monad mainnet** with automatic RPC failover.

| Asset | Address | Decimals |
|-------|---------|----------|
| USDC | `0x754704bc059f8c67012fed69bc8a327a5aafb603` | 6 |
| MON | Native gas token | 18 |

All price feeds powered by [Pyth Network](https://pyth.network).

## Examples

Run examples with `tsx`:

```bash
# Read-only (no wallet needed)
npx tsx examples/01-connect.ts
npx tsx examples/02-read-markets.ts

# Requires GRAPH_API_KEY in .env
npx tsx examples/06-query-history.ts

# Requires PRIVATE_KEY in .env
npx tsx examples/03-get-positions.ts
npx tsx examples/04-submit-order.ts
npx tsx examples/05-close-position.ts
npx tsx examples/07-pool-deposit.ts
```

## Development

```bash
npm install       # Install dependencies
npm run build     # Build (CJS + ESM + types)
npm run typecheck # Type check
npm run dev       # Watch mode
```

## License

MIT
