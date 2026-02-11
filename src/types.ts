import { ethers } from "ethers";

export interface Position {
  user: string;
  asset: string;
  market: string;
  isLong: boolean;
  size: ethers.BigNumber;
  margin: ethers.BigNumber;
  fundingTracker: ethers.BigNumber;
  price: number;
  timestamp: ethers.BigNumber;
  leverage: number;
}

export interface Order {
  orderId: number;
  user: string;
  asset: string;
  market: string;
  margin: ethers.BigNumber;
  size: ethers.BigNumber;
  price: number;
  fee: ethers.BigNumber;
  isLong: boolean;
  orderType: number;
  isReduceOnly: boolean;
  timestamp: ethers.BigNumber;
  expiry: ethers.BigNumber;
  cancelOrderId: number;
  leverage: number;
}

export interface MarketInfo {
  market: string;
  name: string;
  category: string;
  chainlinkFeed: string;
  maxLeverage: number;
  maxDeviation: number;
  fee: number;
  liqThreshold: number;
  fundingFactor: number;
  minOrderAge: number;
  pythMaxAge: number;
  pythFeed: string;
  allowChainlinkExecution: boolean;
  isReduceOnly: boolean;
  minFactor: number;
  sampleSize: number;
}

export interface OIData {
  total: ethers.BigNumber;
  long: ethers.BigNumber;
  short: ethers.BigNumber;
}

export interface PoolBalance {
  withdrawable: number;
  locked: number;
  total: number;
}

export interface TradeHistory {
  id: string;
  type: string;
  user: string;
  asset: string;
  market: string;
  margin: ethers.BigNumber;
  size: ethers.BigNumber;
  price: number;
  fee: ethers.BigNumber;
  isLong: boolean;
  pnl?: ethers.BigNumber;
  orderId: string;
  blockNumber: number;
  timestamp: ethers.BigNumber;
  transactionHash: string;
  leverage: number;
}

export interface UserStats {
  totalTrades: number;
  totalVolume: ethers.BigNumber;
  totalPnl: ethers.BigNumber;
  winCount: number;
  lossCount: number;
  winRate: number;
}

export interface SubmitOrderParams {
  market: string;
  isLong: boolean;
  margin: number | ethers.BigNumber;
  leverage: number;
  asset?: string;
  tpPrice?: number | ethers.BigNumber;
  slPrice?: number | ethers.BigNumber;
}

export interface SubmitLimitOrderParams extends SubmitOrderParams {
  price: number | ethers.BigNumber;
}

export interface ClosePositionParams {
  market: string;
  isLong: boolean;
  asset?: string;
  size?: number | ethers.BigNumber;
}

export interface OrderTuple {
  orderId: number;
  user: string;
  asset: string;
  market: string;
  margin: ethers.BigNumber | number;
  size: ethers.BigNumber | number;
  price: ethers.BigNumber | number;
  fee: number;
  isLong: boolean;
  orderType: number;
  isReduceOnly: boolean;
  timestamp: number;
  expiry: number;
  cancelOrderId: number;
}
