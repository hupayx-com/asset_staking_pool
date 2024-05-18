import { ethers, network } from "hardhat";
import { expect } from "chai";
import { Signer } from "ethers";
import { Suffle, StakingPool } from "../typechain-types/index";
import { getCurrentBlockchainTime } from "./util";

const SECONDS_IN_A_DAY = 86400;

describe("RewardClaim", function () {
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

  it("모든 보상 기간이 지난 후 전체 보상을 요청한다.(총 보상 횟수: 1)", async function () {
    const { stakingPool, suffle, staker_1, owner } =
      await deployStakingPoolFixture();

    // 보상은 staking pool 의 상태가 "운영" 이후 부터 가능하다.
    await stakingPool.connect(owner).startFundraising();
    await stakingPool.connect(owner).startOperating();

    await stakingPool.connect(owner).updateScaledTokenPrice(1000000);

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

    const currentTime = await getCurrentBlockchainTime();

    await stakingPool.addRewardSchedule(
      2000000, // 스케일업된 토큰 가격
      currentTime + SECONDS_IN_A_DAY * 1,
      currentTime + SECONDS_IN_A_DAY * 11 // 10일 후
    );

    // 시간을 앞당김
    await ethers.provider.send("evm_increaseTime", [SECONDS_IN_A_DAY * 15]);
    await ethers.provider.send("evm_mine");

    // 보상 청구 전 사용자의 토큰 잔액 확인
    const initialBalance = await suffle.balanceOf(await staker_1.getAddress());

    await stakingPool.connect(staker_1).claimRewardToken(0);

    // 보상 청구 후 사용자의 토큰 잔액 확인
    const finalBalance = await suffle.balanceOf(await staker_1.getAddress());

    // 예상되는 보상 금액
    const expectedReward = ethers.parseEther("5");

    // 잔액 비교
    expect(finalBalance - initialBalance).to.equal(expectedReward);

    const stakeRecord = await stakingPool.stakingRecords(
      await staker_1.getAddress(),
      0
    );
    expect(stakeRecord.receivedRewardToken).to.equal(ethers.parseEther("5"));
    expect(stakeRecord.pendingRewardScheduleIndex).to.equal(1);
  });

  it("모든 보상 기간이 지난 후 전체 보상을 요청한다.(총 보상 횟수: 2)", async function () {
    const { stakingPool, suffle, staker_1, owner } =
      await deployStakingPoolFixture();

    // 보상은 staking pool 의 상태가 "운영" 이후 부터 가능하다.
    await stakingPool.connect(owner).startFundraising();
    await stakingPool.connect(owner).startOperating();

    await stakingPool.connect(owner).updateScaledTokenPrice(1000000);

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

    const currentTime = await getCurrentBlockchainTime();

    await stakingPool.addRewardSchedule(
      2000000, // 스케일업된 토큰 가격
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

    // 보상 청구 전 사용자의 토큰 잔액 확인
    const initialBalance = await suffle.balanceOf(await staker_1.getAddress());

    await stakingPool.connect(staker_1).claimRewardToken(0);

    // 보상 청구 후 사용자의 토큰 잔액 확인
    const finalBalance = await suffle.balanceOf(await staker_1.getAddress());

    // 예상되는 보상 금액
    // 7 = 5 + 2
    const expectedReward = ethers.parseEther("7");

    // 잔액 비교
    expect(finalBalance - initialBalance).to.equal(expectedReward);

    const stakeRecord = await stakingPool.stakingRecords(
      await staker_1.getAddress(),
      0
    );
    expect(stakeRecord.receivedRewardToken).to.equal(ethers.parseEther("7"));
    expect(stakeRecord.pendingRewardScheduleIndex).to.equal(2);
  });

  it("1 번째 보상 기간 내 보상 요청 시 보상은 없다.(총 보상 횟수: 2)", async function () {
    const { stakingPool, suffle, staker_1, owner } =
      await deployStakingPoolFixture();

    // 보상은 staking pool 의 상태가 "운영" 이후 부터 가능하다.
    await stakingPool.connect(owner).startFundraising();
    await stakingPool.connect(owner).startOperating();

    await stakingPool.connect(owner).updateScaledTokenPrice(1000000);

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

    const currentTime = await getCurrentBlockchainTime();

    let passedTime = 0;
    await stakingPool.addRewardSchedule(
      2000000, // 스케일업된 토큰 가격
      currentTime + SECONDS_IN_A_DAY * 1,
      currentTime + SECONDS_IN_A_DAY * 11 // 10일 후
    );
    passedTime++;
    await stakingPool.addRewardSchedule(
      5000000,
      currentTime + SECONDS_IN_A_DAY * 11,
      currentTime + SECONDS_IN_A_DAY * 21 // 10일 후
    );
    passedTime++;

    // 시간을 앞당김
    await ethers.provider.send("evm_increaseTime", [
      SECONDS_IN_A_DAY * 11 - (passedTime + 2),
    ]);
    await ethers.provider.send("evm_mine");

    // 보상 청구 전 사용자의 토큰 잔액 확인
    const initialBalance = await suffle.balanceOf(await staker_1.getAddress());

    // 보상 청구 시 오류 발생 확인
    await expect(
      stakingPool.connect(staker_1).claimRewardToken(0)
    ).to.be.revertedWith("No reward available");

    // 보상 청구 후 사용자의 토큰 잔액 확인
    const finalBalance = await suffle.balanceOf(await staker_1.getAddress());

    // 예상되는 보상 금액
    const expectedReward = ethers.parseEther("0");

    // 잔액 비교
    expect(finalBalance - initialBalance).to.equal(expectedReward);

    const stakeRecord = await stakingPool.stakingRecords(
      await staker_1.getAddress(),
      0
    );
    expect(stakeRecord.receivedRewardToken).to.equal(ethers.parseEther("0"));
    expect(stakeRecord.pendingRewardScheduleIndex).to.equal(0);
  });

  it("2 번째 보상 기간 내 보상 요청 시 1 번째 보상만을 수령한다.(총 보상 횟수: 2)", async function () {
    const { stakingPool, suffle, staker_1, owner } =
      await deployStakingPoolFixture();

    // 보상은 staking pool 의 상태가 "운영" 이후 부터 가능하다.
    await stakingPool.connect(owner).startFundraising();
    await stakingPool.connect(owner).startOperating();

    await stakingPool.connect(owner).updateScaledTokenPrice(1000000);

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

    const currentTime = await getCurrentBlockchainTime();

    await stakingPool.addRewardSchedule(
      2000000, // 스케일업된 토큰 가격
      currentTime + SECONDS_IN_A_DAY * 1,
      currentTime + SECONDS_IN_A_DAY * 11 // 10일 후
    );
    await stakingPool.addRewardSchedule(
      5000000,
      currentTime + SECONDS_IN_A_DAY * 11,
      currentTime + SECONDS_IN_A_DAY * 21 // 10일 후
    );

    // 시간을 앞당김
    await ethers.provider.send("evm_increaseTime", [SECONDS_IN_A_DAY * 16 - 2]);
    await ethers.provider.send("evm_mine");

    // 보상 청구 전 사용자의 토큰 잔액 확인
    const initialBalance = await suffle.balanceOf(await staker_1.getAddress());

    await stakingPool.connect(staker_1).claimRewardToken(0);

    // 보상 청구 후 사용자의 토큰 잔액 확인
    const finalBalance = await suffle.balanceOf(await staker_1.getAddress());

    // 예상되는 보상 금액
    // 5
    const expectedReward = ethers.parseEther("5");

    // 잔액 비교
    expect(finalBalance - initialBalance).to.equal(expectedReward);

    const stakeRecord = await stakingPool.stakingRecords(
      await staker_1.getAddress(),
      0
    );
    expect(stakeRecord.receivedRewardToken).to.equal(ethers.parseEther("5"));
    expect(stakeRecord.pendingRewardScheduleIndex).to.equal(1);
  });

  it("2 번째 보상 기간 내 보상 요청 후 3 번째 보상 기간 내 보상을 요청한다.(총 보상 횟수: 3)", async function () {
    const { stakingPool, suffle, staker_1, owner } =
      await deployStakingPoolFixture();

    // 보상은 staking pool 의 상태가 "운영" 이후 부터 가능하다.
    await stakingPool.connect(owner).startFundraising();
    await stakingPool.connect(owner).startOperating();

    await stakingPool.connect(owner).updateScaledTokenPrice(1000000);

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

    const currentTime = await getCurrentBlockchainTime();

    await stakingPool.addRewardSchedule(
      2000000, // 스케일업된 토큰 가격
      currentTime + SECONDS_IN_A_DAY * 1,
      currentTime + SECONDS_IN_A_DAY * 11 // 10일 후
    );
    await stakingPool.addRewardSchedule(
      5000000,
      currentTime + SECONDS_IN_A_DAY * 11,
      currentTime + SECONDS_IN_A_DAY * 21 // 10일 후
    );
    await stakingPool.addRewardSchedule(
      1000000,
      currentTime + SECONDS_IN_A_DAY * 21,
      currentTime + SECONDS_IN_A_DAY * 31 // 10일 후
    );

    ///////////////////
    // 1 번째 보상 요청 //
    ///////////////////

    // 시간을 앞당김
    await ethers.provider.send("evm_increaseTime", [SECONDS_IN_A_DAY * 11 - 2]);
    await ethers.provider.send("evm_mine");

    // 보상 청구 전 사용자의 토큰 잔액 확인
    let initialBalance = await suffle.balanceOf(await staker_1.getAddress());

    // 보상 청구 시 오류 발생 확인
    await stakingPool.connect(staker_1).claimRewardToken(0);

    // 보상 청구 후 사용자의 토큰 잔액 확인
    let finalBalance = await suffle.balanceOf(await staker_1.getAddress());

    // 예상되는 보상 금액
    let expectedReward = ethers.parseEther("5");

    // 잔액 비교
    expect(finalBalance - initialBalance).to.equal(expectedReward);

    let stakeRecord = await stakingPool.stakingRecords(
      await staker_1.getAddress(),
      0
    );
    expect(stakeRecord.receivedRewardToken).to.equal(ethers.parseEther("5"));
    expect(stakeRecord.pendingRewardScheduleIndex).to.equal(1);

    ///////////////////
    // 2 번째 보상 요청 //
    ///////////////////

    // 시간을 앞당김
    await ethers.provider.send("evm_increaseTime", [SECONDS_IN_A_DAY * 10 - 3]);
    await ethers.provider.send("evm_mine");

    // 보상 청구 전 사용자의 토큰 잔액 확인
    initialBalance = await suffle.balanceOf(await staker_1.getAddress());

    await stakingPool.connect(staker_1).claimRewardToken(0);

    // 보상 청구 후 사용자의 토큰 잔액 확인
    finalBalance = await suffle.balanceOf(await staker_1.getAddress());

    // 예상되는 보상 금액
    expectedReward = ethers.parseEther("2");

    // 잔액 비교
    expect(finalBalance - initialBalance).to.equal(expectedReward);

    stakeRecord = await stakingPool.stakingRecords(
      await staker_1.getAddress(),
      0
    );
    // 5(1th) + 2(2th)
    expect(stakeRecord.receivedRewardToken).to.equal(ethers.parseEther("7"));
    expect(stakeRecord.pendingRewardScheduleIndex).to.equal(2);
  });

  it("1 번째 보상 기간내에 staking 하고 2 번째 보상 기간내에 보상을 요청한다.(총 보상 횟수: 2)", async function () {
    const { stakingPool, suffle, staker_1, owner } =
      await deployStakingPoolFixture();

    // 보상은 staking pool 의 상태가 "운영" 이후 부터 가능하다.
    await stakingPool.connect(owner).startFundraising();
    await stakingPool.connect(owner).startOperating();

    await stakingPool.connect(owner).updateScaledTokenPrice(1000000);

    const STAKING_AMOUNT_ETHER = "365";

    let currentTime = await getCurrentBlockchainTime();

    await stakingPool.addRewardSchedule(
      2000000, // 스케일업된 토큰 가격
      currentTime + SECONDS_IN_A_DAY * 1,
      currentTime + SECONDS_IN_A_DAY * 11 // 10일 후
    );
    await stakingPool.addRewardSchedule(
      5000000,
      currentTime + SECONDS_IN_A_DAY * 11,
      currentTime + SECONDS_IN_A_DAY * 21 // 10일 후
    );

    // 시간을 앞당김
    // 유효 스테이킹 기간 5일
    await ethers.provider.send("evm_increaseTime", [SECONDS_IN_A_DAY * 6 - 4]);
    await ethers.provider.send("evm_mine");

    await suffle
      .connect(staker_1)
      .approve(
        stakingPool.getAddress(),
        ethers.parseEther(STAKING_AMOUNT_ETHER)
      );
    await stakingPool
      .connect(staker_1)
      .stake(ethers.parseEther(STAKING_AMOUNT_ETHER));

    // 시간을 앞당김
    await ethers.provider.send("evm_increaseTime", [SECONDS_IN_A_DAY * 5 + 5]);
    await ethers.provider.send("evm_mine");

    // 보상 청구 전 사용자의 토큰 잔액 확인
    const initialBalance = await suffle.balanceOf(await staker_1.getAddress());

    await stakingPool.connect(staker_1).claimRewardToken(0);

    // 보상 청구 후 사용자의 토큰 잔액 확인
    const finalBalance = await suffle.balanceOf(await staker_1.getAddress());

    // 예상되는 보상 금액
    const expectedReward = ethers.parseEther("2.5");

    // 잔액 비교
    expect(finalBalance - initialBalance).to.equal(expectedReward);

    const stakeRecord = await stakingPool.stakingRecords(
      await staker_1.getAddress(),
      0
    );
    expect(stakeRecord.receivedRewardToken).to.equal(ethers.parseEther("2.5"));
    expect(stakeRecord.pendingRewardScheduleIndex).to.equal(1);
  });

  it("한 사용자가 2 번 스테이킹 -> 2 번의 보상 스케줄 경과 -> 모든 보상 요청 -> 총 받은 보상을 확인한다.", async function () {
    const { stakingPool, suffle, staker_1, owner } =
      await deployStakingPoolFixture();

    // 보상은 staking pool 의 상태가 "운영" 이후 부터 가능하다.
    await stakingPool.connect(owner).startFundraising();
    await stakingPool.connect(owner).startOperating();

    await stakingPool.connect(owner).updateScaledTokenPrice(1000000);

    const STAKING_AMOUNT_1 = "365";
    const STAKING_AMOUNT_2 = "730";

    await suffle
      .connect(staker_1)
      .approve(stakingPool.getAddress(), ethers.parseEther(STAKING_AMOUNT_1));
    await stakingPool
      .connect(staker_1)
      .stake(ethers.parseEther(STAKING_AMOUNT_1));

    await suffle
      .connect(staker_1)
      .approve(stakingPool.getAddress(), ethers.parseEther(STAKING_AMOUNT_2));
    await stakingPool
      .connect(staker_1)
      .stake(ethers.parseEther(STAKING_AMOUNT_2));

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
    await stakingPool.connect(staker_1).claimRewardToken(1);

    const totalReceivedRewards = await stakingPool.getTotalReceivedRewardToken(
      await staker_1.getAddress()
    );

    // 사용자가 받은 보상
    // 첫 번째 스테이킹(365): 20
    // 두 번째 스테이킹(730): 40
    expect(totalReceivedRewards).to.be.equal(ethers.parseEther("60"));
  });
});
