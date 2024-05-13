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

  it("사용자가 토큰을 스테이킹 한다.", async function () {
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
    expect(stakeRecord.nextPendingRewardScheduleIndex).to.equal(0);
    expect(stakeRecord.scaledTokenPrice).to.equal(1000000);
    expect(stakeRecord.dailyInterest).to.equal(ethers.parseEther("1"));
  });
});
