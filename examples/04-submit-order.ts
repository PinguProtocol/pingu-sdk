import "dotenv/config";
import { PinguClient, PinguTrader } from "../src";

async function main() {
  const client = new PinguClient({
    privateKey: process.env.PRIVATE_KEY,
  });
  const trader = new PinguTrader(client);

  console.log(`Address: ${client.getAddress()}`);

  // Check USDC allowance
  const allowance = await trader.getAllowance("USDC");
  if (allowance < 1000) {
    console.log("Approving USDC...");
    await trader.approveUSDC();
    console.log("USDC approved.");
  }

  // Open a 10x long ETH with $100 margin
  console.log("\nSubmitting 10x long ETH-USD ($100 margin)...");
  const receipt = await trader.submitMarketOrder({
    market: "ETH-USD",
    isLong: true,
    margin: 100,
    leverage: 10,
  });

  console.log(`Order submitted! tx: ${receipt.transactionHash}`);
}

main().catch(console.error);
