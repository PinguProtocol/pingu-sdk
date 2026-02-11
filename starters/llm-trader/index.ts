import "dotenv/config";
import { PinguClient, PinguTrader, PinguReader, formatUnits, getAssetDecimals, MONAD_CONFIG } from "@pingu-exchange/sdk";

// Configuration
const MARKETS = ["ETH-USD", "BTC-USD", "SOL-USD"];
const MAX_MARGIN = Number(process.env.MAX_MARGIN || "100");
const MAX_LEVERAGE = Number(process.env.MAX_LEVERAGE || "5");
const ASSET = process.env.ASSET || "USDC";

const client = new PinguClient({
  privateKey: process.env.PRIVATE_KEY,
  ...(process.env.RPC_URL ? { rpcUrl: process.env.RPC_URL } : {}),
});
const trader = new PinguTrader(client);
const reader = new PinguReader(client);

const decimals = getAssetDecimals(ASSET, MONAD_CONFIG.assets);

// --- LLM Integration ---

interface LLMDecision {
  action: "open_long" | "open_short" | "close" | "hold";
  market: string;
  margin?: number;
  leverage?: number;
  reasoning: string;
}

async function callLLM(prompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.LLM_MODEL || "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a trading agent for Pingu Exchange, a decentralized perpetuals DEX on Monad. You analyze market data and make trading decisions. Respond ONLY with valid JSON matching this schema: { "action": "open_long" | "open_short" | "close" | "hold", "market": string, "margin": number (max ${MAX_MARGIN}), "leverage": number (max ${MAX_LEVERAGE}), "reasoning": string }`,
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
    }),
  });

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  return data.choices[0].message.content;
}

// --- Market Data Collection ---

async function gatherMarketData(): Promise<string> {
  const lines: string[] = ["CURRENT MARKET DATA:"];

  for (const market of MARKETS) {
    try {
      const info = await reader.getMarketInfo(market);
      const oi = await reader.getOpenInterest(market, ASSET);
      const funding = await reader.getFundingRate(market, ASSET);

      // Format OI BigNumbers to human-readable
      const oiTotal = formatUnits(oi.total, decimals);
      const oiLong = formatUnits(oi.long, decimals);
      const oiShort = formatUnits(oi.short, decimals);
      const longNum = Number(oiLong);
      const shortNum = Number(oiShort);

      lines.push(`\n${market}:`);
      lines.push(`  Max Leverage: ${info.maxLeverage}x`);
      lines.push(`  Fee: ${(info.fee * 100).toFixed(3)}%`);
      lines.push(`  Open Interest: ${oiTotal} (L: ${oiLong} / S: ${oiShort})`);
      lines.push(`  Funding Rate: ${funding.toFixed(6)}%`);
      lines.push(`  Long/Short Ratio: ${longNum > 0 && shortNum > 0 ? (longNum / shortNum).toFixed(2) : "N/A"}`);
    } catch {
      lines.push(`\n${market}: data unavailable`);
    }
  }

  // Current positions
  const positions = await trader.getPositions();
  if (positions.length > 0) {
    lines.push("\nCURRENT POSITIONS:");
    for (const p of positions) {
      const d = getAssetDecimals(p.asset, MONAD_CONFIG.assets);
      lines.push(`  ${p.market} ${p.isLong ? "LONG" : "SHORT"} ${p.leverage.toFixed(1)}x | margin: ${formatUnits(p.margin, d)} | entry: $${p.price.toFixed(2)}`);
    }
  } else {
    lines.push("\nNo open positions.");
  }

  // Balance
  const balance = await trader.getBalance(ASSET);
  lines.push(`\n${ASSET} Balance: ${balance.toFixed(2)}`);

  return lines.join("\n");
}

// --- Execution ---

async function executeDecision(decision: LLMDecision) {
  console.log(`Action: ${decision.action}`);
  console.log(`Market: ${decision.market}`);
  console.log(`Reasoning: ${decision.reasoning}`);
  console.log("");

  switch (decision.action) {
    case "open_long":
    case "open_short": {
      const margin = Math.min(decision.margin || 50, MAX_MARGIN);
      const leverage = Math.min(decision.leverage || 3, MAX_LEVERAGE);
      const isLong = decision.action === "open_long";

      console.log(`Opening ${isLong ? "long" : "short"} ${decision.market} (${leverage}x, $${margin})...`);
      const receipt = await trader.submitMarketOrder({
        market: decision.market,
        isLong,
        margin,
        leverage,
        asset: ASSET,
      });
      console.log(`Done. tx: ${receipt.transactionHash}`);
      break;
    }

    case "close": {
      const positions = await trader.getPositions();
      const position = positions.find((p) => p.market === decision.market && p.asset === ASSET);
      if (position) {
        console.log(`Closing ${decision.market} position...`);
        await trader.closePosition({
          market: decision.market,
          isLong: position.isLong,
          asset: ASSET,
        });
        console.log("Closed.");
      } else {
        console.log(`No position found for ${decision.market}.`);
      }
      break;
    }

    case "hold":
      console.log("Holding. No action taken.");
      break;
  }
}

// --- Main ---

async function run() {
  console.log("Pingu LLM Trading Agent");
  console.log(`Markets: ${MARKETS.join(", ")} | Asset: ${ASSET}`);
  console.log(`Max Margin: $${MAX_MARGIN} | Max Leverage: ${MAX_LEVERAGE}x`);
  console.log(`Address: ${client.getAddress()}`);
  console.log(`Model: ${process.env.LLM_MODEL || "gpt-4o-mini"}`);
  console.log(`RPC: ${client.getCurrentRpcUrl()}`);
  console.log("");

  // Approve if needed (skip for gas tokens)
  const allowance = await trader.getAllowance(ASSET);
  if (allowance < MAX_MARGIN * 10) {
    console.log(`Approving ${ASSET}...`);
    await trader.approveAsset(ASSET);
    console.log("Approved.\n");
  }

  // Gather data and ask the LLM
  console.log("Gathering market data...\n");
  const marketData = await gatherMarketData();
  console.log(marketData);
  console.log("\nAsking LLM for decision...\n");

  const prompt = `${marketData}\n\nBased on this data, what is your trading decision? Consider funding rates, OI imbalances, and current positions. Be conservative with leverage.`;

  const llmResponse = await callLLM(prompt);
  console.log(`LLM Response: ${llmResponse}\n`);

  try {
    const decision = JSON.parse(llmResponse) as LLMDecision;
    await executeDecision(decision);
  } catch {
    console.error("Failed to parse LLM response as JSON. Raw output above.");
  }
}

run().catch(console.error);
