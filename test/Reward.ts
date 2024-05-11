import { ethers, network } from "hardhat";
import { expect } from "chai";
import { Signer } from "ethers";
import { Suffle, StakingPool } from "../typechain-types/index";

describe("Reward", function () {
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

    return { stakingPool, suffle, owner, staker_1, staker_2 };
  }

  beforeEach(async function () {
    await network.provider.request({
      method: "hardhat_reset",
      params: [],
    });
  });

  it("보상 가능 시점 전에 사용자가 보상을 확인한다.", async function () {
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

    const unixTimeSeconds = Math.floor(Date.now() / 1000);

    await stakingPool.addRewardSchedule(
      2000000,
      unixTimeSeconds + 86400 * 10,
      unixTimeSeconds + 86400 * 20 // 10일 후
    );

    // 시간을 앞당김
    await ethers.provider.send("evm_increaseTime", [86400 * 1]);
    await ethers.provider.send("evm_mine");

    const [rewards, nextIndex] = await stakingPool.getPendingRewardToken(
      await staker_1.getAddress(),
      0
    );
    expect(rewards).to.be.equal(ethers.parseEther("0"));

    const stakeRecord = await stakingPool.stakingRecords(
      await staker_1.getAddress(),
      0
    );
    expect(stakeRecord.receivedRewardToken).to.equal(0);
    expect(stakeRecord.firstPendingRewardScheduleIndex).to.equal(0);
  });

  it("보상 가능 시점에 사용자가 보상을 확인한다.", async function () {
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

    const unixTimeSeconds = Math.floor(Date.now() / 1000);

    await stakingPool.addRewardSchedule(
      2000000,
      unixTimeSeconds + 86400 * 1,
      unixTimeSeconds + 86400 * 11 // 10일 후
    );

    // 시간을 앞당김
    await ethers.provider.send("evm_increaseTime", [86400 * 15]);
    await ethers.provider.send("evm_mine");

    const [rewards, nextIndex] = await stakingPool.getPendingRewardToken(
      await staker_1.getAddress(),
      0
    );
    expect(rewards).to.be.equal(ethers.parseEther("5"));

    const stakeRecord = await stakingPool.stakingRecords(
      await staker_1.getAddress(),
      0
    );
    expect(stakeRecord.receivedRewardToken).to.equal(0);
    expect(stakeRecord.firstPendingRewardScheduleIndex).to.equal(0);
  });

  it("보상 가능 시점에 사용자가 보상을 요청하고 잔액을 확인한다.", async function () {
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

    const unixTimeSeconds = Math.floor(Date.now() / 1000);

    await stakingPool.addRewardSchedule(
      2000000, // 스케일업된 토큰 가격
      unixTimeSeconds + 86400 * 1,
      unixTimeSeconds + 86400 * 11 // 10일 후
    );

    // 시간을 앞당김
    await ethers.provider.send("evm_increaseTime", [86400 * 15]);
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
    expect(stakeRecord.firstPendingRewardScheduleIndex).to.equal(0);
  });
});
