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
  parseContractError,
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
    amount: number | ethers.BigNumber,
    asset = "USDC",
    lockupIndex = 0,
  ): Promise<ethers.providers.TransactionReceipt> {
    this.requireSigner();

    const assetAddress = getAssetAddress(asset, this.client.config.assets);
    const assetDecimals = getAssetDecimals(asset, this.client.config.assets);
    const _amount = parseUnits(amount, assetDecimals);

    const value = isGasToken(asset, this.client.config.assets)
      ? _amount
      : ethers.BigNumber.from(0);

    try {
      return await this.client.withFallback(async () => {
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
      });
    } catch (error) {
      throw new Error(`Failed to deposit: ${parseContractError(error)}`);
    }
  }

  async withdraw(
    amount: number | ethers.BigNumber,
    asset = "USDC",
  ): Promise<ethers.providers.TransactionReceipt> {
    this.requireSigner();

    const assetAddress = getAssetAddress(asset, this.client.config.assets);
    const assetDecimals = getAssetDecimals(asset, this.client.config.assets);
    const _amount = parseUnits(amount, assetDecimals);

    try {
      return await this.client.withFallback(async () => {
        const pool = await this.client.getContract("Pool", true);
        const gas = await pool.estimateGas.withdraw(assetAddress, _amount);
        const tx = await pool.withdraw(assetAddress, _amount, {
          gasLimit: addGasBuffer(gas),
        });
        return tx.wait();
      });
    } catch (error) {
      throw new Error(`Failed to withdraw: ${parseContractError(error)}`);
    }
  }

  async getDepositTax(
    amount: number | ethers.BigNumber,
    asset = "USDC",
    lockupIndex = 0,
  ): Promise<number> {
    const assetAddress = getAssetAddress(asset, this.client.config.assets);
    const assetDecimals = getAssetDecimals(asset, this.client.config.assets);
    const _amount = parseUnits(amount, assetDecimals);

    try {
      const taxBps = await this.client.withFallback(async () => {
        const pool = await this.client.getContract("Pool");
        return pool.getDepositTaxBps(assetAddress, _amount, lockupIndex) as Promise<ethers.BigNumber>;
      });

      return Math.round(Number(taxBps.toString())) / 100;
    } catch (error) {
      throw new Error(`Failed to get deposit tax: ${parseContractError(error)}`);
    }
  }

  async getWithdrawalTax(
    amount: number | ethers.BigNumber,
    asset = "USDC",
  ): Promise<number> {
    const assetAddress = getAssetAddress(asset, this.client.config.assets);
    const assetDecimals = getAssetDecimals(asset, this.client.config.assets);
    const _amount = parseUnits(amount, assetDecimals);

    try {
      const taxBps = await this.client.withFallback(async () => {
        const pool = await this.client.getContract("Pool");
        return pool.getWithdrawalTaxBps(assetAddress, _amount) as Promise<ethers.BigNumber>;
      });

      return Math.round(Number(taxBps.toString())) / 100;
    } catch (error) {
      throw new Error(
        `Failed to get withdrawal tax: ${parseContractError(error)}`,
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
      const data = await this.client.withFallback(async () => {
        const poolStore = await this.client.getContract("PoolStore");
        const [unlockedClp, lockedClp, totalClp, poolBalance, clpSupply] =
          (await Promise.all([
            poolStore.getUnlockedClpBalance(assetAddress, userAddress),
            poolStore.getLockedClpBalance(assetAddress, userAddress),
            poolStore.getUserClpBalance(assetAddress, userAddress),
            poolStore.getBalance(assetAddress),
            poolStore.getClpSupply(assetAddress),
          ])) as [
            ethers.BigNumber,
            ethers.BigNumber,
            ethers.BigNumber,
            ethers.BigNumber,
            ethers.BigNumber,
          ];
        return { unlockedClp, lockedClp, totalClp, poolBalance, clpSupply };
      });

      const { unlockedClp, lockedClp, totalClp, poolBalance, clpSupply } = data;

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
        `Failed to get user balance: ${parseContractError(error)}`,
      );
    }
  }

  /**
   * Approve asset spending for the FundStore contract (used by Pool).
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
}
