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
  getAssetMinSize,
  getAssetNameByAddress,
  getAssetDecimalsByAddress,
  isGasToken,
  addGasBuffer,
  calculateLeverage,
  parseContractError,
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

  /**
   * Compute position size from margin and leverage, capped to maxLeverage.
   *
   * 1. Caps leverage to maxLeverage so the user can never exceed it.
   * 2. Uses floor rounding (10-decimal precision) so the effective leverage
   *    is always ≤ the desired value.
   * 3. Double-checks with the exact on-chain formula:
   *      onChainLeverage = UNIT × size / margin
   *    If it still exceeds maxLeverage × UNIT (e.g. due to edge-case rounding),
   *    size is reduced by 1 wei — negligible but prevents a revert.
   *
   * @param margin - Margin amount as BigNumber (in asset decimals)
   * @param leverage - Desired leverage (e.g. 2.25)
   * @param maxLeverage - Market's maximum leverage (integer, from MarketStore)
   * @returns size as BigNumber
   */
  private computeSize(
    margin: ethers.BigNumber,
    leverage: number,
    maxLeverage: number,
  ): ethers.BigNumber {
    // 1. Cap leverage to maxLeverage
    const cappedLeverage = Math.min(leverage, maxLeverage);

    // 2. Floor to 10 decimals to avoid floating-point overflows
    const SCALE = 10_000_000_000;
    const leverageScaled = Math.floor(cappedLeverage * SCALE);
    let size = margin.mul(leverageScaled).div(SCALE);

    // 3. Safety: reproduce the exact on-chain leverage check
    //    Contract: leverage = (UNIT * size) / margin
    //              require(leverage <= maxLeverage * UNIT, "!max-leverage")
    if (!margin.isZero() && !size.isZero()) {
      const UNIT = ethers.constants.WeiPerEther;
      const maxLevBN = ethers.BigNumber.from(maxLeverage).mul(UNIT);
      const onChainLev = UNIT.mul(size).div(margin);

      if (onChainLev.gt(maxLevBN)) {
        // Hard cap: size = margin × maxLeverage
        size = margin.mul(maxLeverage);

        // Final safety: if integer division still overflows, subtract 1 wei
        const recheck = UNIT.mul(size).div(margin);
        if (recheck.gt(maxLevBN)) {
          size = size.sub(1);
        }
      }
    }

    return size;
  }

  /**
   * Submit a market order (orderType = 0).
   * Optionally attach take-profit and/or stop-loss orders in the same transaction.
   *
   * When `tpPrice` / `slPrice` are provided, additional reduce-only orders are
   * submitted alongside the main order via `submitSimpleOrders`. These TP/SL
   * orders are independent and will NOT auto-cancel each other (unlike the
   * contract's `submitOrder` which links them via cancelOrderId).
   */
  async submitMarketOrder(
    params: SubmitOrderParams,
  ): Promise<ethers.providers.TransactionReceipt> {
    this.requireSigner();

    const asset = params.asset || "USDC";
    const assetAddress = getAssetAddress(asset, this.client.config.assets);
    const assetDecimals = getAssetDecimals(asset, this.client.config.assets);

    // Fetch market maxLeverage to cap size and prevent revert
    const marketInfo = await this.client.withFallback(async () => {
      const ms = await this.client.getContract("MarketStore");
      return ms.get(params.market) as Promise<{
        maxLeverage: ethers.BigNumber;
        fee: ethers.BigNumber;
      }>;
    });
    const maxLeverage = Number(marketInfo.maxLeverage);

    const _margin = parseUnits(params.margin, assetDecimals);
    const _size = this.computeSize(_margin, params.leverage, maxLeverage);

    // Validate minimum size (from AssetStore)
    const minSize = getAssetMinSize(asset, this.client.config.assets);
    if (_size.lt(minSize)) {
      throw new Error(
        `Order size ${_size.toString()} is below the minimum size ${minSize} for ${asset} (!min-size)`,
      );
    }

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

    // Build array of orders (main + optional TP/SL)
    const orders = [orderTuple];

    if (params.tpPrice) {
      orders.push(
        createOrderTuple({
          market: params.market,
          asset: assetAddress,
          isLong: !params.isLong,
          margin: ethers.BigNumber.from(0),
          size: _size,
          price: parseUnits(params.tpPrice, 18),
          orderType: 1, // limit
          isReduceOnly: true,
        }),
      );
    }

    if (params.slPrice) {
      orders.push(
        createOrderTuple({
          market: params.market,
          asset: assetAddress,
          isLong: !params.isLong,
          margin: ethers.BigNumber.from(0),
          size: _size,
          price: parseUnits(params.slPrice, 18),
          orderType: 2, // stop
          isReduceOnly: true,
        }),
      );
    }

    let value = ethers.BigNumber.from(0);
    if (isGasToken(asset, this.client.config.assets)) {
      // Gas token: msg.value must cover margin + fee (TP/SL are reduce-only, no fee upfront)
      // Fee computed without referral discount — any excess is refunded by the contract
      const fee = _size.mul(marketInfo.fee).div(10000);
      value = _margin.add(fee);
    }

    try {
      return await this.client.withFallback(async () => {
        const contract = await this.client.getContract("Orders", true);
        const gas = await contract.estimateGas.submitSimpleOrders(
          orders,
          [],
          { value },
        );
        const tx = await contract.submitSimpleOrders(orders, [], {
          value,
          gasLimit: addGasBuffer(gas),
        });
        return tx.wait();
      });
    } catch (error) {
      throw new Error(
        `Failed to submit market order: ${parseContractError(error)}`,
      );
    }
  }

  /**
   * Submit a limit order (orderType = 1).
   * Optionally attach take-profit and/or stop-loss orders in the same transaction.
   *
   * When `tpPrice` / `slPrice` are provided, additional reduce-only orders are
   * submitted alongside the main order via `submitSimpleOrders`.
   */
  async submitLimitOrder(
    params: SubmitLimitOrderParams,
  ): Promise<ethers.providers.TransactionReceipt> {
    this.requireSigner();

    const asset = params.asset || "USDC";
    const assetAddress = getAssetAddress(asset, this.client.config.assets);
    const assetDecimals = getAssetDecimals(asset, this.client.config.assets);

    // Fetch market maxLeverage to cap size and prevent revert
    const marketInfo = await this.client.withFallback(async () => {
      const ms = await this.client.getContract("MarketStore");
      return ms.get(params.market) as Promise<{
        maxLeverage: ethers.BigNumber;
        fee: ethers.BigNumber;
      }>;
    });
    const maxLeverage = Number(marketInfo.maxLeverage);

    const _margin = parseUnits(params.margin, assetDecimals);
    const _size = this.computeSize(_margin, params.leverage, maxLeverage);
    const _price = parseUnits(params.price, 18);

    // Validate minimum size (from AssetStore)
    const minSize = getAssetMinSize(asset, this.client.config.assets);
    if (_size.lt(minSize)) {
      throw new Error(
        `Order size ${_size.toString()} is below the minimum size ${minSize} for ${asset} (!min-size)`,
      );
    }

    const orderTuple = createOrderTuple({
      market: params.market,
      asset: assetAddress,
      isLong: params.isLong,
      margin: _margin,
      size: _size,
      price: _price,
      orderType: 1,
      isReduceOnly: false,
    });

    // Build array of orders (main + optional TP/SL)
    const orders = [orderTuple];

    if (params.tpPrice) {
      orders.push(
        createOrderTuple({
          market: params.market,
          asset: assetAddress,
          isLong: !params.isLong,
          margin: ethers.BigNumber.from(0),
          size: _size,
          price: parseUnits(params.tpPrice, 18),
          orderType: 1, // limit
          isReduceOnly: true,
        }),
      );
    }

    if (params.slPrice) {
      orders.push(
        createOrderTuple({
          market: params.market,
          asset: assetAddress,
          isLong: !params.isLong,
          margin: ethers.BigNumber.from(0),
          size: _size,
          price: parseUnits(params.slPrice, 18),
          orderType: 2, // stop
          isReduceOnly: true,
        }),
      );
    }

    let value = ethers.BigNumber.from(0);
    if (isGasToken(asset, this.client.config.assets)) {
      // Gas token: msg.value must cover margin + fee (TP/SL are reduce-only, no fee upfront)
      // Fee computed without referral discount — any excess is refunded by the contract
      const fee = _size.mul(marketInfo.fee).div(10000);
      value = _margin.add(fee);
    }

    try {
      return await this.client.withFallback(async () => {
        const contract = await this.client.getContract("Orders", true);
        const gas = await contract.estimateGas.submitSimpleOrders(
          orders,
          [],
          { value },
        );
        const tx = await contract.submitSimpleOrders(orders, [], {
          value,
          gasLimit: addGasBuffer(gas),
        });
        return tx.wait();
      });
    } catch (error) {
      throw new Error(
        `Failed to submit limit order: ${parseContractError(error)}`,
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
      _size = parseUnits(params.size, assetDecimals);
    } else {
      // Full close: read user positions to get current size
      const positions = await this.getPositionsRaw();

      // FIX: filter by asset address in addition to market + isLong
      const position = positions.find(
        (p) =>
          p.market === params.market &&
          p.isLong === params.isLong &&
          p.asset.toLowerCase() === assetAddress.toLowerCase(),
      );
      if (!position) {
        throw new Error(
          `No ${params.isLong ? "long" : "short"} position found for ${params.market} [${asset}]`,
        );
      }
      _size = position.sizeRaw;
    }

    const orderTuple = createOrderTuple({
      market: params.market,
      asset: assetAddress,
      isLong: !params.isLong,
      margin: ethers.BigNumber.from(0),
      size: _size,
      price: 0,
      orderType: 0,
      isReduceOnly: true,
    });

    try {
      return await this.client.withFallback(async () => {
        const contract = await this.client.getContract("Orders", true);
        const gas = await contract.estimateGas.submitSimpleOrders(
          [orderTuple],
          [],
        );
        const tx = await contract.submitSimpleOrders([orderTuple], [], {
          gasLimit: addGasBuffer(gas),
        });
        return tx.wait();
      });
    } catch (error) {
      throw new Error(
        `Failed to close position: ${parseContractError(error)}`,
      );
    }
  }

  async cancelOrder(
    orderId: number,
  ): Promise<ethers.providers.TransactionReceipt> {
    this.requireSigner();

    try {
      return await this.client.withFallback(async () => {
        const contract = await this.client.getContract("Orders", true);
        const gas = await contract.estimateGas.cancelOrder(orderId);
        const tx = await contract.cancelOrder(orderId, {
          gasLimit: addGasBuffer(gas),
        });
        return tx.wait();
      });
    } catch (error) {
      throw new Error(`Failed to cancel order: ${parseContractError(error)}`);
    }
  }

  async cancelOrders(
    orderIds: number[],
  ): Promise<ethers.providers.TransactionReceipt> {
    this.requireSigner();

    try {
      return await this.client.withFallback(async () => {
        const contract = await this.client.getContract("Orders", true);
        const gas = await contract.estimateGas.cancelOrders(orderIds);
        const tx = await contract.cancelOrders(orderIds, {
          gasLimit: addGasBuffer(gas),
        });
        return tx.wait();
      });
    } catch (error) {
      throw new Error(`Failed to cancel orders: ${parseContractError(error)}`);
    }
  }

  async addMargin(
    market: string,
    amount: number | ethers.BigNumber,
    asset = "USDC",
  ): Promise<ethers.providers.TransactionReceipt> {
    this.requireSigner();

    const assetAddress = getAssetAddress(asset, this.client.config.assets);
    const assetDecimals = getAssetDecimals(asset, this.client.config.assets);
    const margin = parseUnits(amount, assetDecimals);

    let value = ethers.BigNumber.from(0);
    if (isGasToken(asset, this.client.config.assets)) {
      value = margin;
    }

    try {
      return await this.client.withFallback(async () => {
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
      });
    } catch (error) {
      throw new Error(`Failed to add margin: ${parseContractError(error)}`);
    }
  }

  /**
   * Remove margin from a position to increase its leverage.
   *
   * Constraints:
   * - You cannot remove all the margin (remaining margin must be > 0).
   * - The resulting leverage after removal must not exceed the market's maxLeverage.
   * - If the position has an unrealized loss, there is a buffer check that may
   *   prevent removal if the loss is too large relative to remaining margin.
   * - Requires a Pyth price update (fetched automatically from Hermes).
   *
   * @param market - Market identifier (e.g. "ETH-USD")
   * @param amount - Amount of margin to remove (human-readable number, or raw BigNumber)
   * @param asset - Asset name (default "USDC")
   */
  async removeMargin(
    market: string,
    amount: number | ethers.BigNumber,
    asset = "USDC",
  ): Promise<ethers.providers.TransactionReceipt> {
    this.requireSigner();

    const assetAddress = getAssetAddress(asset, this.client.config.assets);
    const assetDecimals = getAssetDecimals(asset, this.client.config.assets);
    const margin = parseUnits(amount, assetDecimals);

    // Get market info for Pyth feed
    const marketInfo = await this.client.withFallback(async () => {
      const ms = await this.client.getContract("MarketStore");
      return ms.get(market);
    });
    const pythFeed = marketInfo.pythFeed;

    // Fetch price update from Pyth Hermes
    const priceUpdateData = await this.fetchPythPriceUpdate(pythFeed);

    try {
      return await this.client.withFallback(async () => {
        const contract = await this.client.getContract("Positions", true);
        const gas = await contract.estimateGas.removeMargin(
          assetAddress,
          market,
          margin,
          priceUpdateData,
        );
        const tx = await contract.removeMargin(
          assetAddress,
          market,
          margin,
          priceUpdateData,
          {
            gasLimit: addGasBuffer(gas),
          },
        );
        return tx.wait();
      });
    } catch (error) {
      throw new Error(`Failed to remove margin: ${parseContractError(error)}`);
    }
  }

  /**
   * Close a position without taking profit (black swan / emergency function).
   *
   * This function allows a user to retrieve their margin from a PROFITABLE
   * position without claiming the profit. It is designed for extreme scenarios
   * where the pool may not have enough liquidity to pay out profits.
   *
   * Important constraints:
   * - The position MUST be in profit (pnl >= 0), otherwise the tx reverts with "!pnl-positive".
   * - The profit is forfeited — only the original margin is returned.
   * - The entire position is closed (no partial close).
   * - Requires a Pyth price update (fetched automatically from Hermes).
   *
   * @param market - Market identifier (e.g. "ETH-USD")
   * @param asset - Asset name (default "USDC")
   */
  async closePositionWithoutProfit(
    market: string,
    asset = "USDC",
  ): Promise<ethers.providers.TransactionReceipt> {
    this.requireSigner();

    const assetAddress = getAssetAddress(asset, this.client.config.assets);

    // Get market info for Pyth feed
    const marketInfo = await this.client.withFallback(async () => {
      const ms = await this.client.getContract("MarketStore");
      return ms.get(market);
    });
    const pythFeed = marketInfo.pythFeed;

    // Fetch price update from Pyth Hermes
    const priceUpdateData = await this.fetchPythPriceUpdate(pythFeed);

    try {
      return await this.client.withFallback(async () => {
        const contract = await this.client.getContract("Positions", true);
        const gas = await contract.estimateGas.closePositionWithoutProfit(
          assetAddress,
          market,
          priceUpdateData,
        );
        const tx = await contract.closePositionWithoutProfit(
          assetAddress,
          market,
          priceUpdateData,
          {
            gasLimit: addGasBuffer(gas),
          },
        );
        return tx.wait();
      });
    } catch (error) {
      throw new Error(
        `Failed to close position without profit: ${parseContractError(error)}`,
      );
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

    try {
      const rawPositions = await this.client.withFallback(async () => {
        const positionStore = await this.client.getContract("PositionStore");
        return positionStore.getUserPositions(userAddress) as Promise<RawPosition[]>;
      });

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
      throw new Error(`Failed to get positions: ${parseContractError(error)}`);
    }
  }

  async getPositions(address?: string): Promise<Position[]> {
    const userAddress = address || this.client.getAddress();
    const assets = this.client.config.assets;

    try {
      const rawPositions = await this.client.withFallback(async () => {
        const positionStore = await this.client.getContract("PositionStore");
        return positionStore.getUserPositions(userAddress) as Promise<RawPosition[]>;
      });

      return rawPositions
        .filter((p) => !p.size.isZero())
        .map((p) => {
          const assetName = getAssetNameByAddress(p.asset, assets) || p.asset;

          return {
            user: p.user,
            asset: assetName,
            market: p.market,
            isLong: p.isLong,
            size: p.size,
            margin: p.margin,
            fundingTracker: p.fundingTracker,
            price: Number(formatUnits(p.price, 18)),
            timestamp: p.timestamp,
            leverage: calculateLeverage(p.size, p.margin),
          };
        });
    } catch (error) {
      throw new Error(`Failed to get positions: ${parseContractError(error)}`);
    }
  }

  async getOrders(address?: string): Promise<Order[]> {
    const userAddress = address || this.client.getAddress();
    const assets = this.client.config.assets;

    try {
      const rawOrders = await this.client.withFallback(async () => {
        const orderStore = await this.client.getContract("OrderStore");
        return orderStore.getUserOrders(userAddress) as Promise<RawOrder[]>;
      });

      return rawOrders.map((o) => {
        const assetName = getAssetNameByAddress(o.asset, assets) || o.asset;

        return {
          orderId: Number(o.orderId),
          user: o.user,
          asset: assetName,
          market: o.market,
          margin: o.margin,
          size: o.size,
          price: Number(formatUnits(o.price, 18)),
          fee: o.fee,
          isLong: o.isLong,
          orderType: o.orderType,
          isReduceOnly: o.isReduceOnly,
          timestamp: o.timestamp,
          expiry: o.expiry,
          cancelOrderId: Number(o.cancelOrderId),
          leverage: calculateLeverage(o.size, o.margin),
        };
      });
    } catch (error) {
      throw new Error(`Failed to get orders: ${parseContractError(error)}`);
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

      const balance = await this.client.withFallback(async () => {
        const erc20 = this.client.getErc20Contract(assetAddress);
        return erc20.balanceOf(userAddress) as Promise<ethers.BigNumber>;
      });
      return Number(formatUnits(balance, assetDecimals));
    } catch (error) {
      throw new Error(`Failed to get balance: ${parseContractError(error)}`);
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
      const fundStoreAddress =
        await this.client.getContractAddress("FundStore");
      const allowance = await this.client.withFallback(async () => {
        const erc20 = this.client.getErc20Contract(assetAddress);
        return erc20.allowance(userAddress, fundStoreAddress) as Promise<ethers.BigNumber>;
      });
      return Number(formatUnits(allowance, assetDecimals));
    } catch (error) {
      throw new Error(`Failed to get allowance: ${parseContractError(error)}`);
    }
  }

  /**
   * Approve asset spending for the FundStore contract.
   * FundStore is the contract that performs `transferFrom` on behalf of
   * Orders, Positions, and Pool contracts.
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
      return await this.client.withFallback(async () => {
        const fundStoreAddress =
          await this.client.getContractAddress("FundStore");
        const erc20 = this.client.getErc20Contract(assetAddress, true);

        const approveAmount = amount || ethers.constants.MaxUint256;
        const gas = await erc20.estimateGas.approve(
          fundStoreAddress,
          approveAmount,
        );
        const tx = await erc20.approve(fundStoreAddress, approveAmount, {
          gasLimit: addGasBuffer(gas),
        });
        return tx.wait();
      });
    } catch (error) {
      throw new Error(`Failed to approve asset: ${parseContractError(error)}`);
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
