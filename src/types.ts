import { ethers } from "ethers";

export interface Position {
  user: string;
  asset: string;
  market: string;
  isLong: boolean;
  size: number;
  margin: number;
  fundingTracker: string;
  price: number;
  timestamp: number;
  leverage: number;
}

export interface Order {
  orderId: number;
  user: string;
  asset: string;
  market: string;
  margin: number;
  size: number;
  price: number;
  fee: number;
  isLong: boolean;
  orderType: number;
  isReduceOnly: boolean;
  timestamp: number;
  expiry: number;
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
}

export interface OIData {
  total: number;
  long: number;
  short: number;
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
  margin: number;
  size: number;
  price: number;
  fee: number;
  isLong: boolean;
  pnl?: number;
  orderId: string;
  blockNumber: number;
  timestamp: number;
  transactionHash: string;
  leverage: number;
}

export interface UserStats {
  totalTrades: number;
  totalVolume: number;
  totalPnl: number;
  winCount: number;
  lossCount: number;
  winRate: number;
}

export interface SubmitOrderParams {
  market: string;
  isLong: boolean;
  margin: number;
  leverage: number;
  asset?: string;
}

export interface SubmitLimitOrderParams extends SubmitOrderParams {
  price: number;
}

export interface ClosePositionParams {
  market: string;
  isLong: boolean;
  asset?: string;
  size?: number;
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
