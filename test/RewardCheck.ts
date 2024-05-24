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

describe("RewardCheck", function () {
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

    return { stakingPool, suffle, owner, staker_1, staker_2 };
  }

  beforeEach(async function () {
    await network.provider.request({
      method: "hardhat_reset",
      params: [],
    });
  });

  it("최초 보상 기간 전 보상이 없음을 확인한다.", async function () {
    const { stakingPool, suffle, staker_1, owner } =
      await deployStakingPoolFixture();

    // 보상은 staking pool 의 상태가 "운영" 이후 부터 가능하다.
    await stakingPool.connect(owner).startFundraising();
    await stakingPool.connect(owner).startOperating();

    await stakingPool.connect(owner).updateTokenMultipliedPrice(1000000);

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

    const currentTime = await getCurrentBlockchainTime();

    await stakingPool.addRewardSchedule(
      2000000,
      currentTime + SECONDS_IN_A_DAY * 10,
      currentTime + SECONDS_IN_A_DAY * 20 // 10일 후
    );

    // 시간을 앞당김
    await ethers.provider.send("evm_increaseTime", [SECONDS_IN_A_DAY * 1]);
    await ethers.provider.send("evm_mine");

    const [rewards, nextIndex] = await stakingPool.calculatePendingReward(
      await staker_1.getAddress(),
      0
    );
    expect(rewards).to.be.equal(ethers.parseEther("0"));

    const stakeRecord = await stakingPool.userStakes(
      await staker_1.getAddress(),
      0
    );
    expect(stakeRecord.claimedReward).to.equal(0);
    expect(stakeRecord.pendingRewardScheduleIndex).to.equal(0);
  });

  it("모든 보상 기간 후 전체 보상을 확인한다.(총 보상 횟수: 1)", async function () {
    const { stakingPool, suffle, staker_1, owner } =
      await deployStakingPoolFixture();

    // 보상은 staking pool 의 상태가 "운영" 이후 부터 가능하다.
    await stakingPool.connect(owner).startFundraising();
    await stakingPool.connect(owner).startOperating();

    await stakingPool.connect(owner).updateTokenMultipliedPrice(1000000);

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

    const currentTime = await getCurrentBlockchainTime();

    await stakingPool.addRewardSchedule(
      2000000,
      currentTime + SECONDS_IN_A_DAY * 1,
      currentTime + SECONDS_IN_A_DAY * 11 // 10일 후
    );

    // 시간을 앞당김
    await ethers.provider.send("evm_increaseTime", [SECONDS_IN_A_DAY * 15]);
    await ethers.provider.send("evm_mine");

    const [rewards, nextIndex] = await stakingPool.calculatePendingReward(
      await staker_1.getAddress(),
      0
    );
    expect(rewards).to.be.equal(ethers.parseEther("5"));

    const stakeRecord = await stakingPool.userStakes(
      await staker_1.getAddress(),
      0
    );
    expect(stakeRecord.claimedReward).to.equal(0);
    expect(stakeRecord.pendingRewardScheduleIndex).to.equal(0);
  });

  it("모든 보상 기간 후 전체 보상을 확인한다.(총 보상 횟수: 2)", async function () {
    const { stakingPool, suffle, staker_1, owner } =
      await deployStakingPoolFixture();

    // 보상은 staking pool 의 상태가 "운영" 이후 부터 가능하다.
    await stakingPool.connect(owner).startFundraising();
    await stakingPool.connect(owner).startOperating();

    await stakingPool.connect(owner).updateTokenMultipliedPrice(1000000);

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

    const currentTime = await getCurrentBlockchainTime();

    await stakingPool.addRewardSchedule(
      2000000,
      currentTime + SECONDS_IN_A_DAY * 1,
      currentTime + SECONDS_IN_A_DAY * 11 // 10일 후
    );
    await stakingPool.addRewardSchedule(
      5000000,
      currentTime + SECONDS_IN_A_DAY * 11,
      currentTime + SECONDS_IN_A_DAY * 21 // 10일 후
    );

    // 시간을 앞당김
    await ethers.provider.send("evm_increaseTime", [SECONDS_IN_A_DAY * 25]);
    await ethers.provider.send("evm_mine");

    const [rewards, nextIndex] = await stakingPool.calculatePendingReward(
      await staker_1.getAddress(),
      0
    );
    // 7 = 5 + 2
    expect(rewards).to.be.equal(ethers.parseEther("7"));

    const stakeRecord = await stakingPool.userStakes(
      await staker_1.getAddress(),
      0
    );
    expect(stakeRecord.claimedReward).to.equal(0);
    expect(stakeRecord.pendingRewardScheduleIndex).to.equal(0);
  });

  it("1 번째 보상 기간 내 보상이 없음을 확인한다.(총 보상 횟수: 2)", async function () {
    const { stakingPool, suffle, staker_1, owner } =
      await deployStakingPoolFixture();

    // 보상은 staking pool 의 상태가 "운영" 이후 부터 가능하다.
    await stakingPool.connect(owner).startFundraising();
    await stakingPool.connect(owner).startOperating();

    await stakingPool.connect(owner).updateTokenMultipliedPrice(1000000);

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

    const currentTime = await getCurrentBlockchainTime();

    await stakingPool.addRewardSchedule(
      2000000,
      currentTime + SECONDS_IN_A_DAY * 1,
      currentTime + SECONDS_IN_A_DAY * 11 // 10일 후
    );
    await stakingPool.addRewardSchedule(
      5000000,
      currentTime + SECONDS_IN_A_DAY * 11,
      currentTime + SECONDS_IN_A_DAY * 21 // 10일 후
    );

    // 시간을 앞당김
    // 2: 위의 addRewardSchedule 를 2 번 호출
    await ethers.provider.send("evm_increaseTime", [SECONDS_IN_A_DAY * 5 - 2]);
    await ethers.provider.send("evm_mine");

    const [rewards, nextIndex] = await stakingPool.calculatePendingReward(
      await staker_1.getAddress(),
      0
    );
    expect(rewards).to.be.equal(ethers.parseEther("0"));

    const stakeRecord = await stakingPool.userStakes(
      await staker_1.getAddress(),
      0
    );
    expect(stakeRecord.claimedReward).to.equal(0);
    expect(stakeRecord.pendingRewardScheduleIndex).to.equal(0);
  });

  it("2 번째 보상 기간 내 1 번째 보상만을 확인한다.(총 보상 횟수: 2)", async function () {
    const { stakingPool, suffle, staker_1, owner } =
      await deployStakingPoolFixture();

    // 보상은 staking pool 의 상태가 "운영" 이후 부터 가능하다.
    await stakingPool.connect(owner).startFundraising();
    await stakingPool.connect(owner).startOperating();

    await stakingPool.connect(owner).updateTokenMultipliedPrice(1000000);

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

    const currentTime = await getCurrentBlockchainTime();

    await stakingPool.addRewardSchedule(
      2000000,
      currentTime + SECONDS_IN_A_DAY * 1,
      currentTime + SECONDS_IN_A_DAY * 11 // 10일 후
    );
    await stakingPool.addRewardSchedule(
      5000000,
      currentTime + SECONDS_IN_A_DAY * 11,
      currentTime + SECONDS_IN_A_DAY * 21 // 10일 후
    );

    // 시간을 앞당김
    // 2: 위의 addRewardSchedule 를 2 번 호출
    await ethers.provider.send("evm_increaseTime", [SECONDS_IN_A_DAY * 16 - 2]);
    await ethers.provider.send("evm_mine");

    const [rewards, nextIndex] = await stakingPool.calculatePendingReward(
      await staker_1.getAddress(),
      0
    );
    expect(rewards).to.be.equal(ethers.parseEther("5"));

    const stakeRecord = await stakingPool.userStakes(
      await staker_1.getAddress(),
      0
    );
    expect(stakeRecord.claimedReward).to.equal(0);
    expect(stakeRecord.pendingRewardScheduleIndex).to.equal(0);
  });

  it("한 사용자가 2 번 스테이킹 후 2 번의 보상 스케줄이 지나서 총 받을 보상을 확인한다.", async function () {
    const { stakingPool, suffle, staker_1, owner } =
      await deployStakingPoolFixture();

    // 보상은 staking pool 의 상태가 "운영" 이후 부터 가능하다.
    await stakingPool.connect(owner).startFundraising();
    await stakingPool.connect(owner).startOperating();

    await stakingPool.connect(owner).updateTokenMultipliedPrice(1000000);

    const STAKING_AMOUNT_ETHER_365 = "365";
    const STAKING_AMOUNT_ETHER_730 = "730";

    await suffle
      .connect(staker_1)
      .approve(
        stakingPool.getAddress(),
        ethers.parseEther(STAKING_AMOUNT_ETHER_365)
      );
    await stakingPool
      .connect(staker_1)
      .stakeToken(ethers.parseEther(STAKING_AMOUNT_ETHER_365));

    await suffle
      .connect(staker_1)
      .approve(
        stakingPool.getAddress(),
        ethers.parseEther(STAKING_AMOUNT_ETHER_730)
      );
    await stakingPool
      .connect(staker_1)
      .stakeToken(ethers.parseEther(STAKING_AMOUNT_ETHER_730));

    const currentTime = await getCurrentBlockchainTime();

    await stakingPool.addRewardSchedule(
      2000000,
      currentTime + SECONDS_IN_A_DAY * 1,
      currentTime + SECONDS_IN_A_DAY * 11 // 10일 후
    );
    await stakingPool.addRewardSchedule(
      5000000,
      currentTime + SECONDS_IN_A_DAY * 11,
      currentTime + SECONDS_IN_A_DAY * 21 // 10일 후
    );

    // 시간을 앞당김
    await ethers.provider.send("evm_increaseTime", [SECONDS_IN_A_DAY * 25]);
    await ethers.provider.send("evm_mine");

    const totalPendingRewards = await stakingPool.calculateAllPendingReward(
      await staker_1.getAddress()
    );

    // 7 + 14
    expect(totalPendingRewards).to.be.equal(ethers.parseEther("21"));
  });
});
