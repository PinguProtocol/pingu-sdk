import { ethers } from "ethers";
import { PinguClient } from "./client";
import { BPS_DIVIDER } from "./config";
import type { MarketInfo, OIData } from "./types";
import {
  formatUnits,
  formatMarketInfo,
  getAssetAddress,
  getAssetDecimals,
} from "./utils";

// Raw market info type from contract
interface RawMarketInfo {
  name: string;
  category: string;
  chainlinkFeed: string;
  maxLeverage: ethers.BigNumber;
  maxDeviation: ethers.BigNumber;
  fee: ethers.BigNumber;
  liqThreshold: ethers.BigNumber;
  fundingFactor: ethers.BigNumber;
  minOrderAge: ethers.BigNumber;
  pythMaxAge: ethers.BigNumber;
  pythFeed: string;
  allowChainlinkExecution: boolean;
  isReduceOnly: boolean;
}

export class PinguReader {
  private client: PinguClient;

  constructor(client: PinguClient) {
    this.client = client;
  }

  async getMarkets(): Promise<MarketInfo[]> {
    try {
      const marketStore = await this.client.getContract("MarketStore");
      const marketList = (await this.client.withFallback(() =>
        marketStore.getMarketList(),
      )) as string[];
      const rawInfos = (await this.client.withFallback(() =>
        marketStore.getMany(marketList),
      )) as RawMarketInfo[];

      return marketList.map((market, i) =>
        formatMarketInfo({
          market,
          ...rawInfos[i],
        }),
      );
    } catch (error) {
      throw new Error(`Failed to get markets: ${(error as Error).message}`);
    }
  }

  async getMarketInfo(market: string): Promise<MarketInfo> {
    try {
      const marketStore = await this.client.getContract("MarketStore");
      const rawInfo = (await this.client.withFallback(() =>
        marketStore.get(market),
      )) as RawMarketInfo;
      return formatMarketInfo({ market, ...rawInfo });
    } catch (error) {
      throw new Error(`Failed to get market info: ${(error as Error).message}`);
    }
  }

  async getOpenInterest(market: string, asset = "USDC"): Promise<OIData> {
    try {
      const positionStore = await this.client.getContract("PositionStore");
      const assetAddress = getAssetAddress(asset, this.client.config.assets);
      const assetDecimals = getAssetDecimals(asset, this.client.config.assets);

      const [oi, oiLong, oiShort] = (await Promise.all([
        this.client.withFallback(() =>
          positionStore.getOI(assetAddress, market),
        ),
        this.client.withFallback(() =>
          positionStore.getOILong(assetAddress, market),
        ),
        this.client.withFallback(() =>
          positionStore.getOIShort(assetAddress, market),
        ),
      ])) as [ethers.BigNumber, ethers.BigNumber, ethers.BigNumber];

      return {
        total: Number(formatUnits(oi, assetDecimals)),
        long: Number(formatUnits(oiLong, assetDecimals)),
        short: Number(formatUnits(oiShort, assetDecimals)),
      };
    } catch (error) {
      throw new Error(
        `Failed to get open interest: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Get the last capped EMA funding rate (updated every 8h)
   */
  async getFundingRate(market: string, asset = "USDC"): Promise<number> {
    try {
      const fundingStore = await this.client.getContract("FundingStore");
      const assetAddress = getAssetAddress(asset, this.client.config.assets);

      const result = (await this.client.withFallback(() =>
        fundingStore.getLastCappedEmaFundingRate(assetAddress, market),
      )) as ethers.BigNumber;
      const formattedResult = formatUnits(result);
      return (Number(formattedResult) / BPS_DIVIDER / (365 * 3)) * 100;
    } catch (error) {
      throw new Error(
        `Failed to get funding rate: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Get real-time funding tracker (more accurate for trading strategies)
   */
  async getRealTimeFundingTracker(
    market: string,
    asset = "USDC",
  ): Promise<ethers.BigNumber> {
    try {
      const funding = await this.client.getContract("Funding");
      const assetAddress = getAssetAddress(asset, this.client.config.assets);

      return (await this.client.withFallback(() =>
        funding.getRealTimeFundingTracker(assetAddress, market),
      )) as ethers.BigNumber;
    } catch (error) {
      throw new Error(
        `Failed to get real-time funding tracker: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Get accrued funding for a position
   */
  async getAccruedFunding(
    market: string,
    size: ethers.BigNumber,
    fundingTracker: ethers.BigNumber,
    asset = "USDC",
  ): Promise<ethers.BigNumber> {
    try {
      const funding = await this.client.getContract("Funding");
      const assetAddress = getAssetAddress(asset, this.client.config.assets);

      return (await this.client.withFallback(() =>
        funding.getAccruedFunding(assetAddress, market, size, fundingTracker),
      )) as ethers.BigNumber;
    } catch (error) {
      throw new Error(
        `Failed to get accrued funding: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Get last funding update timestamp
   */
  async getLastFundingUpdate(
    market: string,
    asset = "USDC",
  ): Promise<number> {
    try {
      const fundingStore = await this.client.getContract("FundingStore");
      const assetAddress = getAssetAddress(asset, this.client.config.assets);

      const timestamp = (await this.client.withFallback(() =>
        fundingStore.getLastUpdated(assetAddress, market),
      )) as ethers.BigNumber;
      return Number(timestamp);
    } catch (error) {
      throw new Error(
        `Failed to get last funding update: ${(error as Error).message}`,
      );
    }
  }

  async getPoolBalance(asset = "USDC"): Promise<number> {
    try {
      const poolStore = await this.client.getContract("PoolStore");
      const assetAddress = getAssetAddress(asset, this.client.config.assets);
      const assetDecimals = getAssetDecimals(asset, this.client.config.assets);

      const balance = (await this.client.withFallback(() =>
        poolStore.getBalance(assetAddress),
      )) as ethers.BigNumber;
      return Number(formatUnits(balance, assetDecimals));
    } catch (error) {
      throw new Error(
        `Failed to get pool balance: ${(error as Error).message}`,
      );
    }
  }

  async getMaxPositionSize(market: string, asset = "USDC"): Promise<number> {
    try {
      const riskStore = await this.client.getContract("RiskStore");
      const assetAddress = getAssetAddress(asset, this.client.config.assets);
      const assetDecimals = getAssetDecimals(asset, this.client.config.assets);

      const maxSize = (await this.client.withFallback(() =>
        riskStore.getMaxPositionSize(market, assetAddress),
      )) as ethers.BigNumber;
      return Number(formatUnits(maxSize, assetDecimals));
    } catch (error) {
      throw new Error(
        `Failed to get max position size: ${(error as Error).message}`,
      );
    }
  }

  async getMaxOI(market: string, asset = "USDC"): Promise<number> {
    try {
      const riskStore = await this.client.getContract("RiskStore");
      const assetAddress = getAssetAddress(asset, this.client.config.assets);
      const assetDecimals = getAssetDecimals(asset, this.client.config.assets);

      const maxOI = (await this.client.withFallback(() =>
        riskStore.getMaxOI(market, assetAddress),
      )) as ethers.BigNumber;
      return Number(formatUnits(maxOI, assetDecimals));
    } catch (error) {
      throw new Error(`Failed to get max OI: ${(error as Error).message}`);
    }
  }
}
