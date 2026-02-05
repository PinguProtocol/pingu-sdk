import "dotenv/config";
import { PinguClient, PinguTrader, PinguPool } from "../src";

async function main() {
  const client = new PinguClient({
    privateKey: process.env.PRIVATE_KEY,
  });
  const trader = new PinguTrader(client);
  const pool = new PinguPool(client);

  console.log(`Address: ${client.getAddress()}\n`);

  // Check USDC balance
  const balance = await trader.getBalance("USDC");
  console.log(`USDC Balance: $${balance.toLocaleString()}`);

  // Check deposit tax
  const depositAmount = 1000;
  const tax = await pool.getDepositTax(depositAmount);
  console.log(`\nDeposit tax for $${depositAmount}: ${tax}%`);

  // Check current pool position
  const userBalance = await pool.getUserBalance(undefined, "USDC");
  console.log(`\nCurrent Pool Position:`);
  console.log(`  Total: $${userBalance.total.toLocaleString()}`);
  console.log(`  Withdrawable: $${userBalance.withdrawable.toLocaleString()}`);
  console.log(`  Locked: $${userBalance.locked.toLocaleString()}`);

  // Uncomment to deposit
  // console.log(`\nDepositing $${depositAmount} USDC...`);
  // const receipt = await pool.deposit(depositAmount, "USDC", 0);
  // console.log(`Deposited! tx: ${receipt.transactionHash}`);
}

main().catch(console.error);
