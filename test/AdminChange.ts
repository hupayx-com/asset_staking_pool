import { ethers, network } from "hardhat";

import { expect } from "chai";

import { Signer } from "ethers";

import {
  Suffle,
  StakingPool,
  StakingPoolFactory,
} from "../typechain-types/index";

describe("Admin 변경", function () {
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
    await stakingPool.connect(owner).updateTokenMultipliedPrice(1000000);
    await stakingPool.setMaxFundraisingPrice(10000000000);

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

  it("StakingPool 에서 Admin 변경이 성공적으로 이루어진다", async function () {
    const { stakingPool, owner, nonAdmin } = await deployStakingPoolFixture();

    // 기본 admin은 배포한 소유자(owner)로 설정됨
    const initialAdmin = await stakingPool.admin();
    expect(initialAdmin).to.equal(await owner.getAddress());

    // nonAdmin을 새 admin으로 변경함
    await stakingPool.connect(owner).changeAdmin(nonAdmin.getAddress());

    // admin이 성공적으로 변경되었는지 확인
    const newAdmin = await stakingPool.admin();
    expect(newAdmin).to.equal(await nonAdmin.getAddress());
  });

  it("StakingPool 에서 비 관리자 계정이 admin을 변경하려고 할 때 실패한다", async function () {
    const { stakingPool, staker_1, nonAdmin } =
      await deployStakingPoolFixture();

    // staker_1이 admin 변경 시도, 실패해야 함
    await expect(
      stakingPool.connect(staker_1).changeAdmin(nonAdmin.getAddress())
    ).to.be.revertedWith("Not an admin");
  });

  it("StakingPoolFactory 에서 Admin 변경이 성공적으로 이루어진다", async function () {
    const { stakingPoolFactory, owner, nonAdmin } =
      await deployStakingPoolFixture();

    // 기본 admin은 배포한 소유자(owner)로 설정됨
    const initialFactoryAdmin = await stakingPoolFactory.admin();
    expect(initialFactoryAdmin).to.equal(await owner.getAddress());

    // nonAdmin을 새 admin으로 변경함
    await stakingPoolFactory.connect(owner).changeAdmin(nonAdmin.getAddress());

    // admin이 성공적으로 변경되었는지 확인
    const newFactoryAdmin = await stakingPoolFactory.admin();
    expect(newFactoryAdmin).to.equal(await nonAdmin.getAddress());
  });

  it("StakingPoolFactory 에서 비 관리자 계정이 admin을 변경하려고 할 때 실패한다", async function () {
    const { stakingPoolFactory, nonAdmin } = await deployStakingPoolFixture();

    [, staker_1] = await ethers.getSigners();

    // staker_1이 admin 변경 시도, 실패해야 함
    await expect(
      stakingPoolFactory.connect(staker_1).changeAdmin(nonAdmin.getAddress())
    ).to.be.revertedWith("Not an admin");
  });
});
