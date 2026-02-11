import { ethers } from "ethers";
import { PinguClient } from "./client";
import { BPS_DIVIDER } from "./config";
import type { MarketInfo, OIData } from "./types";
import {
  formatUnits,
  formatMarketInfo,
  getAssetAddress,
  getAssetDecimals,
  parseContractError,
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
  minFactor: ethers.BigNumber;
  sampleSize: ethers.BigNumber;
}

export class PinguReader {
  private client: PinguClient;

  constructor(client: PinguClient) {
    this.client = client;
  }

  async getMarkets(): Promise<MarketInfo[]> {
    try {
      const result = await this.client.withFallback(async () => {
        const marketStore = await this.client.getContract("MarketStore");
        const marketList = (await marketStore.getMarketList()) as string[];
        const rawInfos = (await marketStore.getMany(marketList)) as RawMarketInfo[];
        return { marketList, rawInfos };
      });

      return result.marketList.map((market: string, i: number) =>
        formatMarketInfo({
          market,
          ...result.rawInfos[i],
        }),
      );
    } catch (error) {
      throw new Error(`Failed to get markets: ${parseContractError(error)}`);
    }
  }

  async getMarketInfo(market: string): Promise<MarketInfo> {
    try {
      const rawInfo = await this.client.withFallback(async () => {
        const marketStore = await this.client.getContract("MarketStore");
        return marketStore.get(market) as Promise<RawMarketInfo>;
      });
      return formatMarketInfo({ market, ...rawInfo });
    } catch (error) {
      throw new Error(`Failed to get market info: ${parseContractError(error)}`);
    }
  }

  /**
   * Get open interest for a market.
   * Returns raw BigNumber values in the asset's native decimals.
   */
  async getOpenInterest(market: string, asset = "USDC"): Promise<OIData> {
    try {
      const assetAddress = getAssetAddress(asset, this.client.config.assets);

      const [oiLong, oiShort] = await Promise.all([
        this.client.withFallback(async () => {
          const ps = await this.client.getContract("PositionStore");
          return ps.getOILong(assetAddress, market) as Promise<ethers.BigNumber>;
        }),
        this.client.withFallback(async () => {
          const ps = await this.client.getContract("PositionStore");
          return ps.getOIShort(assetAddress, market) as Promise<ethers.BigNumber>;
        }),
      ]);

      return {
        total: oiLong.add(oiShort),
        long: oiLong,
        short: oiShort,
      };
    } catch (error) {
      throw new Error(
        `Failed to get open interest: ${parseContractError(error)}`,
      );
    }
  }

  /**
   * Get the last capped EMA funding rate (updated every 8h).
   * Returns the funding rate as a percentage per 8-hour period.
   */
  async getFundingRate(market: string, asset = "USDC"): Promise<number> {
    try {
      const assetAddress = getAssetAddress(asset, this.client.config.assets);

      const result = await this.client.withFallback(async () => {
        const fundingStore = await this.client.getContract("FundingStore");
        return fundingStore.getLastCappedEmaFundingRate(assetAddress, market) as Promise<ethers.BigNumber>;
      });
      const formattedResult = formatUnits(result);
      return (Number(formattedResult) / BPS_DIVIDER / (365 * 3)) * 100;
    } catch (error) {
      throw new Error(
        `Failed to get funding rate: ${parseContractError(error)}`,
      );
    }
  }

  /**
   * Get real-time funding tracker (more accurate for trading strategies).
   * This is the interpolated funding tracker between on-chain updates.
   */
  async getRealTimeFundingTracker(
    market: string,
    asset = "USDC",
  ): Promise<ethers.BigNumber> {
    try {
      const assetAddress = getAssetAddress(asset, this.client.config.assets);

      return await this.client.withFallback(async () => {
        const funding = await this.client.getContract("Funding");
        return funding.getRealTimeFundingTracker(assetAddress, market) as Promise<ethers.BigNumber>;
      });
    } catch (error) {
      throw new Error(
        `Failed to get real-time funding tracker: ${parseContractError(error)}`,
      );
    }
  }

  /**
   * Get accrued funding for a market using the V2 EMA-based calculation.
   */
  async getAccruedFunding(
    market: string,
    asset = "USDC",
    intervals = 0,
  ): Promise<ethers.BigNumber> {
    try {
      const assetAddress = getAssetAddress(asset, this.client.config.assets);

      const result = await this.client.withFallback(async () => {
        const funding = await this.client.getContract("Funding");
        return funding.getAccruedFundingV2(assetAddress, market, intervals) as Promise<
          [ethers.BigNumber, ethers.BigNumber, ethers.BigNumber, ethers.BigNumber]
        >;
      });

      // First return value = accrued funding increment (V2 equivalent of V1)
      return result[0];
    } catch (error) {
      throw new Error(
        `Failed to get accrued funding: ${parseContractError(error)}`,
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
      const assetAddress = getAssetAddress(asset, this.client.config.assets);

      const timestamp = await this.client.withFallback(async () => {
        const fundingStore = await this.client.getContract("FundingStore");
        return fundingStore.getLastUpdated(assetAddress, market) as Promise<ethers.BigNumber>;
      });
      return Number(timestamp);
    } catch (error) {
      throw new Error(
        `Failed to get last funding update: ${parseContractError(error)}`,
      );
    }
  }

  async getPoolBalance(asset = "USDC"): Promise<number> {
    try {
      const assetAddress = getAssetAddress(asset, this.client.config.assets);
      const assetDecimals = getAssetDecimals(asset, this.client.config.assets);

      const balance = await this.client.withFallback(async () => {
        const poolStore = await this.client.getContract("PoolStore");
        return poolStore.getBalance(assetAddress) as Promise<ethers.BigNumber>;
      });
      return Number(formatUnits(balance, assetDecimals));
    } catch (error) {
      throw new Error(
        `Failed to get pool balance: ${parseContractError(error)}`,
      );
    }
  }

  async getMaxPositionSize(market: string, asset = "USDC"): Promise<number> {
    try {
      const assetAddress = getAssetAddress(asset, this.client.config.assets);
      const assetDecimals = getAssetDecimals(asset, this.client.config.assets);

      const maxSize = await this.client.withFallback(async () => {
        const riskStore = await this.client.getContract("RiskStore");
        return riskStore.getMaxPositionSize(market, assetAddress) as Promise<ethers.BigNumber>;
      });
      return Number(formatUnits(maxSize, assetDecimals));
    } catch (error) {
      throw new Error(
        `Failed to get max position size: ${parseContractError(error)}`,
      );
    }
  }

  async getMaxOI(market: string, asset = "USDC"): Promise<number> {
    try {
      const assetAddress = getAssetAddress(asset, this.client.config.assets);
      const assetDecimals = getAssetDecimals(asset, this.client.config.assets);

      const maxOI = await this.client.withFallback(async () => {
        const riskStore = await this.client.getContract("RiskStore");
        return riskStore.getMaxOI(market, assetAddress) as Promise<ethers.BigNumber>;
      });
      return Number(formatUnits(maxOI, assetDecimals));
    } catch (error) {
      throw new Error(`Failed to get max OI: ${parseContractError(error)}`);
    }
  }

  /**
   * Get global unrealized profit/loss for a given asset.
   */
  async getGlobalUPL(asset = "USDC"): Promise<ethers.BigNumber> {
    try {
      const assetAddress = getAssetAddress(asset, this.client.config.assets);

      return await this.client.withFallback(async () => {
        const pool = await this.client.getContract("Pool");
        return pool.getGlobalUPL(assetAddress) as Promise<ethers.BigNumber>;
      });
    } catch (error) {
      throw new Error(
        `Failed to get global UPL: ${parseContractError(error)}`,
      );
    }
  }

  /**
   * Compute profit & loss for a position on-chain via Positions.getPnL.
   */
  async getPnL(
    market: string,
    isLong: boolean,
    currentPrice: ethers.BigNumber,
    positionPrice: ethers.BigNumber,
    size: ethers.BigNumber,
    fundingTracker: ethers.BigNumber,
    asset = "USDC",
  ): Promise<{ pnl: ethers.BigNumber; fundingFee: ethers.BigNumber }> {
    try {
      const assetAddress = getAssetAddress(asset, this.client.config.assets);

      const result = await this.client.withFallback(async () => {
        const positions = await this.client.getContract("Positions");
        return positions.getPnL(
          assetAddress,
          market,
          isLong,
          currentPrice,
          positionPrice,
          size,
          fundingTracker,
        ) as Promise<[ethers.BigNumber, ethers.BigNumber]>;
      });

      return {
        pnl: result[0],
        fundingFee: result[1],
      };
    } catch (error) {
      throw new Error(`Failed to get PnL: ${parseContractError(error)}`);
    }
  }
}
