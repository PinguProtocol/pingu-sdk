import "dotenv/config";
import { PinguClient, PinguReader } from "@pingu-exchange/sdk";

// Configuration
const SCAN_INTERVAL_MS = 60_000; // 1 minute between scans
const FUNDING_THRESHOLD = 0.01; // Alert when abs(funding rate) > 0.01%

interface FundingSnapshot {
  market: string;
  rate: number;
  category: string;
}

const client = new PinguClient(
  process.env.RPC_URL ? { rpcUrl: process.env.RPC_URL } : {},
);
const reader = new PinguReader(client);

async function scanFundingRates(): Promise<FundingSnapshot[]> {
  const markets = await reader.getMarkets();
  console.log(`Scanning ${markets.length} markets...\n`);

  const results: FundingSnapshot[] = [];

  for (const market of markets) {
    try {
      const rate = await reader.getFundingRate(market.market);
      results.push({
        market: market.market,
        rate,
        category: market.category,
      });
    } catch {
      // Skip markets with no funding data
    }
  }

  return results;
}

function displayResults(snapshots: FundingSnapshot[]) {
  // Sort by absolute funding rate (highest first)
  const sorted = [...snapshots].sort(
    (a, b) => Math.abs(b.rate) - Math.abs(a.rate)
  );

  console.log("=".repeat(60));
  console.log("FUNDING RATE SCANNER");
  console.log(`Time: ${new Date().toISOString()}`);
  console.log("=".repeat(60));
  console.log("");

  // Show anomalies (above threshold)
  const anomalies = sorted.filter((s) => Math.abs(s.rate) > FUNDING_THRESHOLD);

  if (anomalies.length > 0) {
    console.log(`ANOMALIES (|rate| > ${FUNDING_THRESHOLD}%):`);
    console.log("-".repeat(50));
    for (const s of anomalies) {
      const direction = s.rate > 0 ? "LONGS PAY" : "SHORTS PAY";
      console.log(
        `  ${s.market.padEnd(15)} ${s.rate.toFixed(6)}%  [${direction}]  (${s.category})`
      );
    }
    console.log("");
  } else {
    console.log("No anomalies detected.\n");
  }

  // Show top 10 by absolute rate
  console.log("TOP 10 BY RATE:");
  console.log("-".repeat(50));
  for (const s of sorted.slice(0, 10)) {
    const direction = s.rate > 0 ? "+" : "";
    console.log(
      `  ${s.market.padEnd(15)} ${direction}${s.rate.toFixed(6)}%  (${s.category})`
    );
  }

  console.log("");
  console.log(`Total markets scanned: ${snapshots.length}`);
  console.log(`Anomalies found: ${anomalies.length}`);
}

async function main() {
  console.log("Pingu Funding Rate Scanner");
  console.log(`Threshold: ${FUNDING_THRESHOLD}%`);
  console.log(`Interval: ${SCAN_INTERVAL_MS / 1000}s`);
  console.log("");

  // Run once
  const results = await scanFundingRates();
  displayResults(results);

  // Uncomment below to run continuously:
  // setInterval(async () => {
  //   const results = await scanFundingRates();
  //   displayResults(results);
  // }, SCAN_INTERVAL_MS);
}

main().catch(console.error);
