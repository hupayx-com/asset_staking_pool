import { ethers, network } from "hardhat";
import { expect } from "chai";
import { Signer } from "ethers";
import { Suffle, StakingPool } from "../typechain-types/index";

describe("Staking", function () {
  let stakingPool: StakingPool;
  let suffle: Suffle;
  let owner: Signer;
  let staker_1: Signer;
  let staker_2: Signer;

  async function deployStakingPoolFixture(): Promise<{
    stakingPool: StakingPool;
    suffle: Suffle;
    owner: Signer;
    staker_1: Signer;
    staker_2: Signer;
  }> {
    [owner, staker_1, staker_2] = await ethers.getSigners();

    const stakingPoolFactory = await ethers.getContractFactory("StakingPool");
    stakingPool = (await stakingPoolFactory.deploy()) as StakingPool;

    const suffleFactory = await ethers.getContractFactory("Suffle");
    suffle = (await suffleFactory.deploy()) as Suffle;

    await stakingPool.setStakingToken(suffle.getAddress());
    await stakingPool.setScaledAnnualInterestRate(100); // 연 이율 1%
    await stakingPool.connect(owner).updateScaledTokenPrice(1000000);

    // faucet for staking
    await suffle.transfer(
      await staker_1.getAddress(),
      ethers.parseEther("1000000000")
    );
    await suffle.transfer(
      await staker_2.getAddress(),
      ethers.parseEther("1000000000")
    );

    return { stakingPool, suffle, owner, staker_1, staker_2 };
  }

  beforeEach(async function () {
    await network.provider.request({
      method: "hardhat_reset",
      params: [],
    });
  });

  it("토큰을 스테이킹 한다.", async function () {
    const { stakingPool, suffle, staker_1, owner } =
      await deployStakingPoolFixture();

    // staking 은 모금/운영 시에만 가능
    await stakingPool.connect(owner).startFundraising();

    const STAKING_AMOUNT_ETHER = "365";
    await suffle
      .connect(staker_1)
      .approve(
        stakingPool.getAddress(),
        ethers.parseEther(STAKING_AMOUNT_ETHER)
      );
    await stakingPool
      .connect(staker_1)
      .stake(ethers.parseEther(STAKING_AMOUNT_ETHER));

    const stakeRecord = await stakingPool.stakingRecords(
      await staker_1.getAddress(),
      0
    );
    expect(stakeRecord.amountStaked).to.equal(
      ethers.parseEther(STAKING_AMOUNT_ETHER)
    );
    expect(stakeRecord.receivedRewardToken).to.equal(0);
    expect(stakeRecord.pendingRewardScheduleIndex).to.equal(0);
    expect(stakeRecord.scaledTokenPrice).to.equal(1000000);
    expect(stakeRecord.dailyInterest).to.equal(ethers.parseEther("1"));
  });

  it("최소 스테이킹 금액 이상 일때 스테이킹이 성공한다.", async function () {
    const { stakingPool, suffle, staker_1, owner } =
      await deployStakingPoolFixture();

    await stakingPool.connect(owner).setMinStakePrice(365);

    // staking 은 모금/운영 시에만 가능
    await stakingPool.connect(owner).startFundraising();

    await stakingPool.connect(owner).updateScaledTokenPrice(1000000);

    const STAKING_AMOUNT_ETHER_364 = "364";
    await suffle
      .connect(staker_1)
      .approve(
        stakingPool.getAddress(),
        ethers.parseEther(STAKING_AMOUNT_ETHER_364)
      );
    await expect(
      stakingPool
        .connect(staker_1)
        .stake(ethers.parseEther(STAKING_AMOUNT_ETHER_364))
    ).to.be.revertedWith("Amount is less than the minimum stake amount");

    const STAKING_AMOUNT_ETHER_365 = "365";
    await suffle
      .connect(staker_1)
      .approve(
        stakingPool.getAddress(),
        ethers.parseEther(STAKING_AMOUNT_ETHER_365)
      );
    await stakingPool
      .connect(staker_1)
      .stake(ethers.parseEther(STAKING_AMOUNT_ETHER_365));

    const stakeRecord = await stakingPool.stakingRecords(
      await staker_1.getAddress(),
      0
    );
    expect(stakeRecord.amountStaked).to.equal(
      ethers.parseEther(STAKING_AMOUNT_ETHER_365)
    );
    expect(stakeRecord.receivedRewardToken).to.equal(0);
    expect(stakeRecord.pendingRewardScheduleIndex).to.equal(0);
    expect(stakeRecord.scaledTokenPrice).to.equal(1000000);
    expect(stakeRecord.dailyInterest).to.equal(ethers.parseEther("1"));
  });

  it("2 명의 사용자가 각각 토큰을 스테이킹 한다.", async function () {
    const { stakingPool, suffle, staker_1, owner } =
      await deployStakingPoolFixture();

    // staking 은 모금/운영 시에만 가능
    await stakingPool.connect(owner).startFundraising();

    const STAKING_AMOUNT_ETHER = "365";
    const STAKING_AMOUNT_ETHER_2 = "730";

    await suffle
      .connect(staker_1)
      .approve(
        stakingPool.getAddress(),
        ethers.parseEther(STAKING_AMOUNT_ETHER)
      );
    await stakingPool
      .connect(staker_1)
      .stake(ethers.parseEther(STAKING_AMOUNT_ETHER));

    await stakingPool.connect(owner).updateScaledTokenPrice(5000000);

    await suffle
      .connect(staker_2)
      .approve(
        stakingPool.getAddress(),
        ethers.parseEther(STAKING_AMOUNT_ETHER_2)
      );
    await stakingPool
      .connect(staker_2)
      .stake(ethers.parseEther(STAKING_AMOUNT_ETHER_2));

    const stakeRecord_1 = await stakingPool.stakingRecords(
      await staker_1.getAddress(),
      0
    );
    expect(stakeRecord_1.amountStaked).to.equal(
      ethers.parseEther(STAKING_AMOUNT_ETHER)
    );
    expect(stakeRecord_1.receivedRewardToken).to.equal(0);
    expect(stakeRecord_1.pendingRewardScheduleIndex).to.equal(0);
    expect(stakeRecord_1.scaledTokenPrice).to.equal(1000000);
    expect(stakeRecord_1.dailyInterest).to.equal(ethers.parseEther("1"));

    const stakeRecord_2 = await stakingPool.stakingRecords(
      await staker_2.getAddress(),
      0
    );
    expect(stakeRecord_2.amountStaked).to.equal(
      ethers.parseEther(STAKING_AMOUNT_ETHER_2)
    );
    expect(stakeRecord_2.receivedRewardToken).to.equal(0);
    expect(stakeRecord_2.pendingRewardScheduleIndex).to.equal(0);
    expect(stakeRecord_2.scaledTokenPrice).to.equal(5000000);
    expect(stakeRecord_2.dailyInterest).to.equal(ethers.parseEther("10"));
  });

  it("1 명의 사용자가 토큰을 2 번 스테이킹 한다.", async function () {
    const { stakingPool, suffle, staker_1, owner } =
      await deployStakingPoolFixture();

    // staking 은 모금/운영 시에만 가능
    await stakingPool.connect(owner).startFundraising();

    const STAKING_AMOUNT_ETHER = "365";
    const STAKING_AMOUNT_ETHER_2 = "730";

    await suffle
      .connect(staker_1)
      .approve(
        stakingPool.getAddress(),
        ethers.parseEther(STAKING_AMOUNT_ETHER)
      );
    await stakingPool
      .connect(staker_1)
      .stake(ethers.parseEther(STAKING_AMOUNT_ETHER));

    await stakingPool.connect(owner).updateScaledTokenPrice(5000000);

    await suffle
      .connect(staker_1)
      .approve(
        stakingPool.getAddress(),
        ethers.parseEther(STAKING_AMOUNT_ETHER_2)
      );
    await stakingPool
      .connect(staker_1)
      .stake(ethers.parseEther(STAKING_AMOUNT_ETHER_2));

    const stakeRecord_1 = await stakingPool.stakingRecords(
      await staker_1.getAddress(),
      0
    );
    expect(stakeRecord_1.amountStaked).to.equal(
      ethers.parseEther(STAKING_AMOUNT_ETHER)
    );
    expect(stakeRecord_1.receivedRewardToken).to.equal(0);
    expect(stakeRecord_1.pendingRewardScheduleIndex).to.equal(0);
    expect(stakeRecord_1.scaledTokenPrice).to.equal(1000000);
    expect(stakeRecord_1.dailyInterest).to.equal(ethers.parseEther("1"));

    const stakeRecord_2 = await stakingPool.stakingRecords(
      await staker_1.getAddress(),
      1
    );
    expect(stakeRecord_2.amountStaked).to.equal(
      ethers.parseEther(STAKING_AMOUNT_ETHER_2)
    );
    expect(stakeRecord_2.receivedRewardToken).to.equal(0);
    expect(stakeRecord_2.pendingRewardScheduleIndex).to.equal(0);
    expect(stakeRecord_2.scaledTokenPrice).to.equal(5000000);
    expect(stakeRecord_2.dailyInterest).to.equal(ethers.parseEther("10"));
  });
});
