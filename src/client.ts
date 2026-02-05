import { ethers } from "ethers";
import { DEFAULT_CONFIG } from "./config";
import type { ChainConfig } from "./config";
import { DATA_STORE_ABI, ERC20_ABI } from "./abis";
import * as ABIS from "./abis";

export interface PinguClientConfig {
  rpcUrl?: string;
  privateKey?: string;
  chainConfig?: ChainConfig;
}

const ABI_MAP: Record<string, readonly object[] | string[]> = {
  DataStore: ABIS.DATA_STORE_ABI,
  Orders: ABIS.ORDERS_ABI,
  OrderStore: ABIS.ORDER_STORE_ABI,
  Positions: ABIS.POSITIONS_ABI,
  PositionStore: ABIS.POSITION_STORE_ABI,
  MarketStore: ABIS.MARKET_STORE_ABI,
  Pool: ABIS.POOL_ABI,
  PoolStore: ABIS.POOL_STORE_ABI,
  RiskStore: ABIS.RISK_STORE_ABI,
  FundingStore: ABIS.FUNDING_STORE_ABI,
  Funding: ABIS.FUNDING_ABI,
};

export class PinguClient {
  public provider: ethers.providers.JsonRpcProvider;
  public signer?: ethers.Wallet;
  public config: ChainConfig;

  private dataStore: ethers.Contract;
  private addressCache: Map<string, string> = new Map();
  private rpcUrls: string[];
  private currentRpcIndex: number = 0;

  constructor(options: PinguClientConfig = {}) {
    this.config = options.chainConfig || DEFAULT_CONFIG;

    // Build RPC list: custom first if provided, then fallbacks
    if (options.rpcUrl) {
      this.rpcUrls = [options.rpcUrl, ...this.config.rpcUrls];
    } else {
      this.rpcUrls = [...this.config.rpcUrls];
    }

    this.provider = new ethers.providers.JsonRpcProvider(this.rpcUrls[0]);

    if (options.privateKey) {
      this.signer = new ethers.Wallet(options.privateKey, this.provider);
    }

    this.dataStore = new ethers.Contract(
      this.config.dataStore,
      DATA_STORE_ABI,
      this.provider,
    );
  }

  /**
   * Switch to next available RPC endpoint
   */
  private switchRpc(): boolean {
    this.currentRpcIndex++;
    if (this.currentRpcIndex >= this.rpcUrls.length) {
      this.currentRpcIndex = 0;
      return false; // Cycled through all RPCs
    }

    const newRpcUrl = this.rpcUrls[this.currentRpcIndex];
    this.provider = new ethers.providers.JsonRpcProvider(newRpcUrl);

    if (this.signer) {
      this.signer = this.signer.connect(this.provider);
    }

    // Clear address cache when switching RPC
    this.addressCache.clear();

    // Recreate dataStore with new provider
    this.dataStore = new ethers.Contract(
      this.config.dataStore,
      DATA_STORE_ABI,
      this.provider,
    );

    return true;
  }

  /**
   * Execute an RPC call with automatic fallback
   */
  async withFallback<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;
    const startIndex = this.currentRpcIndex;

    do {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        const switched = this.switchRpc();
        if (!switched && this.currentRpcIndex === startIndex) {
          break; // Tried all RPCs
        }
      }
    } while (true);

    throw new Error(
      `All RPC endpoints failed. Last error: ${lastError?.message}`,
    );
  }

  async getContractAddress(name: string): Promise<string> {
    const cached = this.addressCache.get(name);
    if (cached) return cached;

    const address: string = await this.withFallback(() =>
      this.dataStore.getAddress(name),
    );
    this.addressCache.set(name, address);
    return address;
  }

  async getContract(
    name: string,
    withSigner = false,
  ): Promise<ethers.Contract> {
    const address = await this.getContractAddress(name);
    const abi = ABI_MAP[name];
    if (!abi) {
      throw new Error(
        `Unknown contract: ${name}. Available: ${Object.keys(ABI_MAP).join(", ")}`,
      );
    }

    const signerOrProvider =
      withSigner && this.signer ? this.signer : this.provider;
    return new ethers.Contract(address, abi, signerOrProvider);
  }

  getErc20Contract(
    tokenAddress: string,
    withSigner = false,
  ): ethers.Contract {
    const signerOrProvider =
      withSigner && this.signer ? this.signer : this.provider;
    return new ethers.Contract(tokenAddress, ERC20_ABI, signerOrProvider);
  }

  getProvider(): ethers.providers.JsonRpcProvider {
    return this.provider;
  }

  getSigner(): ethers.Wallet | undefined {
    return this.signer;
  }

  getAddress(): string {
    if (!this.signer) {
      throw new Error("No signer configured. Provide a privateKey.");
    }
    return this.signer.address;
  }

  getCurrentRpcUrl(): string {
    return this.rpcUrls[this.currentRpcIndex];
  }
}
