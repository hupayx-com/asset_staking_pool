import { ethers, network } from "hardhat";
import { expect } from "chai";
import { Signer } from "ethers";
import {
  Suffle,
  StakingPool,
  StakingPoolFactory,
} from "../typechain-types/index";

describe("관리자의 스테이킹 토큰 전송 기능", function () {
  let stakingPool: StakingPool;
  let suffle: Suffle;
  let owner: Signer;
  let staker_1: Signer;
  let staker_2: Signer;
  let nonAdmin: Signer;
  let stakingPoolFactory: StakingPoolFactory;

  async function deployStakingPoolFixture(): Promise<{
    stakingPool: StakingPool;
    suffle: Suffle;
    owner: Signer;
    staker_1: Signer;
    staker_2: Signer;
    nonAdmin: Signer;
    stakingPoolFactory: StakingPoolFactory;
  }> {
    [owner, staker_1, staker_2, nonAdmin] = await ethers.getSigners();

    // StakingPoolFactory 배포
    const stakingPoolFactoryFactory = await ethers.getContractFactory(
      "StakingPoolFactory"
    );
    stakingPoolFactory =
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

    await stakingPool.setStakingToken(await suffle.getAddress());
    await stakingPool.setAnnualInterestRateMultiplier(100); // 연 이율 1%
    await stakingPool.connect(owner).updateMultipliedTokenPrice(1000000);
    await stakingPool.setMaxFundraisingPrice(10000);

    // faucet for staking
    await suffle.transfer(
      await stakingPool.getAddress(),
      ethers.parseEther("1000000000")
    );
    await suffle.transfer(
      await staker_1.getAddress(),
      ethers.parseEther("1000000000")
    );
    await suffle.transfer(
      await staker_2.getAddress(),
      ethers.parseEther("1000000000")
    );

    return {
      stakingPool,
      suffle,
      owner,
      staker_1,
      staker_2,
      nonAdmin,
      stakingPoolFactory,
    };
  }

  beforeEach(async function () {
    await network.provider.request({
      method: "hardhat_reset",
      params: [],
    });
  });

  it("관리자가 StakingPool에서 스테이킹 토큰을 성공적으로 전송한다", async function () {
    const { stakingPool, suffle, owner, staker_1 } =
      await deployStakingPoolFixture();

    const transferAmount = ethers.parseEther("1000");

    // 스테이킹풀에 suffle 토큰 확인
    let poolBalance = await suffle.balanceOf(await stakingPool.getAddress());
    const initialPoolBalance = poolBalance;
    expect(poolBalance).to.be.above(transferAmount);

    // 수령인의 초기 잔액 확인
    const initialRecipientBalance = await suffle.balanceOf(
      await staker_1.getAddress()
    );

    // 관리자 계정으로 토큰 전송 수행
    await stakingPool
      .connect(owner)
      .transferStakingToken(staker_1.getAddress(), transferAmount);

    // 스테이킹풀 잔액 확인
    poolBalance = await suffle.balanceOf(await stakingPool.getAddress());
    expect(poolBalance).to.equal(initialPoolBalance - transferAmount);

    // 수령인 잔액 확인
    const recipientBalance = await suffle.balanceOf(
      await staker_1.getAddress()
    );
    expect(recipientBalance).to.equal(initialRecipientBalance + transferAmount);
  });

  it("비 관리자가 StakingPool에서 스테이킹 토큰을 전송하려고 할 때 실패한다", async function () {
    const { stakingPool, staker_1, staker_2 } =
      await deployStakingPoolFixture();

    const transferAmount = ethers.parseEther("1000");

    // staker_1 이 관리자 권한 없이 전송 시도, 실패해야 함
    await expect(
      stakingPool
        .connect(staker_1)
        .transferStakingToken(staker_2.getAddress(), transferAmount)
    ).to.be.revertedWith("Not an admin");
  });
});
