import "dotenv/config";
import { PinguClient, PinguReader } from "../src";

async function main() {
  const client = new PinguClient();
  const reader = new PinguReader(client);

  // Get detailed info for a specific market
  const ethInfo = await reader.getMarketInfo("ETH-USD");
  console.log("ETH-USD Market Info:");
  console.log(`  Max Leverage: ${ethInfo.maxLeverage}x`);
  console.log(`  Fee: ${(ethInfo.fee * 100).toFixed(3)}%`);
  console.log(`  Liq Threshold: ${(ethInfo.liqThreshold * 100).toFixed(1)}%`);
  console.log(`  Category: ${ethInfo.category}`);
  console.log(`  Reduce Only: ${ethInfo.isReduceOnly}`);

  // Get open interest
  const oi = await reader.getOpenInterest("ETH-USD");
  console.log(`\nETH-USD Open Interest (USDC):`);
  console.log(`  Total: $${oi.total.toLocaleString()}`);
  console.log(`  Long:  $${oi.long.toLocaleString()}`);
  console.log(`  Short: $${oi.short.toLocaleString()}`);

  // Get funding rate
  const funding = await reader.getFundingRate("ETH-USD");
  console.log(`\nETH-USD Funding Rate: ${funding.toFixed(6)}%`);

  // Get pool balance
  const poolBalance = await reader.getPoolBalance();
  console.log(`\nPool Balance (USDC): $${poolBalance.toLocaleString()}`);
}

main().catch(console.error);
