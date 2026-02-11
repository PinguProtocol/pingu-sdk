import { ethers } from "ethers";
import { ADDRESS_ZERO, BPS_DIVIDER } from "./config";
import type { AssetConfig } from "./config";
import type { OrderTuple, MarketInfo } from "./types";

/**
 * Format BigNumber to string, avoiding scientific notation
 */
export function formatUnits(
  amount: ethers.BigNumberish,
  decimals = 18,
): string {
  if (!amount) return "0";
  return ethers.utils.formatUnits(amount, decimals);
}

/**
 * Parse string/number/BigNumber to BigNumber.
 * If amount is already a BigNumber, it is returned as-is (assumed already in
 * the correct raw-unit representation).
 */
export function parseUnits(
  amount: string | number | ethers.BigNumber,
  decimals = 18,
): ethers.BigNumber {
  // Already a BigNumber → return as-is
  if (ethers.BigNumber.isBigNumber(amount)) return amount;

  if (!amount || (typeof amount === "number" && isNaN(amount))) amount = "0";
  if (typeof amount === "number") {
    // Avoid scientific notation by using toFixed
    amount = amount.toFixed(decimals);
  }
  return ethers.utils.parseUnits(amount, decimals);
}

/**
 * Format BigNumber to display string, avoiding scientific notation
 * Use this for displaying numbers to users
 */
export function formatBigNumberForDisplay(
  bn: ethers.BigNumber,
  decimals: number,
  displayDecimals = 6,
): string {
  const formatted = ethers.utils.formatUnits(bn, decimals);
  const num = parseFloat(formatted);
  // Use toFixed to avoid scientific notation like 1.72872e3
  return num.toFixed(displayDecimals);
}

/**
 * Safe division for BigNumbers, returns 0 if divisor is 0
 */
export function safeDivBN(
  numerator: ethers.BigNumber,
  denominator: ethers.BigNumber,
): ethers.BigNumber {
  if (denominator.isZero()) return ethers.BigNumber.from(0);
  return numerator.div(denominator);
}

/**
 * Calculate leverage from size and margin BigNumbers
 * Returns a number with 3 decimal precision
 */
export function calculateLeverage(
  size: ethers.BigNumber,
  margin: ethers.BigNumber,
): number {
  if (margin.isZero()) return 0;
  // Multiply by 1000 first for precision, then divide
  const leverageScaled = size.mul(1000).div(margin);
  return leverageScaled.toNumber() / 1000;
}

/**
 * Multiply gas limit by 1.2 for safety buffer
 */
export function addGasBuffer(gasEstimate: ethers.BigNumber): ethers.BigNumber {
  return gasEstimate.mul(12).div(10);
}

export function createOrderTuple(params: {
  asset: string;
  market: string;
  isLong: boolean;
  margin: ethers.BigNumber | number;
  size: ethers.BigNumber | number;
  price?: ethers.BigNumber | number;
  fee?: number;
  orderType?: number;
  isReduceOnly?: boolean;
  expiry?: number;
  cancelOrderId?: number;
}): OrderTuple {
  return {
    orderId: 0,
    user: ADDRESS_ZERO,
    asset: params.asset,
    market: params.market,
    margin: params.margin,
    size: params.size,
    price: params.price || 0,
    fee: params.fee || 0,
    isLong: params.isLong,
    orderType: params.orderType || 0,
    isReduceOnly: params.isReduceOnly || false,
    timestamp: 0,
    expiry: params.expiry || 0,
    cancelOrderId: params.cancelOrderId || 0,
  };
}

export function formatMarketInfo(rawMarketInfo: {
  market: string;
  name: string;
  category: string;
  chainlinkFeed: string;
  maxLeverage: ethers.BigNumberish;
  maxDeviation: ethers.BigNumberish;
  fee: ethers.BigNumberish;
  liqThreshold: ethers.BigNumberish;
  fundingFactor: ethers.BigNumberish;
  minOrderAge: ethers.BigNumberish;
  pythMaxAge: ethers.BigNumberish;
  pythFeed: string;
  allowChainlinkExecution: boolean;
  isReduceOnly: boolean;
  minFactor: ethers.BigNumberish;
  sampleSize: ethers.BigNumberish;
}): MarketInfo {
  return {
    market: rawMarketInfo.market,
    name: rawMarketInfo.name,
    category: rawMarketInfo.category,
    chainlinkFeed: rawMarketInfo.chainlinkFeed,
    maxLeverage: Number(rawMarketInfo.maxLeverage),
    maxDeviation:
      Number(formatUnits(rawMarketInfo.maxDeviation, 0)) / BPS_DIVIDER,
    fee: Number(formatUnits(rawMarketInfo.fee, 0)) / BPS_DIVIDER,
    liqThreshold:
      Number(formatUnits(rawMarketInfo.liqThreshold, 0)) / BPS_DIVIDER,
    fundingFactor:
      Number(formatUnits(rawMarketInfo.fundingFactor, 0)) / BPS_DIVIDER,
    minOrderAge: Number(rawMarketInfo.minOrderAge),
    pythMaxAge: Number(rawMarketInfo.pythMaxAge),
    pythFeed: rawMarketInfo.pythFeed,
    allowChainlinkExecution: rawMarketInfo.allowChainlinkExecution,
    isReduceOnly: rawMarketInfo.isReduceOnly,
    minFactor: Number(rawMarketInfo.minFactor),
    sampleSize: Number(rawMarketInfo.sampleSize),
  };
}

/**
 * Map of Solidity revert reason codes to human-readable error messages
 */
const REVERT_MESSAGES: Record<string, string> = {
  "!paused": "New orders are currently paused",
  "!order-type": "Invalid order type (must be 0=market, 1=limit, 2=stop)",
  "!price": "Price must be > 0 for limit/stop orders",
  "!asset-exists": "Asset is not supported by the protocol",
  "!min-size": "Order size is below minimum for this asset",
  "!market-exists": "Market does not exist",
  "!expiry-value": "Order expiry must be in the future",
  "!max-expiry": "Order expiry exceeds maximum TTL",
  "!user-oco": "Cannot cancel another user's order",
  "!market-reduce-only": "This market only accepts reduce-only orders",
  "!margin": "Invalid margin amount",
  "!min-leverage": "Leverage is below minimum (1x)",
  "!max-leverage": "Leverage exceeds the maximum allowed for this market",
  "!order": "Order does not exist",
  "!user": "Not the order owner",
  "!max-oi": "Maximum open interest reached for this market",
  "!max-delta": "Maximum long/short delta reached for this market",
  "!position": "No position found for this user/asset/market",
  "!pnl-positive": "Position must be in profit to use closePositionWithoutProfit",
  "!max-age": "Pyth price data is too old, try again",
  "!upl": "Unrealized loss too high to remove this much margin",
  "!pool-risk": "Pool drawdown limit reached",
  "!max-position-size": "Maximum position size reached",
  "!asset": "Asset is not supported",
  "!amount": "Amount must be greater than 0",
  "!tax": "Deposit/withdrawal tax too high, operation blocked",
  "!empty": "Pool is empty",
  "!locked-amount": "Insufficient unlocked balance for withdrawal",
  "!payout-period": "Buffer payout period not configured",
  "!pool-balance": "Insufficient pool balance",
  "!tp-invalid": "Take profit price is invalid for this direction",
  "!sl-invalid": "Stop loss price is invalid for this direction",
  "!tpsl-invalid": "TP and SL prices are invalid relative to each other",
  "!unauthorized": "Unauthorized caller",
};

/**
 * Parse a contract error and return a human-readable message.
 * Maps Solidity revert reasons (e.g. "!margin") to clear descriptions.
 */
export function parseContractError(error: unknown): string {
  const err = error as Record<string, unknown>;
  const raw =
    (err?.error as Record<string, unknown>)?.reason as string ||
    (err?.reason as string) ||
    (err?.message as string) ||
    String(error);

  // Try to extract the revert reason code from "execution reverted: !xxx"
  const revertMatch = raw.match(/execution reverted:\s*(.+)/i);
  if (revertMatch) {
    const code = revertMatch[1].trim().replace(/^'|'$/g, "");
    const mapped = REVERT_MESSAGES[code];
    if (mapped) return `${mapped} (${code})`;
    return code;
  }

  // Try to find a known "!xxx" code anywhere in the message
  for (const [code, msg] of Object.entries(REVERT_MESSAGES)) {
    if (raw.includes(code)) {
      return `${msg} (${code})`;
    }
  }

  return raw;
}

/**
 * Detect whether an error is a known EVM revert (with a reason string).
 * These are legitimate contract errors, not RPC infrastructure failures.
 */
export function isKnownEvmRevert(error: unknown): boolean {
  const err = error as Record<string, unknown>;
  const code = err?.code as string | undefined;
  const reason =
    (err?.error as Record<string, unknown>)?.reason as string ||
    (err?.reason as string) ||
    (err?.message as string) ||
    "";

  // ethers CALL_EXCEPTION = contract call reverted with data
  if (code === "CALL_EXCEPTION") return true;

  // Explicit "execution reverted" with a reason string
  if (/execution reverted:\s*!/.test(reason)) return true;

  // UNPREDICTABLE_GAS_LIMIT when estimateGas encounters a revert
  if (code === "UNPREDICTABLE_GAS_LIMIT" && /revert/i.test(reason)) return true;

  // Any known "!xxx" revert code in the message
  for (const revertCode of Object.keys(REVERT_MESSAGES)) {
    if (reason.includes(revertCode)) return true;
  }

  return false;
}

export function getAssetAddress(
  assetName: string,
  assets: Record<string, AssetConfig>,
): string {
  const asset = assets[assetName];
  if (!asset) {
    throw new Error(
      `Unknown asset: ${assetName}. Available: ${Object.keys(assets).join(", ")}`,
    );
  }
  return asset.address;
}

export function getAssetDecimals(
  assetName: string,
  assets: Record<string, AssetConfig>,
): number {
  const asset = assets[assetName];
  if (!asset) {
    throw new Error(
      `Unknown asset: ${assetName}. Available: ${Object.keys(assets).join(", ")}`,
    );
  }
  return asset.decimals;
}

export function getAssetNameByAddress(
  address: string,
  assets: Record<string, AssetConfig>,
): string | undefined {
  const entry = Object.entries(assets).find(
    ([, config]) => config.address.toLowerCase() === address.toLowerCase(),
  );
  return entry?.[0];
}

export function getAssetDecimalsByAddress(
  address: string,
  assets: Record<string, AssetConfig>,
): number {
  const entry = Object.entries(assets).find(
    ([, config]) => config.address.toLowerCase() === address.toLowerCase(),
  );
  if (!entry) return address === ADDRESS_ZERO ? 18 : 6;
  return entry[1].decimals;
}

export function isGasToken(
  assetName: string,
  assets: Record<string, AssetConfig>,
): boolean {
  const asset = assets[assetName];
  return asset?.isGasToken === true;
}

/**
 * Get the minimum position size (in raw token units) for an asset.
 * This corresponds to `AssetStore.Asset.minSize` on-chain.
 */
export function getAssetMinSize(
  assetName: string,
  assets: Record<string, AssetConfig>,
): number {
  const asset = assets[assetName];
  if (!asset) {
    throw new Error(
      `Unknown asset: ${assetName}. Available: ${Object.keys(assets).join(", ")}`,
    );
  }
  return asset.minSize;
}
