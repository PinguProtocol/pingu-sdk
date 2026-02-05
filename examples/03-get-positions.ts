import "dotenv/config";
import { PinguClient, PinguTrader } from "../src";

async function main() {
  const client = new PinguClient({
    privateKey: process.env.PRIVATE_KEY,
  });
  const trader = new PinguTrader(client);

  console.log(`Address: ${client.getAddress()}\n`);

  // Check balance
  const balance = await trader.getBalance("USDC");
  console.log(`USDC Balance: $${balance.toLocaleString()}`);

  const monBalance = await trader.getBalance("MON");
  console.log(`MON Balance: ${monBalance.toFixed(4)} MON\n`);

  // Get open positions
  const positions = await trader.getPositions();
  if (positions.length === 0) {
    console.log("No open positions.");
  } else {
    console.log(`${positions.length} open position(s):`);
    for (const p of positions) {
      console.log(
        `  ${p.market} ${p.isLong ? "LONG" : "SHORT"} | Size: $${p.size.toLocaleString()} | Margin: $${p.margin.toLocaleString()} | ${p.leverage}x | Entry: $${p.price.toFixed(2)}`,
      );
    }
  }

  // Get open orders
  const orders = await trader.getOrders();
  if (orders.length === 0) {
    console.log("\nNo open orders.");
  } else {
    console.log(`\n${orders.length} open order(s):`);
    for (const o of orders) {
      const type = o.orderType === 0 ? "MARKET" : o.orderType === 1 ? "LIMIT" : "STOP";
      console.log(
        `  #${o.orderId} ${o.market} ${o.isLong ? "LONG" : "SHORT"} ${type} | Size: $${o.size.toLocaleString()} | ${o.leverage}x`,
      );
    }
  }
}

main().catch(console.error);
