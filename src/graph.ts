import { ethers } from "ethers";
import { ADDRESS_ZERO, buildSubgraphUrl, MONAD_SUBGRAPH_ID } from "./config";
import type { TradeHistory, UserStats } from "./types";
import { calculateLeverage } from "./utils";

export class PinguGraph {
  private endpoint: string;

  /**
   * Create a PinguGraph instance
   * @param endpointOrApiKey - Full endpoint URL or just the API key
   * @param subgraphId - Subgraph ID (only used if first param is API key)
   */
  constructor(endpointOrApiKey: string, subgraphId?: string) {
    if (endpointOrApiKey.startsWith("http")) {
      this.endpoint = endpointOrApiKey;
    } else {
      // Treat as API key
      this.endpoint = buildSubgraphUrl(
        endpointOrApiKey,
        subgraphId || MONAD_SUBGRAPH_ID,
      );
    }
  }

  private async query(graphqlQuery: string): Promise<any> {
    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: graphqlQuery }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = (await response.json()) as { data?: any; errors?: any[] };
      const { data, errors } = result;
      if (errors) {
        throw new Error(`Subgraph error: ${JSON.stringify(errors)}`);
      }
      return data;
    } catch (error) {
      throw new Error(`Graph query failed: ${(error as Error).message}`);
    }
  }

  async getUserHistory(
    address: string,
    limit = 100,
  ): Promise<TradeHistory[]> {
    const PAGE_SIZE = Math.min(limit, 1000);
    let allActions: any[] = [];
    let skip = 0;

    try {
      while (allActions.length < limit) {
        const remaining = limit - allActions.length;
        const fetchSize = Math.min(PAGE_SIZE, remaining);

        const data = await this.query(`
          query {
            positionActions(
              skip: ${skip},
              first: ${fetchSize},
              orderBy: blockTimestamp,
              orderDirection: desc,
              where: { user: "${address.toLowerCase()}" }
              subgraphError: deny
            ) {
              id
              type
              user
              asset
              market
              margin
              size
              price
              fee
              isLong
              pnl
              orderId
              blockNumber
              blockTimestamp
              transactionHash
            }
          }
        `);

        const actions = data.positionActions || [];
        allActions = [...allActions, ...actions];

        if (actions.length < fetchSize) break;
        skip += fetchSize;
      }

      return allActions.map((o: any) => this.formatHistoryItem(o));
    } catch (error) {
      throw new Error(
        `Failed to get user history: ${(error as Error).message}`,
      );
    }
  }

  async getUserStats(address: string): Promise<UserStats> {
    try {
      const history = await this.getUserHistory(address, 10000);

      const closeTrades = history.filter(
        (t) =>
          t.type === "PositionDecreased" || t.type === "PositionLiquidated",
      );

      const totalPnl = closeTrades.reduce(
        (sum, t) => sum.add(t.pnl || ethers.BigNumber.from(0)),
        ethers.BigNumber.from(0),
      );
      const winCount = closeTrades.filter(
        (t) => t.pnl && t.pnl.gt(0),
      ).length;
      const lossCount = closeTrades.filter(
        (t) => !t.pnl || t.pnl.lte(0),
      ).length;

      // Sum volumes (raw BigNumber — note: mixed decimals across assets)
      const totalVolume = history.reduce(
        (sum, t) => sum.add(t.size),
        ethers.BigNumber.from(0),
      );

      return {
        totalTrades: history.length,
        totalVolume,
        totalPnl,
        winCount,
        lossCount,
        winRate:
          closeTrades.length > 0 ? (winCount / closeTrades.length) * 100 : 0,
      };
    } catch (error) {
      throw new Error(`Failed to get user stats: ${(error as Error).message}`);
    }
  }

  async getUserVolume(address: string): Promise<ethers.BigNumber> {
    try {
      const history = await this.getUserHistory(address, 10000);
      return history.reduce(
        (sum, t) => sum.add(t.size),
        ethers.BigNumber.from(0),
      );
    } catch (error) {
      throw new Error(`Failed to get user volume: ${(error as Error).message}`);
    }
  }

  async getUserDeposits(
    address: string,
  ): Promise<
    {
      id: string;
      user: string;
      asset: string;
      clpBalance: string;
      unlockTimestamp: number;
      createdAt: number;
    }[]
  > {
    try {
      const data = await this.query(`
        query {
          deposits(
            where: { user: "${address.toLowerCase()}" }
            orderBy: createdAt
            orderDirection: desc
          ) {
            id
            user
            asset
            clpBalance
            unlockTimestamp
            createdAt
            updatedAt
          }
        }
      `);

      return (data.deposits || []).map((d: any) => ({
        id: d.id,
        user: d.user,
        asset: d.asset,
        clpBalance: d.clpBalance,
        unlockTimestamp: Number(d.unlockTimestamp),
        createdAt: Number(d.createdAt),
      }));
    } catch (error) {
      throw new Error(
        `Failed to get user deposits: ${(error as Error).message}`,
      );
    }
  }

  private formatHistoryItem(item: any): TradeHistory {
    const price = item.price ? Number(item.price) / 1e18 : 0;
    const size = ethers.BigNumber.from(item.size || "0");
    const margin = ethers.BigNumber.from(item.margin || "0");
    const fee = ethers.BigNumber.from(item.fee || "0");
    let pnl: ethers.BigNumber | undefined;

    if (item.type === "PositionLiquidated") {
      pnl = margin.mul(-1);
    } else if (item.pnl && item.pnl !== "0") {
      pnl = ethers.BigNumber.from(item.pnl);
    }

    // Calculate leverage from size and margin BigNumbers
    const leverage = !margin.isZero() ? calculateLeverage(size, margin) : 0;

    return {
      id: item.id,
      type: item.type,
      user: item.user,
      asset: item.asset,
      market: item.market,
      margin,
      size,
      price,
      fee,
      isLong: item.isLong,
      pnl,
      orderId: item.orderId || "0",
      blockNumber: Number(item.blockNumber),
      timestamp: ethers.BigNumber.from(item.blockTimestamp),
      transactionHash: item.transactionHash,
      leverage,
    };
  }
}
