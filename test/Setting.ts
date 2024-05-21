import { ethers, network } from "hardhat";
import { expect } from "chai";
import { Signer } from "ethers";
import { StakingPool } from "../typechain-types/index";
import { PoolState } from "./util";

describe("StakingPool Admin Functions", function () {
  let stakingPool: StakingPool;
  let owner: Signer;

  async function deployStakingPoolFixture(): Promise<{
    stakingPool: StakingPool;
    owner: Signer;
  }> {
    [owner] = await ethers.getSigners();

    const stakingPoolFactory = await ethers.getContractFactory("StakingPool");
    stakingPool = (await stakingPoolFactory.deploy()) as StakingPool;

    return { stakingPool, owner };
  }

  beforeEach(async function () {
    await network.provider.request({
      method: "hardhat_reset",
      params: [],
    });
  });

  it("Pool 이름 설정", async function () {
    const { stakingPool, owner } = await deployStakingPoolFixture();

    await stakingPool.setPoolName("Test Pool");

    const details = await stakingPool.getPoolDetails();
    expect(details.name).to.equal("Test Pool");
  });

  it("Pool 설명 설정", async function () {
    const { stakingPool, owner } = await deployStakingPoolFixture();

    await stakingPool.setPoolDescription("This is a test pool");

    const details = await stakingPool.getPoolDetails();
    expect(details.description).to.equal("This is a test pool");
  });

  it("최소 스테이킹 금액 설정", async function () {
    const { stakingPool, owner } = await deployStakingPoolFixture();

    await stakingPool.setMinStakePrice(1000);

    const details = await stakingPool.getPoolDetails();
    expect(details.minStakeInUSD).to.equal(1000);
  });

  it("연 이자율 설정", async function () {
    const { stakingPool, owner } = await deployStakingPoolFixture();

    await stakingPool.setAnnualInterestRateMultiplier(5000);

    const details = await stakingPool.getPoolDetails();
    expect(details.multipliedAnnualInterestRate).to.equal(5000);
  });

  it("최소 모금 금액 설정", async function () {
    const { stakingPool, owner } = await deployStakingPoolFixture();

    await stakingPool.setMinFundraisingPrice(50000);

    const details = await stakingPool.getPoolDetails();
    expect(details.minFundraisingInUSD).to.equal(50000);
  });

  it("최대 모금 금액 설정", async function () {
    const { stakingPool, owner } = await deployStakingPoolFixture();

    await stakingPool.setMaxFundraisingPrice(200000);

    const details = await stakingPool.getPoolDetails();
    expect(details.maxFundraisingInUSD).to.equal(200000);
  });

  it("스테이킹 토큰 주소 설정", async function () {
    const { stakingPool, owner } = await deployStakingPoolFixture();

    const tokenAddress = ethers.Wallet.createRandom().address;

    await stakingPool.setStakingToken(tokenAddress);

    const details = await stakingPool.getPoolDetails();
    expect(details.stakingToken).to.equal(tokenAddress);
  });

  it("실시간 토큰 가격 업데이트", async function () {
    const { stakingPool, owner } = await deployStakingPoolFixture();

    await stakingPool.connect(owner).updateMultipliedTokenPrice(1500000);

    const currentPrice = await stakingPool.currentMultipliedTokenPrice();
    expect(currentPrice).to.equal(1500000);
  });

  it("보상 스케줄 추가", async function () {
    const { stakingPool, owner } = await deployStakingPoolFixture();

    const start = Math.floor(Date.now() / 1000); // 현재 시간 (초 단위)
    const end = start + 30 * 24 * 60 * 60; // 30일 후

    await stakingPool.connect(owner).startFundraising();
    await stakingPool.connect(owner).startOperating();

    await expect(stakingPool.addRewardSchedule(1500000, start, end))
      .to.emit(stakingPool, "RewardScheduleAdded")
      .withArgs(1500000, start, end);

    const rewardSchedule = await stakingPool.rewardSchedules(0);
    expect(rewardSchedule.multipliedTokenPriceAtPayout).to.equal(1500000);
    expect(rewardSchedule.start).to.equal(start);
    expect(rewardSchedule.end).to.equal(end);
  });
});
