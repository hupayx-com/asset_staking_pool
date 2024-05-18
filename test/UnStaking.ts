import { ethers, network } from "hardhat";
import { expect } from "chai";
import { Signer } from "ethers";
import { Suffle, StakingPool } from "../typechain-types/index";

describe("UnStaking", function () {
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
    await stakingPool.setAnnualScaledInterestRate(100); // 연 이율 1%
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

  it("모금 기간에 2 번 스테이킹 하고 첫번째 스테이킹의 모든 토큰을 언스테이킹 하면 두번째 스테이킹만 남는다.", async function () {
    const { stakingPool, suffle, staker_1, owner } =
      await deployStakingPoolFixture();

    // staking 은 모금/운영 시에만 가능
    await stakingPool.connect(owner).startFundraising();

    const STAKING_AMOUNT_ETHER_730 = "730";
    const STAKING_AMOUNT_ETHER_365 = "365";

    await suffle
      .connect(staker_1)
      .approve(
        stakingPool.getAddress(),
        ethers.parseEther(STAKING_AMOUNT_ETHER_730)
      );
    await stakingPool
      .connect(staker_1)
      .stake(ethers.parseEther(STAKING_AMOUNT_ETHER_730));

    await suffle
      .connect(staker_1)
      .approve(
        stakingPool.getAddress(),
        ethers.parseEther(STAKING_AMOUNT_ETHER_365)
      );
    await stakingPool
      .connect(staker_1)
      .stake(ethers.parseEther(STAKING_AMOUNT_ETHER_365));

    let stakeRecord = await stakingPool.stakingRecords(
      await staker_1.getAddress(),
      0
    );
    expect(stakeRecord.amountStaked).to.equal(
      ethers.parseEther(STAKING_AMOUNT_ETHER_730)
    );
    expect(stakeRecord.receivedRewardToken).to.equal(0);
    expect(stakeRecord.nextPendingRewardScheduleIndex).to.equal(0);
    expect(stakeRecord.scaledTokenPrice).to.equal(1000000);
    expect(stakeRecord.dailyInterest).to.equal(ethers.parseEther("2"));

    await stakingPool
      .connect(staker_1)
      .unStake(0, ethers.parseEther(STAKING_AMOUNT_ETHER_730));

    const stakeLength = await stakingPool.getStakingRecordLength(
      await staker_1.getAddress()
    );
    expect(stakeLength).to.equal(1);

    stakeRecord = await stakingPool.stakingRecords(
      await staker_1.getAddress(),
      0
    );
    expect(stakeRecord.amountStaked).to.equal(
      ethers.parseEther(STAKING_AMOUNT_ETHER_365)
    );
    expect(stakeRecord.receivedRewardToken).to.equal(0);
    expect(stakeRecord.nextPendingRewardScheduleIndex).to.equal(0);
    expect(stakeRecord.scaledTokenPrice).to.equal(1000000);
    expect(stakeRecord.dailyInterest).to.equal(ethers.parseEther("1"));
  });

  it("모금 기간에 일부 토큰을 언스테이킹 한다.", async function () {
    const { stakingPool, suffle, staker_1, owner } =
      await deployStakingPoolFixture();

    // staking 은 모금/운영 시에만 가능
    await stakingPool.connect(owner).startFundraising();

    const STAKING_AMOUNT_ETHER_730 = "730";
    const STAKING_AMOUNT_ETHER_365 = "365";

    await suffle
      .connect(staker_1)
      .approve(
        stakingPool.getAddress(),
        ethers.parseEther(STAKING_AMOUNT_ETHER_730)
      );
    await stakingPool
      .connect(staker_1)
      .stake(ethers.parseEther(STAKING_AMOUNT_ETHER_730));

    let stakeRecord = await stakingPool.stakingRecords(
      await staker_1.getAddress(),
      0
    );
    expect(stakeRecord.amountStaked).to.equal(
      ethers.parseEther(STAKING_AMOUNT_ETHER_730)
    );
    expect(stakeRecord.receivedRewardToken).to.equal(0);
    expect(stakeRecord.nextPendingRewardScheduleIndex).to.equal(0);
    expect(stakeRecord.scaledTokenPrice).to.equal(1000000);
    expect(stakeRecord.dailyInterest).to.equal(ethers.parseEther("2"));

    await stakingPool.connect(owner).updateScaledTokenPrice(2000000);

    await stakingPool
      .connect(staker_1)
      .unStake(0, ethers.parseEther(STAKING_AMOUNT_ETHER_365));

    const stakeLength = await stakingPool.getStakingRecordLength(
      await staker_1.getAddress()
    );
    expect(stakeLength).to.equal(1);

    stakeRecord = await stakingPool.stakingRecords(
      await staker_1.getAddress(),
      0
    );
    expect(stakeRecord.amountStaked).to.equal(
      ethers.parseEther(STAKING_AMOUNT_ETHER_365)
    );
    expect(stakeRecord.receivedRewardToken).to.equal(0);
    expect(stakeRecord.nextPendingRewardScheduleIndex).to.equal(0);
    expect(stakeRecord.scaledTokenPrice).to.equal(1000000);
    expect(stakeRecord.dailyInterest).to.equal(ethers.parseEther("1"));
  });

  it("운영 기간내 토큰을 언스테이킹 하면 실패한다.", async function () {
    const { stakingPool, suffle, staker_1, owner } =
      await deployStakingPoolFixture();

    // staking 은 모금/운영 시에만 가능
    await stakingPool.connect(owner).startFundraising();

    const STAKING_AMOUNT_ETHER_730 = "730";

    await suffle
      .connect(staker_1)
      .approve(
        stakingPool.getAddress(),
        ethers.parseEther(STAKING_AMOUNT_ETHER_730)
      );
    await stakingPool
      .connect(staker_1)
      .stake(ethers.parseEther(STAKING_AMOUNT_ETHER_730));

    await stakingPool.connect(owner).startOperating();

    await expect(
      stakingPool
        .connect(staker_1)
        .unStake(0, ethers.parseEther(STAKING_AMOUNT_ETHER_730))
    ).to.be.revertedWith("Unstaking is only allowed during fundraising");
  });

  it("중지 시 토큰을 언스테이킹 하면 실패한다.", async function () {
    const { stakingPool, suffle, staker_1, owner } =
      await deployStakingPoolFixture();

    // staking 은 모금/운영 시에만 가능
    await stakingPool.connect(owner).startFundraising();

    const STAKING_AMOUNT_ETHER_730 = "730";

    await suffle
      .connect(staker_1)
      .approve(
        stakingPool.getAddress(),
        ethers.parseEther(STAKING_AMOUNT_ETHER_730)
      );
    await stakingPool
      .connect(staker_1)
      .stake(ethers.parseEther(STAKING_AMOUNT_ETHER_730));

    await stakingPool.connect(owner).stopFundraising();

    await expect(
      stakingPool
        .connect(staker_1)
        .unStake(0, ethers.parseEther(STAKING_AMOUNT_ETHER_730))
    ).to.be.revertedWith("Unstaking is only allowed during fundraising");
  });

  it("종료 시 토큰을 언스테이킹 하면 실패한다.", async function () {
    const { stakingPool, suffle, staker_1, owner } =
      await deployStakingPoolFixture();

    // staking 은 모금/운영 시에만 가능
    await stakingPool.connect(owner).startFundraising();
    await stakingPool.connect(owner).startOperating();

    const STAKING_AMOUNT_ETHER_730 = "730";

    await suffle
      .connect(staker_1)
      .approve(
        stakingPool.getAddress(),
        ethers.parseEther(STAKING_AMOUNT_ETHER_730)
      );
    await stakingPool
      .connect(staker_1)
      .stake(ethers.parseEther(STAKING_AMOUNT_ETHER_730));

    await stakingPool.connect(owner).closePool();

    await expect(
      stakingPool
        .connect(staker_1)
        .unStake(0, ethers.parseEther(STAKING_AMOUNT_ETHER_730))
    ).to.be.revertedWith("Unstaking is only allowed during fundraising");
  });
});
