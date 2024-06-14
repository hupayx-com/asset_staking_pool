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
    await stakingPool.setAnnualInterestRateMultiplier(1); // 연 이율 0.01% == 0.0001
    await stakingPool.connect(owner).updateTokenMultipliedPrice(1000000);
    await stakingPool.setMaxFundraisingPrice(100000000);

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

    const STAKING_AMOUNT_ETHER = "3650000";

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

    const [rewards, nextIndex] =
      await stakingPool.calculatePendingRewardForStake(
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

    const STAKING_AMOUNT_ETHER = "3650000";

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

    const [rewards, nextIndex] =
      await stakingPool.calculatePendingRewardForStake(
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

    const STAKING_AMOUNT_ETHER = "3650000";

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

    const [rewards, nextIndex] =
      await stakingPool.calculatePendingRewardForStake(
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

    const STAKING_AMOUNT_ETHER = "3650000";

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

    const [rewards, nextIndex] =
      await stakingPool.calculatePendingRewardForStake(
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

    const STAKING_AMOUNT_ETHER = "3650000";

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

    const [rewards, nextIndex] =
      await stakingPool.calculatePendingRewardForStake(
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

    const STAKING_AMOUNT_ETHER_365 = "3650000";
    const STAKING_AMOUNT_ETHER_730 = "7300000";

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

    const totalPendingRewards =
      await stakingPool.calculatePendingRewardForAllStakes(
        await staker_1.getAddress()
      );

    // 7 + 14
    expect(totalPendingRewards).to.be.equal(ethers.parseEther("21"));
  });

  it("보상 스케줄 카운트 확인", async function () {
    const { stakingPool, owner } = await deployStakingPoolFixture();

    const start = Math.floor(Date.now() / 1000); // 현재 시간 (초 단위)
    const end = start + 30 * 24 * 60 * 60; // 30일 후

    await stakingPool.connect(owner).startFundraising();
    await stakingPool.connect(owner).startOperating();

    await stakingPool.addRewardSchedule(1500000, start, end);
    await stakingPool.addRewardSchedule(1600000, end, end + 60 * 60 * 24); // +1 day

    const rewardScheduleCount = await stakingPool.getRewardScheduleCount();
    expect(rewardScheduleCount).to.equal(2);
  });

  it("보상 스케줄이 다 지난 후 스테이킹했을 때 보상이 없음을 확인", async function () {
    const { stakingPool, suffle, staker_1, owner } =
      await deployStakingPoolFixture();

    // 보상은 staking pool 의 상태가 "운영" 이후 부터 가능하다.
    await stakingPool.connect(owner).startFundraising();
    await stakingPool.connect(owner).startOperating();

    await stakingPool.connect(owner).updateTokenMultipliedPrice(1000000);

    const currentTime = await getCurrentBlockchainTime();

    await stakingPool.addRewardSchedule(
      2000000,
      currentTime,
      currentTime + SECONDS_IN_A_DAY * 10 // 10일 후 종료
    );

    // 시간을 보상 스케줄 종료 시점 + 1일로 설정
    await ethers.provider.send("evm_increaseTime", [SECONDS_IN_A_DAY * 11]);
    await ethers.provider.send("evm_mine");

    const STAKING_AMOUNT_ETHER = "3650000";

    await suffle
      .connect(staker_1)
      .approve(
        stakingPool.getAddress(),
        ethers.parseEther(STAKING_AMOUNT_ETHER)
      );
    await stakingPool
      .connect(staker_1)
      .stakeToken(ethers.parseEther(STAKING_AMOUNT_ETHER));

    // 스테이킹 직후 보상을 조회합니다.
    const [rewards] = await stakingPool.calculatePendingRewardForStake(
      await staker_1.getAddress(),
      0
    );

    // 보상이 0이어야 함을 확인합니다.
    expect(rewards).to.be.equal(ethers.parseEther("0"));
  });

  it("두 번째 보상 스케줄 기간 내 스테이킹 시, 두번째 보상 스케줄 기간이 지나면 첫 번째 보상은 제외되고 두 번째 보상만 조회", async function () {
    const { stakingPool, suffle, staker_1, owner } =
      await deployStakingPoolFixture();

    // 보상은 staking pool의 상태가 "운영" 이후 부터 가능하다.
    await stakingPool.connect(owner).startFundraising();
    await stakingPool.connect(owner).startOperating();

    await stakingPool.connect(owner).updateTokenMultipliedPrice(1000000);

    const currentTime = await getCurrentBlockchainTime();

    // 첫 번째 보상 스케줄 추가 (1일 후 시작, 10일 후 종료)
    await stakingPool.addRewardSchedule(
      1000000,
      currentTime + SECONDS_IN_A_DAY * 1,
      currentTime + SECONDS_IN_A_DAY * 10
    );

    // 두 번째 보상 스케줄 추가 (11일 후 시작, 20일 후 종료)
    await stakingPool.addRewardSchedule(
      1000000,
      currentTime + SECONDS_IN_A_DAY * 10,
      currentTime + SECONDS_IN_A_DAY * 20
    );

    // 두 번째 보상 스케줄 기간 내에 스테이킹 (12일 후)
    await ethers.provider.send("evm_increaseTime", [SECONDS_IN_A_DAY * 12]);
    await ethers.provider.send("evm_mine");

    const STAKING_AMOUNT_ETHER = "3650000";

    await suffle
      .connect(staker_1)
      .approve(
        stakingPool.getAddress(),
        ethers.parseEther(STAKING_AMOUNT_ETHER)
      );
    await stakingPool
      .connect(staker_1)
      .stakeToken(ethers.parseEther(STAKING_AMOUNT_ETHER));

    // 전체 보상 스케줄이 지난 시점
    await ethers.provider.send("evm_increaseTime", [SECONDS_IN_A_DAY * 10]);
    await ethers.provider.send("evm_mine");

    // 보상을 조회합니다.
    const [rewards] = await stakingPool.calculatePendingRewardForStake(
      await staker_1.getAddress(),
      0
    );

    // 첫 번째 보상은 제외되고 두 번째 보상 스케줄에 대한 보상만 조회되어야 합니다.
    // 두 번째 보상 스케줄은 9일 동안 유효합니다.
    // 보상의 예상치 계산
    const expectedReward =
      (ethers.parseEther(STAKING_AMOUNT_ETHER) * 3000000n * 9n * 1n) / 3650000n; // 연 이율 0.01%를 반영, 이 값은 examples에서 설정되어 있는 대로 조정

    expect(rewards).to.be.equal(ethers.parseEther("7"));
  });
});
