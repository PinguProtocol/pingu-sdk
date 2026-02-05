import { ethers } from "ethers";
import { PinguClient } from "./client";
import type { PoolBalance } from "./types";
import {
  parseUnits,
  formatUnits,
  getAssetAddress,
  getAssetDecimals,
  isGasToken,
  addGasBuffer,
} from "./utils";

export class PinguPool {
  private client: PinguClient;

  constructor(client: PinguClient) {
    this.client = client;
  }

  private requireSigner(): void {
    if (!this.client.signer) {
      throw new Error(
        "Signer required for pool operations. Provide a privateKey to PinguClient.",
      );
    }
  }

  async deposit(
    amount: number,
    asset = "USDC",
    lockupIndex = 0,
  ): Promise<ethers.providers.TransactionReceipt> {
    this.requireSigner();

    const assetAddress = getAssetAddress(asset, this.client.config.assets);
    const assetDecimals = getAssetDecimals(asset, this.client.config.assets);
    const _amount = parseUnits(amount.toString(), assetDecimals);

    const value = isGasToken(asset, this.client.config.assets)
      ? _amount
      : ethers.BigNumber.from(0);

    try {
      const pool = await this.client.getContract("Pool", true);
      const gas = await pool.estimateGas.deposit(
        assetAddress,
        _amount,
        lockupIndex,
        { value },
      );
      const tx = await pool.deposit(assetAddress, _amount, lockupIndex, {
        gasLimit: addGasBuffer(gas),
        value,
      });

      return tx.wait();
    } catch (error) {
      throw new Error(`Failed to deposit: ${(error as Error).message}`);
    }
  }

  async withdraw(
    amount: number,
    asset = "USDC",
  ): Promise<ethers.providers.TransactionReceipt> {
    this.requireSigner();

    const assetAddress = getAssetAddress(asset, this.client.config.assets);
    const assetDecimals = getAssetDecimals(asset, this.client.config.assets);
    const _amount = parseUnits(amount.toString(), assetDecimals);

    try {
      const pool = await this.client.getContract("Pool", true);
      const gas = await pool.estimateGas.withdraw(assetAddress, _amount);
      const tx = await pool.withdraw(assetAddress, _amount, {
        gasLimit: addGasBuffer(gas),
      });

      return tx.wait();
    } catch (error) {
      throw new Error(`Failed to withdraw: ${(error as Error).message}`);
    }
  }

  async getDepositTax(
    amount: number,
    asset = "USDC",
    lockupIndex = 0,
  ): Promise<number> {
    const assetAddress = getAssetAddress(asset, this.client.config.assets);
    const assetDecimals = getAssetDecimals(asset, this.client.config.assets);
    const _amount = parseUnits(amount.toString(), assetDecimals);

    try {
      const pool = await this.client.getContract("Pool");
      const taxBps: ethers.BigNumber = await this.client.withFallback(() =>
        pool.getDepositTaxBps(assetAddress, _amount, lockupIndex),
      );

      return Math.round(Number(taxBps.toString())) / 100;
    } catch (error) {
      throw new Error(`Failed to get deposit tax: ${(error as Error).message}`);
    }
  }

  async getWithdrawalTax(amount: number, asset = "USDC"): Promise<number> {
    const assetAddress = getAssetAddress(asset, this.client.config.assets);
    const assetDecimals = getAssetDecimals(asset, this.client.config.assets);
    const _amount = parseUnits(amount.toString(), assetDecimals);

    try {
      const pool = await this.client.getContract("Pool");
      const taxBps: ethers.BigNumber = await this.client.withFallback(() =>
        pool.getWithdrawalTaxBps(assetAddress, _amount),
      );

      return Math.round(Number(taxBps.toString())) / 100;
    } catch (error) {
      throw new Error(
        `Failed to get withdrawal tax: ${(error as Error).message}`,
      );
    }
  }

  async getUserBalance(
    address?: string,
    asset = "USDC",
  ): Promise<PoolBalance> {
    const userAddress = address || this.client.getAddress();
    const assetAddress = getAssetAddress(asset, this.client.config.assets);
    const assetDecimals = getAssetDecimals(asset, this.client.config.assets);

    try {
      const poolStore = await this.client.getContract("PoolStore");

      const [unlockedClp, lockedClp, totalClp, poolBalance, clpSupply] =
        (await Promise.all([
          this.client.withFallback(() =>
            poolStore.getUnlockedClpBalance(assetAddress, userAddress),
          ),
          this.client.withFallback(() =>
            poolStore.getLockedClpBalance(assetAddress, userAddress),
          ),
          this.client.withFallback(() =>
            poolStore.getUserClpBalance(assetAddress, userAddress),
          ),
          this.client.withFallback(() => poolStore.getBalance(assetAddress)),
          this.client.withFallback(() => poolStore.getClpSupply(assetAddress)),
        ])) as [
          ethers.BigNumber,
          ethers.BigNumber,
          ethers.BigNumber,
          ethers.BigNumber,
          ethers.BigNumber,
        ];

      if (clpSupply.isZero() || poolBalance.isZero()) {
        return { withdrawable: 0, locked: 0, total: 0 };
      }

      const withdrawableAmount = unlockedClp.mul(poolBalance).div(clpSupply);
      const lockedAmount = lockedClp.mul(poolBalance).div(clpSupply);
      const totalAmount = totalClp.mul(poolBalance).div(clpSupply);

      return {
        withdrawable: Number(formatUnits(withdrawableAmount, assetDecimals)),
        locked: Number(formatUnits(lockedAmount, assetDecimals)),
        total: Number(formatUnits(totalAmount, assetDecimals)),
      };
    } catch (error) {
      throw new Error(
        `Failed to get user balance: ${(error as Error).message}`,
      );
    }
  }
}
