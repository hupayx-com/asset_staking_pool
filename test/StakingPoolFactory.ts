import { ethers, network } from "hardhat";
import { expect } from "chai";
import { Signer } from "ethers";
import { StakingPoolFactory } from "../typechain-types"; // 필요한 타입을 가져옵니다.

describe("StakingPoolFactory", function () {
  let stakingPoolFactory: StakingPoolFactory;
  let owner: Signer;
  let user: Signer;

  async function deployStakingPoolFactory(): Promise<{
    stakingPoolFactory: StakingPoolFactory;
    owner: Signer;
    user: Signer;
  }> {
    [owner, user] = await ethers.getSigners();

    const stakingPoolFactoryContractFactory = await ethers.getContractFactory(
      "StakingPoolFactory"
    );
    stakingPoolFactory =
      (await stakingPoolFactoryContractFactory.deploy()) as StakingPoolFactory;

    return { stakingPoolFactory, owner, user };
  }

  beforeEach(async function () {
    await network.provider.request({
      method: "hardhat_reset",
      params: [],
    });

    const fixtures = await deployStakingPoolFactory();
    stakingPoolFactory = fixtures.stakingPoolFactory;
    owner = fixtures.owner;
    user = fixtures.user;
  });

  it("팩토리를 배포하고 소유자를 할당해야 합니다.", async function () {
    const adminAddress = await stakingPoolFactory.admin();

    expect(adminAddress).to.equal(await owner.getAddress());
  });

  it("새로운 스테이킹 풀을 생성해야 합니다.", async function () {
    const createPoolTx = await stakingPoolFactory.createPool();
    await createPoolTx.wait();

    const poolsLength = await stakingPoolFactory.getPoolsLength();
    expect(poolsLength).to.equal(1);

    const newPoolAddress = await stakingPoolFactory.pools(0);
    expect(newPoolAddress).to.be.properAddress;
  });

  it("소유자가 풀을 생성할 수 있어야 합니다.", async function () {
    await stakingPoolFactory.connect(owner).createPool();

    const poolsLength = await stakingPoolFactory.getPoolsLength();
    expect(poolsLength).to.equal(1);
  });

  it("비소유자는 풀을 생성할 수 없어야 합니다.", async function () {
    await expect(
      stakingPoolFactory.connect(user).createPool()
    ).to.be.revertedWith("Not an admin");
  });

  it("생성된 모든 풀을 반환해야 합니다.", async function () {
    await stakingPoolFactory.createPool();
    await stakingPoolFactory.createPool();

    const pools = await stakingPoolFactory.getAllPools();

    expect(pools.length).to.equal(2);
  });

  it("특정 인덱스의 풀 정보를 반환해야 합니다.", async function () {
    await stakingPoolFactory.createPool();

    const poolAddress = await stakingPoolFactory.pools(0);
    const stakingPool = await ethers.getContractAt("StakingPool", poolAddress);
    const details = await stakingPool.getPoolDetails();
    const ownerAddress = await owner.getAddress();

    // details 객체가 올바른 속성을 가지고 있는지 확인
    expect(details.name).to.be.a("string");
    expect(details.description).to.be.a("string");
    expect(details.minStakePrice).to.be.a("bigint"); // BigInt 타입으로 체크
    expect(details.minStakePrice).to.equal(BigInt(0)); // 예제에서는 0으로 초기화됨
    expect(details.annualInterestMultipliedRate).to.be.a("bigint"); // BigInt 타입으로 체크
    expect(details.annualInterestMultipliedRate).to.equal(BigInt(0)); // 예제에서는 0으로 초기화됨
    expect(details.minFundraisingPrice).to.be.a("bigint"); // BigInt 타입으로 체크
    expect(details.minFundraisingPrice).to.equal(BigInt(0)); // 예제에서는 0으로 초기화됨
    expect(details.maxFundraisingPrice).to.be.a("bigint"); // BigInt 타입으로 체크
    expect(details.maxFundraisingPrice).to.equal(BigInt(0)); // 예제에서는 0으로 초기화됨

    // expect(details.stakingToken).to.equal(ethers.constants.AddressZero); // 기본값이 AddressZero인지 확인
  });

  it("풀의 총 개수를 반환해야 합니다.", async function () {
    await stakingPoolFactory.createPool();
    await stakingPoolFactory.createPool();

    const poolsLength = await stakingPoolFactory.getPoolsLength();

    expect(poolsLength).to.equal(2);
  });
});
