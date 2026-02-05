import { ethers } from "ethers";
import { PinguClient } from "./client";
import type {
  Position,
  Order,
  SubmitOrderParams,
  SubmitLimitOrderParams,
  ClosePositionParams,
} from "./types";
import {
  parseUnits,
  formatUnits,
  createOrderTuple,
  getAssetAddress,
  getAssetDecimals,
  getAssetNameByAddress,
  getAssetDecimalsByAddress,
  isGasToken,
  addGasBuffer,
  calculateLeverage,
} from "./utils";

// Pyth Hermes endpoint for price updates
const PYTH_HERMES_URL = "https://hermes.pyth.network";

// Raw position type from contract
interface RawPosition {
  user: string;
  asset: string;
  market: string;
  isLong: boolean;
  size: ethers.BigNumber;
  margin: ethers.BigNumber;
  fundingTracker: ethers.BigNumber;
  price: ethers.BigNumber;
  timestamp: ethers.BigNumber;
}

// Raw order type from contract
interface RawOrder {
  orderId: ethers.BigNumber;
  user: string;
  asset: string;
  market: string;
  margin: ethers.BigNumber;
  size: ethers.BigNumber;
  price: ethers.BigNumber;
  fee: ethers.BigNumber;
  isLong: boolean;
  orderType: number;
  isReduceOnly: boolean;
  timestamp: ethers.BigNumber;
  expiry: ethers.BigNumber;
  cancelOrderId: ethers.BigNumber;
}

export class PinguTrader {
  private client: PinguClient;

  constructor(client: PinguClient) {
    this.client = client;
  }

  private requireSigner(): void {
    if (!this.client.signer) {
      throw new Error(
        "Signer required for trading. Provide a privateKey to PinguClient.",
      );
    }
  }

  async submitMarketOrder(
    params: SubmitOrderParams,
  ): Promise<ethers.providers.TransactionReceipt> {
    this.requireSigner();

    const asset = params.asset || "USDC";
    const assetAddress = getAssetAddress(asset, this.client.config.assets);
    const assetDecimals = getAssetDecimals(asset, this.client.config.assets);

    // Parse margin as BigNumber
    const _margin = parseUnits(params.margin.toString(), assetDecimals);
    // Calculate size = margin * leverage using BigNumber
    const _size = _margin.mul(Math.floor(params.leverage));

    const orderTuple = createOrderTuple({
      market: params.market,
      asset: assetAddress,
      isLong: params.isLong,
      margin: _margin,
      size: _size,
      price: 0,
      orderType: 0,
      isReduceOnly: false,
    });

    let value = ethers.BigNumber.from(0);
    if (isGasToken(asset, this.client.config.assets)) {
      value = _margin;
    }

    try {
      const contract = await this.client.getContract("Orders", true);
      const gas = await contract.estimateGas.submitSimpleOrders(
        [orderTuple],
        [],
        { value },
      );
      const tx = await contract.submitSimpleOrders([orderTuple], [], {
        value,
        gasLimit: addGasBuffer(gas),
      });

      return tx.wait();
    } catch (error) {
      throw new Error(
        `Failed to submit market order: ${(error as Error).message}`,
      );
    }
  }

  async submitLimitOrder(
    params: SubmitLimitOrderParams,
  ): Promise<ethers.providers.TransactionReceipt> {
    this.requireSigner();

    const asset = params.asset || "USDC";
    const assetAddress = getAssetAddress(asset, this.client.config.assets);
    const assetDecimals = getAssetDecimals(asset, this.client.config.assets);

    // Parse margin as BigNumber
    const _margin = parseUnits(params.margin.toString(), assetDecimals);
    // Calculate size = margin * leverage using BigNumber
    const _size = _margin.mul(Math.floor(params.leverage));
    const _price = parseUnits(params.price.toString(), 18);

    // orderType: 1 = limit, 2 = stop
    const orderType = 1;

    const orderTuple = createOrderTuple({
      market: params.market,
      asset: assetAddress,
      isLong: params.isLong,
      margin: _margin,
      size: _size,
      price: _price,
      orderType,
      isReduceOnly: false,
    });

    let value = ethers.BigNumber.from(0);
    if (isGasToken(asset, this.client.config.assets)) {
      value = _margin;
    }

    try {
      const contract = await this.client.getContract("Orders", true);
      const gas = await contract.estimateGas.submitSimpleOrders(
        [orderTuple],
        [],
        { value },
      );
      const tx = await contract.submitSimpleOrders([orderTuple], [], {
        value,
        gasLimit: addGasBuffer(gas),
      });

      return tx.wait();
    } catch (error) {
      throw new Error(
        `Failed to submit limit order: ${(error as Error).message}`,
      );
    }
  }

  async closePosition(
    params: ClosePositionParams,
  ): Promise<ethers.providers.TransactionReceipt> {
    this.requireSigner();

    const asset = params.asset || "USDC";
    const assetAddress = getAssetAddress(asset, this.client.config.assets);
    const assetDecimals = getAssetDecimals(asset, this.client.config.assets);

    let _size: ethers.BigNumber;

    if (params.size) {
      _size = parseUnits(params.size.toString(), assetDecimals);
    } else {
      // Full close: read user positions to get current size
      const positions = await this.getPositionsRaw();
      const position = positions.find(
        (p) => p.market === params.market && p.isLong === params.isLong,
      );
      if (!position) {
        throw new Error(
          `No ${params.isLong ? "long" : "short"} position found for ${params.market}`,
        );
      }
      _size = position.sizeRaw;
    }

    const orderTuple = createOrderTuple({
      market: params.market,
      asset: assetAddress,
      isLong: params.isLong,
      margin: ethers.BigNumber.from(0),
      size: _size,
      price: 0,
      orderType: 0,
      isReduceOnly: true,
    });

    try {
      const contract = await this.client.getContract("Orders", true);
      const gas = await contract.estimateGas.submitSimpleOrders(
        [orderTuple],
        [],
      );
      const tx = await contract.submitSimpleOrders([orderTuple], [], {
        gasLimit: addGasBuffer(gas),
      });

      return tx.wait();
    } catch (error) {
      throw new Error(
        `Failed to close position: ${(error as Error).message}`,
      );
    }
  }

  async cancelOrder(
    orderId: number,
  ): Promise<ethers.providers.TransactionReceipt> {
    this.requireSigner();

    try {
      const contract = await this.client.getContract("Orders", true);
      const gas = await contract.estimateGas.cancelOrder(orderId);
      const tx = await contract.cancelOrder(orderId, {
        gasLimit: addGasBuffer(gas),
      });

      return tx.wait();
    } catch (error) {
      throw new Error(`Failed to cancel order: ${(error as Error).message}`);
    }
  }

  async cancelOrders(
    orderIds: number[],
  ): Promise<ethers.providers.TransactionReceipt> {
    this.requireSigner();

    try {
      const contract = await this.client.getContract("Orders", true);
      const gas = await contract.estimateGas.cancelOrders(orderIds);
      const tx = await contract.cancelOrders(orderIds, {
        gasLimit: addGasBuffer(gas),
      });

      return tx.wait();
    } catch (error) {
      throw new Error(`Failed to cancel orders: ${(error as Error).message}`);
    }
  }

  async addMargin(
    market: string,
    amount: number,
    asset = "USDC",
  ): Promise<ethers.providers.TransactionReceipt> {
    this.requireSigner();

    const assetAddress = getAssetAddress(asset, this.client.config.assets);
    const assetDecimals = getAssetDecimals(asset, this.client.config.assets);
    const margin = parseUnits(amount.toString(), assetDecimals);

    let value = ethers.BigNumber.from(0);
    if (isGasToken(asset, this.client.config.assets)) {
      value = margin;
    }

    try {
      const contract = await this.client.getContract("Positions", true);
      const gas = await contract.estimateGas.addMargin(
        assetAddress,
        market,
        margin,
        { value },
      );
      const tx = await contract.addMargin(assetAddress, market, margin, {
        value,
        gasLimit: addGasBuffer(gas),
      });

      return tx.wait();
    } catch (error) {
      throw new Error(`Failed to add margin: ${(error as Error).message}`);
    }
  }

  /**
   * Remove margin from a position
   * Requires Pyth price update data
   */
  async removeMargin(
    market: string,
    amount: number,
    asset = "USDC",
  ): Promise<ethers.providers.TransactionReceipt> {
    this.requireSigner();

    const assetAddress = getAssetAddress(asset, this.client.config.assets);
    const assetDecimals = getAssetDecimals(asset, this.client.config.assets);
    const margin = parseUnits(amount.toString(), assetDecimals);

    // Get market info for Pyth feed
    const marketStore = await this.client.getContract("MarketStore");
    const marketInfo = await marketStore.get(market);
    const pythFeed = marketInfo.pythFeed;

    // Fetch price update from Pyth Hermes
    const priceUpdateData = await this.fetchPythPriceUpdate(pythFeed);

    try {
      const contract = await this.client.getContract("Positions", true);
      const gas = await contract.estimateGas.removeMargin(
        assetAddress,
        market,
        margin,
        priceUpdateData,
        { value: 1 }, // Pyth update fee
      );
      const tx = await contract.removeMargin(
        assetAddress,
        market,
        margin,
        priceUpdateData,
        {
          value: 1,
          gasLimit: addGasBuffer(gas),
        },
      );

      return tx.wait();
    } catch (error) {
      throw new Error(`Failed to remove margin: ${(error as Error).message}`);
    }
  }

  /**
   * Fetch price update data from Pyth Hermes
   */
  private async fetchPythPriceUpdate(pythFeed: string): Promise<string[]> {
    try {
      const feedId = pythFeed.startsWith("0x") ? pythFeed.slice(2) : pythFeed;
      const url = `${PYTH_HERMES_URL}/api/latest_vaas?ids[]=${feedId}`;
      const response = await fetch(url);
      const data = (await response.json()) as string[];
      return data.map((vaa) => `0x${Buffer.from(vaa, "base64").toString("hex")}`);
    } catch (error) {
      throw new Error(
        `Failed to fetch Pyth price update: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Get raw positions with BigNumber values
   */
  private async getPositionsRaw(): Promise<
    Array<{
      user: string;
      asset: string;
      market: string;
      isLong: boolean;
      sizeRaw: ethers.BigNumber;
      marginRaw: ethers.BigNumber;
      fundingTracker: ethers.BigNumber;
      priceRaw: ethers.BigNumber;
      timestamp: ethers.BigNumber;
    }>
  > {
    const userAddress = this.client.getAddress();
    const positionStore = await this.client.getContract("PositionStore");

    try {
      const rawPositions = (await this.client.withFallback(() =>
        positionStore.getUserPositions(userAddress),
      )) as RawPosition[];

      return rawPositions
        .filter((p) => !p.size.isZero())
        .map((p) => ({
          user: p.user,
          asset: p.asset,
          market: p.market,
          isLong: p.isLong,
          sizeRaw: p.size,
          marginRaw: p.margin,
          fundingTracker: p.fundingTracker,
          priceRaw: p.price,
          timestamp: p.timestamp,
        }));
    } catch (error) {
      throw new Error(`Failed to get positions: ${(error as Error).message}`);
    }
  }

  async getPositions(address?: string): Promise<Position[]> {
    const userAddress = address || this.client.getAddress();
    const positionStore = await this.client.getContract("PositionStore");
    const assets = this.client.config.assets;

    try {
      const rawPositions = (await this.client.withFallback(() =>
        positionStore.getUserPositions(userAddress),
      )) as RawPosition[];

      return rawPositions
        .filter((p) => !p.size.isZero())
        .map((p) => {
          const decimals = getAssetDecimalsByAddress(p.asset, assets);
          const assetName = getAssetNameByAddress(p.asset, assets) || p.asset;

          return {
            user: p.user,
            asset: assetName,
            market: p.market,
            isLong: p.isLong,
            size: Number(formatUnits(p.size, decimals)),
            margin: Number(formatUnits(p.margin, decimals)),
            fundingTracker: p.fundingTracker.toString(),
            price: Number(formatUnits(p.price, 18)),
            timestamp: Number(p.timestamp),
            leverage: calculateLeverage(p.size, p.margin),
          };
        });
    } catch (error) {
      throw new Error(`Failed to get positions: ${(error as Error).message}`);
    }
  }

  async getOrders(address?: string): Promise<Order[]> {
    const userAddress = address || this.client.getAddress();
    const orderStore = await this.client.getContract("OrderStore");
    const assets = this.client.config.assets;

    try {
      const rawOrders = (await this.client.withFallback(() =>
        orderStore.getUserOrders(userAddress),
      )) as RawOrder[];

      return rawOrders.map((o) => {
        const decimals = getAssetDecimalsByAddress(o.asset, assets);
        const assetName = getAssetNameByAddress(o.asset, assets) || o.asset;

        return {
          orderId: Number(o.orderId),
          user: o.user,
          asset: assetName,
          market: o.market,
          margin: Number(formatUnits(o.margin, decimals)),
          size: Number(formatUnits(o.size, decimals)),
          price: Number(formatUnits(o.price, 18)),
          fee: Number(formatUnits(o.fee, decimals)),
          isLong: o.isLong,
          orderType: o.orderType,
          isReduceOnly: o.isReduceOnly,
          timestamp: Number(o.timestamp),
          expiry: Number(o.expiry),
          cancelOrderId: Number(o.cancelOrderId),
          leverage: calculateLeverage(o.size, o.margin),
        };
      });
    } catch (error) {
      throw new Error(`Failed to get orders: ${(error as Error).message}`);
    }
  }

  async getBalance(asset = "USDC"): Promise<number> {
    const userAddress = this.client.getAddress();
    const assetAddress = getAssetAddress(asset, this.client.config.assets);
    const assetDecimals = getAssetDecimals(asset, this.client.config.assets);

    try {
      if (isGasToken(asset, this.client.config.assets)) {
        const balance = (await this.client.withFallback(() =>
          this.client.provider.getBalance(userAddress),
        )) as ethers.BigNumber;
        return Number(formatUnits(balance, assetDecimals));
      }

      const erc20 = this.client.getErc20Contract(assetAddress);
      const balance = (await this.client.withFallback(() =>
        erc20.balanceOf(userAddress),
      )) as ethers.BigNumber;
      return Number(formatUnits(balance, assetDecimals));
    } catch (error) {
      throw new Error(`Failed to get balance: ${(error as Error).message}`);
    }
  }

  async getAllowance(asset = "USDC"): Promise<number> {
    const userAddress = this.client.getAddress();
    const assetAddress = getAssetAddress(asset, this.client.config.assets);
    const assetDecimals = getAssetDecimals(asset, this.client.config.assets);

    if (isGasToken(asset, this.client.config.assets)) {
      return Infinity;
    }

    try {
      const ordersAddress = await this.client.getContractAddress("Orders");
      const erc20 = this.client.getErc20Contract(assetAddress);
      const allowance = (await this.client.withFallback(() =>
        erc20.allowance(userAddress, ordersAddress),
      )) as ethers.BigNumber;
      return Number(formatUnits(allowance, assetDecimals));
    } catch (error) {
      throw new Error(`Failed to get allowance: ${(error as Error).message}`);
    }
  }

  /**
   * Approve asset spending for Orders contract
   */
  async approveAsset(
    asset = "USDC",
    amount?: ethers.BigNumber,
  ): Promise<ethers.providers.TransactionReceipt> {
    this.requireSigner();

    const assetAddress = getAssetAddress(asset, this.client.config.assets);

    if (isGasToken(asset, this.client.config.assets)) {
      throw new Error("Cannot approve gas token");
    }

    try {
      const ordersAddress = await this.client.getContractAddress("Orders");
      const erc20 = this.client.getErc20Contract(assetAddress, true);

      const approveAmount = amount || ethers.constants.MaxUint256;
      const gas = await erc20.estimateGas.approve(ordersAddress, approveAmount);
      const tx = await erc20.approve(ordersAddress, approveAmount, {
        gasLimit: addGasBuffer(gas),
      });
      return tx.wait();
    } catch (error) {
      throw new Error(`Failed to approve asset: ${(error as Error).message}`);
    }
  }

  /**
   * Approve USDC spending (convenience method)
   */
  async approveUSDC(
    amount?: ethers.BigNumber,
  ): Promise<ethers.providers.TransactionReceipt> {
    return this.approveAsset("USDC", amount);
  }
}
