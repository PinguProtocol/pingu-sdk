import "dotenv/config";
import { PinguClient, PinguReader } from "../src";

async function main() {
  // Read-only connection (no private key needed)
  const client = new PinguClient();
  const reader = new PinguReader(client);

  const markets = await reader.getMarkets();
  console.log(`Connected to Pingu on Monad!`);
  console.log(`${markets.length} markets available\n`);

  // Print first 10 markets
  for (const m of markets.slice(0, 10)) {
    console.log(
      `  ${m.market.padEnd(12)} | max leverage: ${m.maxLeverage}x | fee: ${(m.fee * 100).toFixed(2)}%`,
    );
  }

  console.log(`  ... and ${markets.length - 10} more`);
}

main().catch(console.error);
