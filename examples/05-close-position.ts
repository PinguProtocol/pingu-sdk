import "dotenv/config";
import { PinguClient, PinguTrader } from "../src";

async function main() {
  const client = new PinguClient({
    privateKey: process.env.PRIVATE_KEY,
  });
  const trader = new PinguTrader(client);

  // List current positions
  const positions = await trader.getPositions();
  if (positions.length === 0) {
    console.log("No open positions to close.");
    return;
  }

  console.log("Current positions:");
  for (const p of positions) {
    console.log(
      `  ${p.market} ${p.isLong ? "LONG" : "SHORT"} | $${p.size.toLocaleString()} | ${p.leverage}x`,
    );
  }

  // Close the first position (full close)
  const pos = positions[0];
  console.log(`\nClosing ${pos.market} ${pos.isLong ? "LONG" : "SHORT"}...`);

  const receipt = await trader.closePosition({
    market: pos.market,
    isLong: pos.isLong,
  });

  console.log(`Position closed! tx: ${receipt.transactionHash}`);
}

main().catch(console.error);
