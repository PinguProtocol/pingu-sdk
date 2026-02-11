import "dotenv/config";
import { PinguClient, PinguTrader, PinguReader, formatUnits, getAssetDecimals, MONAD_CONFIG } from "@pingu-exchange/sdk";

// Configuration
const MARKET = process.env.MARKET || "ETH-USD";
const MARGIN = Number(process.env.MARGIN || "50"); // USDC per trade
const LEVERAGE = Number(process.env.LEVERAGE || "5");
const ASSET = process.env.ASSET || "USDC";
const CHECK_INTERVAL_MS = 30_000; // 30 seconds
const OI_MOMENTUM_THRESHOLD = 0.1; // 10% long/short imbalance triggers entry

const client = new PinguClient({
  privateKey: process.env.PRIVATE_KEY,
  ...(process.env.RPC_URL ? { rpcUrl: process.env.RPC_URL } : {}),
});
const trader = new PinguTrader(client);
const reader = new PinguReader(client);

const decimals = getAssetDecimals(ASSET, MONAD_CONFIG.assets);

interface Signal {
  direction: "long" | "short" | "neutral";
  confidence: number;
  reason: string;
}

async function analyzeMarket(market: string): Promise<Signal> {
  const oi = await reader.getOpenInterest(market, ASSET);
  const funding = await reader.getFundingRate(market, ASSET);

  // OI values are BigNumbers — convert to numbers for ratio calculation
  const longNum = Number(formatUnits(oi.long, decimals));
  const shortNum = Number(formatUnits(oi.short, decimals));
  const total = longNum + shortNum;

  if (total === 0) {
    return { direction: "neutral", confidence: 0, reason: "No open interest" };
  }

  const longRatio = longNum / total;
  const shortRatio = shortNum / total;
  const imbalance = longRatio - shortRatio;

  // Funding rate confirms or contradicts the OI signal
  const fundingBullish = funding < 0; // Shorts paying longs
  const fundingBearish = funding > 0; // Longs paying shorts

  if (imbalance > OI_MOMENTUM_THRESHOLD) {
    const confidence = fundingBearish ? 0.5 : 0.8; // Lower confidence if funding contradicts
    return {
      direction: "long",
      confidence,
      reason: `Long OI dominance (${(longRatio * 100).toFixed(1)}%), funding: ${funding.toFixed(6)}%`,
    };
  }

  if (imbalance < -OI_MOMENTUM_THRESHOLD) {
    const confidence = fundingBullish ? 0.5 : 0.8;
    return {
      direction: "short",
      confidence,
      reason: `Short OI dominance (${(shortRatio * 100).toFixed(1)}%), funding: ${funding.toFixed(6)}%`,
    };
  }

  return {
    direction: "neutral",
    confidence: 0,
    reason: `Balanced OI (L: ${(longRatio * 100).toFixed(1)}% / S: ${(shortRatio * 100).toFixed(1)}%)`,
  };
}

async function getOpenPosition(market: string) {
  const positions = await trader.getPositions();
  return positions.find((p) => p.market === market && p.asset === ASSET);
}

async function executeSignal(market: string, signal: Signal) {
  const position = await getOpenPosition(market);

  // If we have a position that conflicts with the new signal, close it
  if (position) {
    const positionDirection = position.isLong ? "long" : "short";

    if (signal.direction === "neutral" || positionDirection !== signal.direction) {
      console.log(`Closing ${positionDirection} ${market} position...`);
      await trader.closePosition({
        market,
        isLong: position.isLong,
        asset: ASSET,
      });
      console.log("Position closed.");

      if (signal.direction === "neutral") return;
    } else {
      console.log(`Already ${positionDirection} ${market}. Holding.`);
      return;
    }
  }

  // Open new position if signal is directional
  if (signal.direction !== "neutral" && signal.confidence >= 0.6) {
    const isLong = signal.direction === "long";
    console.log(
      `Opening ${signal.direction} ${market} (${LEVERAGE}x, $${MARGIN} margin)...`
    );

    await trader.submitMarketOrder({
      market,
      isLong,
      margin: MARGIN,
      leverage: LEVERAGE,
      asset: ASSET,
    });
    console.log("Order submitted.");
  }
}

async function run() {
  console.log("Pingu Trend Follower");
  console.log(`Market: ${MARKET} | Asset: ${ASSET}`);
  console.log(`Margin: $${MARGIN} | Leverage: ${LEVERAGE}x`);
  console.log(`Address: ${client.getAddress()}`);
  console.log(`RPC: ${client.getCurrentRpcUrl()}`);
  console.log("");

  // Check allowance (skip for gas tokens)
  const allowance = await trader.getAllowance(ASSET);
  if (allowance < MARGIN * 10) {
    console.log(`Approving ${ASSET}...`);
    await trader.approveAsset(ASSET);
    console.log("Approved.\n");
  }

  // Run once (uncomment the interval loop for continuous operation)
  const signal = await analyzeMarket(MARKET);
  console.log(`Signal: ${signal.direction.toUpperCase()} (${(signal.confidence * 100).toFixed(0)}%)`);
  console.log(`Reason: ${signal.reason}`);
  console.log("");

  await executeSignal(MARKET, signal);

  // Uncomment for continuous operation:
  // setInterval(async () => {
  //   try {
  //     const signal = await analyzeMarket(MARKET);
  //     console.log(`[${new Date().toISOString()}] ${signal.direction} (${(signal.confidence * 100).toFixed(0)}%) - ${signal.reason}`);
  //     await executeSignal(MARKET, signal);
  //   } catch (err) {
  //     console.error("Error:", (err as Error).message);
  //   }
  // }, CHECK_INTERVAL_MS);
}

run().catch(console.error);
