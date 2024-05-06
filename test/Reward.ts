import { ethers } from "hardhat";
import { expect } from "chai";
import { Signer } from "ethers";
import { Suffle, StakingPool } from "../typechain-types/index";

describe("StakingPool", function () {
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
    await stakingPool.setInterestRate(10);

    await suffle.transfer(
      await staker_1.getAddress(),
      ethers.parseEther("1000000")
    );

    return { stakingPool, suffle, owner, staker_1, staker_2 };
  }

  describe("Staking", function () {
    it("Should allow users to stake tokens", async function () {
      const { stakingPool, suffle, staker_1, owner } =
        await deployStakingPoolFixture();

      // 스테이킹 풀의 상태를 Fundraising으로 변경
      await stakingPool.connect(owner).startFundraising();

      await suffle
        .connect(staker_1)
        .approve(stakingPool.getAddress(), ethers.parseEther("100"));
      await stakingPool.connect(staker_1).stake(ethers.parseEther("100"));

      const stakeInfo = await stakingPool.stakeInfos(
        await staker_1.getAddress(),
        0
      );
      expect(stakeInfo.amountStaked).to.equal(ethers.parseEther("100"));
    });
  });

  describe("Claiming Rewards", function () {
    it("Should allow users to claim rewards after some time", async function () {
      const { stakingPool, suffle, staker_1, owner } =
        await deployStakingPoolFixture();

      // 스테이킹 풀의 상태를 Fundraising으로 변경
      await stakingPool.connect(owner).startFundraising();

      await stakingPool.connect(owner).startOperating();

      await stakingPool.connect(staker_1).updateScaledTokenPrice(1000000);

      const STAKING_AMOUNT_ETHER = "3650";

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
      console.log(unixTimeSeconds);

      await stakingPool.addRewardPeriod(
        2000000, // 스케일업된 토큰 가격
        unixTimeSeconds + 86400 * 1,
        unixTimeSeconds + 86400 * 11 // 10일 후
      );

      // 시간을 앞당김
      await ethers.provider.send("evm_increaseTime", [86400 * 15]);
      await ethers.provider.send("evm_mine");

      const rewards = await stakingPool.viewReward(
        await staker_1.getAddress(),
        0
      );
      expect(rewards).to.be.equal(ethers.parseEther("5"));

      await stakingPool.connect(staker_1).claimReward(0);
    });
  });
});
