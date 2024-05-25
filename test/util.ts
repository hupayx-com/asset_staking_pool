// blockchainTime.ts
import { ethers } from "hardhat";

export enum PoolState {
  Waiting, /// 대기 (next status: 모금)
  Fundraising, /// 모금 (next status: 운영 or 모금 잠김 or 모금 중지 or 모금 실패)
  FundraisingLocked, /// 모금 잠김 (next status: 운영)
  FundraisingStopped, /// 모금 중지
  FundraisingFailed, /// 모금 실패
  Operating, /// 운영 (next status: 운영 종료 or 운영 중지)
  OperatingClosed, /// 운영 종료
  OperatingStopped, /// 운영 중지
}

/**
 * 현재 블록체인의 시간을 Unix 타임스탬프로 반환합니다.
 * @returns {Promise<number>} Unix 타임스탬프 (초 단위)
 */
export async function getCurrentBlockchainTime(): Promise<number> {
  const block = await ethers.provider.getBlock("latest");
  return block?.timestamp || 0;
}
