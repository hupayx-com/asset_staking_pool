// blockchainTime.ts
import { ethers } from "hardhat";

export enum PoolState {
  Waiting = 0, // Solidity enum은 기본적으로 0부터 시작하는 숫자 enum이 됩니다.
  Fundraising,
  Operating,
  Closed,
  Locked,
  FundraisingStopped,
  OperatingStopped,
  Failed,
}

/**
 * 현재 블록체인의 시간을 Unix 타임스탬프로 반환합니다.
 * @returns {Promise<number>} Unix 타임스탬프 (초 단위)
 */
export async function getCurrentBlockchainTime(): Promise<number> {
  const block = await ethers.provider.getBlock("latest");
  return block?.timestamp || 0;
}
