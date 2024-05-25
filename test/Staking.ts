import { ethers, network } from "hardhat";
import { expect } from "chai";
import { Signer } from "ethers";
import {
  Suffle,
  StakingPool,
  StakingPoolFactory,
} from "../typechain-types/index";
import { PoolState } from "./util";

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

    // StakingPoolFactory 배포
    const stakingPoolFactoryFactory = await ethers.getContractFactory(
      "StakingPoolFactory"
    );
    const stakingPoolFactory =
      (await stakingPoolFactoryFactory.deploy()) as StakingPoolFactory;

    // StakingPoolFactory를 통해 StakingPool 생성
    await stakingPoolFactory.connect(owner).createPool();
    const poolsLength = await stakingPoolFactory.getPoolsLength();
    const poolAddress = await stakingPoolFactory.pools(poolsLength - 1n);

    stakingPool = (await ethers.getContractAt(
      "StakingPool",
      poolAddress
    )) as StakingPool;

    const suffleFactory = await ethers.getContractFactory("Suffle");
    suffle = (await suffleFactory.deploy()) as Suffle;

    await stakingPool.setStakingToken(suffle.getAddress());
    await stakingPool.setAnnualInterestRateMultiplier(100); // 연 이율 1%
    await stakingPool.connect(owner).updateTokenMultipliedPrice(1000000);
    await stakingPool.setMaxFundraisingPrice(10000);

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
      .stakeToken(ethers.parseEther(STAKING_AMOUNT_ETHER));

    const stakeRecord = await stakingPool.userStakes(
      await staker_1.getAddress(),
      0
    );
    expect(stakeRecord.amountStaked).to.equal(
      ethers.parseEther(STAKING_AMOUNT_ETHER)
    );
    expect(stakeRecord.claimedReward).to.equal(0);
    expect(stakeRecord.pendingRewardScheduleIndex).to.equal(0);
    expect(stakeRecord.tokenMultipliedPrice).to.equal(1000000);
    expect(stakeRecord.dailyInterestMultipliedPrice).to.equal(1000000n);
  });

  it("최소 스테이킹 금액 이상 일때 스테이킹이 성공한다.", async function () {
    const { stakingPool, suffle, staker_1, owner } =
      await deployStakingPoolFixture();

    await stakingPool.connect(owner).setMinStakePrice(365);

    // staking 은 모금/운영 시에만 가능
    await stakingPool.connect(owner).startFundraising();

    await stakingPool.connect(owner).updateTokenMultipliedPrice(1000000);

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
        .stakeToken(ethers.parseEther(STAKING_AMOUNT_ETHER_364))
    ).to.be.revertedWith("Amount is less than the minimum stakeToken amount");

    const STAKING_AMOUNT_ETHER_365 = "365";
    await suffle
      .connect(staker_1)
      .approve(
        stakingPool.getAddress(),
        ethers.parseEther(STAKING_AMOUNT_ETHER_365)
      );
    await stakingPool
      .connect(staker_1)
      .stakeToken(ethers.parseEther(STAKING_AMOUNT_ETHER_365));
  });

  it("풀의 전체 스테이킹 금액이 최대치를 넘을때 스테이킹은 실패한다.", async function () {
    const { stakingPool, suffle, staker_1, owner } =
      await deployStakingPoolFixture();

    await stakingPool.setMaxFundraisingPrice(1000);

    // staking 은 모금/운영 시에만 가능
    await stakingPool.connect(owner).startFundraising();

    await stakingPool.connect(owner).updateTokenMultipliedPrice(1000000);

    const STAKING_AMOUNT_ETHER_950 = "950";
    await suffle
      .connect(staker_1)
      .approve(
        stakingPool.getAddress(),
        ethers.parseEther(STAKING_AMOUNT_ETHER_950)
      );
    await stakingPool
      .connect(staker_1)
      .stakeToken(ethers.parseEther(STAKING_AMOUNT_ETHER_950));

    const STAKING_AMOUNT_ETHER_364 = "51";
    await suffle
      .connect(staker_1)
      .approve(
        stakingPool.getAddress(),
        ethers.parseEther(STAKING_AMOUNT_ETHER_364)
      );
    await expect(
      stakingPool
        .connect(staker_1)
        .stakeToken(ethers.parseEther(STAKING_AMOUNT_ETHER_364))
    ).to.be.revertedWith("Amount exceeds the maximum fundraising amount");
  });

  it("풀의 전체 스테이킹 금액이 최대치에 도달하면 상태가 모금 잠김 으로 변경된다.", async function () {
    const { stakingPool, suffle, staker_1, owner } =
      await deployStakingPoolFixture();

    await stakingPool.setMaxFundraisingPrice(1000);

    // staking 은 모금/운영 시에만 가능
    await stakingPool.connect(owner).startFundraising();

    await stakingPool.connect(owner).updateTokenMultipliedPrice(1000000);

    const STAKING_AMOUNT_ETHER_950 = "950";
    await suffle
      .connect(staker_1)
      .approve(
        stakingPool.getAddress(),
        ethers.parseEther(STAKING_AMOUNT_ETHER_950)
      );
    await stakingPool
      .connect(staker_1)
      .stakeToken(ethers.parseEther(STAKING_AMOUNT_ETHER_950));

    const STAKING_AMOUNT_ETHER_364 = "50";
    await suffle
      .connect(staker_1)
      .approve(
        stakingPool.getAddress(),
        ethers.parseEther(STAKING_AMOUNT_ETHER_364)
      );
    await stakingPool
      .connect(staker_1)
      .stakeToken(ethers.parseEther(STAKING_AMOUNT_ETHER_364));

    const poolStatus = await stakingPool.state();
    expect(poolStatus).to.equal(PoolState.FundraisingLocked);
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
      .stakeToken(ethers.parseEther(STAKING_AMOUNT_ETHER));

    await stakingPool.connect(owner).updateTokenMultipliedPrice(5000000);

    await suffle
      .connect(staker_2)
      .approve(
        stakingPool.getAddress(),
        ethers.parseEther(STAKING_AMOUNT_ETHER_2)
      );
    await stakingPool
      .connect(staker_2)
      .stakeToken(ethers.parseEther(STAKING_AMOUNT_ETHER_2));

    const stakeRecord_1 = await stakingPool.userStakes(
      await staker_1.getAddress(),
      0
    );
    expect(stakeRecord_1.amountStaked).to.equal(
      ethers.parseEther(STAKING_AMOUNT_ETHER)
    );
    expect(stakeRecord_1.claimedReward).to.equal(0);
    expect(stakeRecord_1.pendingRewardScheduleIndex).to.equal(0);
    expect(stakeRecord_1.tokenMultipliedPrice).to.equal(1000000);
    expect(stakeRecord_1.dailyInterestMultipliedPrice).to.equal(1000000n);

    const stakeRecord_2 = await stakingPool.userStakes(
      await staker_2.getAddress(),
      0
    );
    expect(stakeRecord_2.amountStaked).to.equal(
      ethers.parseEther(STAKING_AMOUNT_ETHER_2)
    );
    expect(stakeRecord_2.claimedReward).to.equal(0);
    expect(stakeRecord_2.pendingRewardScheduleIndex).to.equal(0);
    expect(stakeRecord_2.tokenMultipliedPrice).to.equal(5000000);
    expect(stakeRecord_2.dailyInterestMultipliedPrice).to.equal(10000000n);
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
      .stakeToken(ethers.parseEther(STAKING_AMOUNT_ETHER));

    await stakingPool.connect(owner).updateTokenMultipliedPrice(5000000);

    await suffle
      .connect(staker_1)
      .approve(
        stakingPool.getAddress(),
        ethers.parseEther(STAKING_AMOUNT_ETHER_2)
      );
    await stakingPool
      .connect(staker_1)
      .stakeToken(ethers.parseEther(STAKING_AMOUNT_ETHER_2));

    const stakeRecord_1 = await stakingPool.userStakes(
      await staker_1.getAddress(),
      0
    );
    expect(stakeRecord_1.amountStaked).to.equal(
      ethers.parseEther(STAKING_AMOUNT_ETHER)
    );
    expect(stakeRecord_1.claimedReward).to.equal(0);
    expect(stakeRecord_1.pendingRewardScheduleIndex).to.equal(0);
    expect(stakeRecord_1.tokenMultipliedPrice).to.equal(1000000);
    expect(stakeRecord_1.dailyInterestMultipliedPrice).to.equal(1000000n);

    const stakeRecord_2 = await stakingPool.userStakes(
      await staker_1.getAddress(),
      1
    );
    expect(stakeRecord_2.amountStaked).to.equal(
      ethers.parseEther(STAKING_AMOUNT_ETHER_2)
    );
    expect(stakeRecord_2.claimedReward).to.equal(0);
    expect(stakeRecord_2.pendingRewardScheduleIndex).to.equal(0);
    expect(stakeRecord_2.tokenMultipliedPrice).to.equal(5000000);
    expect(stakeRecord_2.dailyInterestMultipliedPrice).to.equal(10000000n);
  });
});
