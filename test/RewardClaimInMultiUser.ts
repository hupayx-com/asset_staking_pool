import { ethers, network } from "hardhat";
import { expect } from "chai";
import { Signer } from "ethers";
import {
  Suffle,
  StakingPool,
  StakingPoolFactory,
} from "../typechain-types/index";
import { getCurrentBlockchainTime } from "./util";

const SECONDS_IN_A_DAY = 86400;

describe("RewardClaim (다수의 사용자)", function () {
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
    await stakingPool.connect(owner).updateMultipliedTokenPrice(1000000);
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

  it("두 사용자가 스테이킹 후 모든 보상 스케줄이 경과 한 다음 보상을 요청하고, 총 받은 보상을 확인한다.", async function () {
    const { stakingPool, suffle, staker_1, staker_2, owner } =
      await deployStakingPoolFixture();

    // 보상은 staking pool 의 상태가 "운영" 이후부터 가능하다.
    await stakingPool.connect(owner).startFundraising();
    await stakingPool.connect(owner).startOperating();

    await stakingPool.connect(owner).updateMultipliedTokenPrice(1000000);

    const STAKING_AMOUNT_1 = "365";
    const STAKING_AMOUNT_2 = "730";

    await suffle
      .connect(staker_1)
      .approve(stakingPool.getAddress(), ethers.parseEther(STAKING_AMOUNT_1));
    await suffle
      .connect(staker_2)
      .approve(stakingPool.getAddress(), ethers.parseEther(STAKING_AMOUNT_2));

    await stakingPool
      .connect(staker_1)
      .stakeToken(ethers.parseEther(STAKING_AMOUNT_1));
    await stakingPool
      .connect(staker_2)
      .stakeToken(ethers.parseEther(STAKING_AMOUNT_2));

    const currentTime = await getCurrentBlockchainTime();

    await stakingPool.addRewardSchedule(
      1000000,
      currentTime + SECONDS_IN_A_DAY * 1,
      currentTime + SECONDS_IN_A_DAY * 11 // 10일 후
    );
    await stakingPool.addRewardSchedule(
      1000000,
      currentTime + SECONDS_IN_A_DAY * 11,
      currentTime + SECONDS_IN_A_DAY * 21 // 10일 후
    );

    // 시간을 앞당김
    await ethers.provider.send("evm_increaseTime", [SECONDS_IN_A_DAY * 25]);
    await ethers.provider.send("evm_mine");

    // 스테이킹의 보상 청구
    await stakingPool.connect(staker_1).claimRewardToken(0);
    await stakingPool.connect(staker_2).claimRewardToken(0);

    const totalReceivedRewardsStaker1 =
      await stakingPool.calculateAllClaimedRewardToken(
        await staker_1.getAddress()
      );
    const totalReceivedRewardsStaker2 =
      await stakingPool.calculateAllClaimedRewardToken(
        await staker_2.getAddress()
      );

    expect(totalReceivedRewardsStaker1).to.be.equal(ethers.parseEther("20"));
    expect(totalReceivedRewardsStaker2).to.be.equal(ethers.parseEther("40"));
  });

  it("두 사용자가 스테이킹 후 두번째 보상 스케줄 기간 중에 보상을 요청하고, 총 받은 보상을 확인한다.", async function () {
    const { stakingPool, suffle, staker_1, staker_2, owner } =
      await deployStakingPoolFixture();

    // 보상은 staking pool 의 상태가 "운영" 이후부터 가능하다.
    await stakingPool.connect(owner).startFundraising();
    await stakingPool.connect(owner).startOperating();

    await stakingPool.connect(owner).updateMultipliedTokenPrice(1000000);

    const STAKING_AMOUNT_1 = "365";
    const STAKING_AMOUNT_2 = "730";

    await suffle
      .connect(staker_1)
      .approve(stakingPool.getAddress(), ethers.parseEther(STAKING_AMOUNT_1));
    await suffle
      .connect(staker_2)
      .approve(stakingPool.getAddress(), ethers.parseEther(STAKING_AMOUNT_2));

    await stakingPool
      .connect(staker_1)
      .stakeToken(ethers.parseEther(STAKING_AMOUNT_1));
    await stakingPool
      .connect(staker_2)
      .stakeToken(ethers.parseEther(STAKING_AMOUNT_2));

    const currentTime = await getCurrentBlockchainTime();

    await stakingPool.addRewardSchedule(
      1000000,
      currentTime + SECONDS_IN_A_DAY * 1,
      currentTime + SECONDS_IN_A_DAY * 11 // 10일 후
    );
    await stakingPool.addRewardSchedule(
      1000000,
      currentTime + SECONDS_IN_A_DAY * 11,
      currentTime + SECONDS_IN_A_DAY * 21 // 10일 후
    );

    // 시간을 앞당김
    await ethers.provider.send("evm_increaseTime", [SECONDS_IN_A_DAY * 15]);
    await ethers.provider.send("evm_mine");

    // 스테이킹의 보상 청구
    await stakingPool.connect(staker_1).claimRewardToken(0);
    await stakingPool.connect(staker_2).claimRewardToken(0);

    const totalReceivedRewardsStaker1 =
      await stakingPool.calculateAllClaimedRewardToken(
        await staker_1.getAddress()
      );
    const totalReceivedRewardsStaker2 =
      await stakingPool.calculateAllClaimedRewardToken(
        await staker_2.getAddress()
      );

    expect(totalReceivedRewardsStaker1).to.be.equal(ethers.parseEther("10"));
    expect(totalReceivedRewardsStaker2).to.be.equal(ethers.parseEther("20"));
  });

  it("두 사용자가 스테이킹 후 모든 보상 스케줄이 경과 한 다음 한 사용자만 보상을 요청하고, 총 받은 보상을 확인한다.", async function () {
    const { stakingPool, suffle, staker_1, staker_2, owner } =
      await deployStakingPoolFixture();

    // 보상은 staking pool 의 상태가 "운영" 이후부터 가능하다.
    await stakingPool.connect(owner).startFundraising();
    await stakingPool.connect(owner).startOperating();

    await stakingPool.connect(owner).updateMultipliedTokenPrice(1000000);

    const STAKING_AMOUNT_1 = "365";
    const STAKING_AMOUNT_2 = "730";

    await suffle
      .connect(staker_1)
      .approve(stakingPool.getAddress(), ethers.parseEther(STAKING_AMOUNT_1));
    await suffle
      .connect(staker_2)
      .approve(stakingPool.getAddress(), ethers.parseEther(STAKING_AMOUNT_2));

    await stakingPool
      .connect(staker_1)
      .stakeToken(ethers.parseEther(STAKING_AMOUNT_1));
    await stakingPool
      .connect(staker_2)
      .stakeToken(ethers.parseEther(STAKING_AMOUNT_2));

    const currentTime = await getCurrentBlockchainTime();

    await stakingPool.addRewardSchedule(
      2000000,
      currentTime + SECONDS_IN_A_DAY * 1,
      currentTime + SECONDS_IN_A_DAY * 11
    );
    await stakingPool.addRewardSchedule(
      5000000,
      currentTime + SECONDS_IN_A_DAY * 11,
      currentTime + SECONDS_IN_A_DAY * 21
    );

    await ethers.provider.send("evm_increaseTime", [SECONDS_IN_A_DAY * 25]);
    await ethers.provider.send("evm_mine");

    // 사용자 한명만 보상 요청
    await stakingPool.connect(staker_1).claimRewardToken(0);

    const totalReceivedRewardsStaker1 =
      await stakingPool.calculateAllClaimedRewardToken(
        await staker_1.getAddress()
      );
    const totalReceivedRewardsStaker2 =
      await stakingPool.calculateAllClaimedRewardToken(
        await staker_2.getAddress()
      );

    // 사용자가 받은 보상
    expect(totalReceivedRewardsStaker1).to.be.equal(ethers.parseEther("7"));
    expect(totalReceivedRewardsStaker2).to.be.equal(ethers.parseEther("0"));
  });
});
