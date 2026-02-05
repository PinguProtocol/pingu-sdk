import "dotenv/config";
import { PinguGraph } from "../src";

async function main() {
  // PinguGraph requires a The Graph API key
  const apiKey = process.env.GRAPH_API_KEY;
  if (!apiKey) {
    console.error("Error: GRAPH_API_KEY not found in .env");
    console.error("Get one at https://thegraph.com/studio/");
    process.exit(1);
  }

  const graph = new PinguGraph(apiKey);

  // Replace with any address to query
  const address =
    process.env.WALLET_ADDRESS ||
    "0x57790692ce132e88930405b5eabdfb5176aedb12";

  console.log(`Trade history for ${address}\n`);

  // Get last 20 trades
  const history = await graph.getUserHistory(address, 20);
  for (const trade of history) {
    const date = new Date(trade.timestamp * 1000).toISOString().split("T")[0];
    const pnlStr = trade.pnl !== undefined ? ` | PnL: $${trade.pnl.toFixed(2)}` : "";
    console.log(
      `  ${date} | ${trade.type.padEnd(20)} | ${trade.market.padEnd(10)} | ${trade.isLong ? "LONG " : "SHORT"} | $${trade.size.toFixed(0).padStart(8)}${pnlStr}`,
    );
  }

  // Get user stats
  const stats = await graph.getUserStats(address);
  console.log(`\nUser Stats:`);
  console.log(`  Total Trades: ${stats.totalTrades}`);
  console.log(`  Total Volume: $${stats.totalVolume.toLocaleString()}`);
  console.log(`  Total PnL: $${stats.totalPnl.toFixed(2)}`);
  console.log(`  Win Rate: ${stats.winRate.toFixed(1)}% (${stats.winCount}W / ${stats.lossCount}L)`);
}

main().catch(console.error);
