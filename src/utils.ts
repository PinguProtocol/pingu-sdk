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
 * Parse string/number to BigNumber
 */
export function parseUnits(
  amount: string | number,
  decimals = 18,
): ethers.BigNumber {
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
  };
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
