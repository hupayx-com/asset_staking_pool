import { ethers, network } from "hardhat";
import { expect } from "chai";
import { Signer } from "ethers";
import {
  Suffle,
  StakingPool,
  StakingPoolFactory,
} from "../typechain-types/index";

describe("UnStaking", function () {
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

  it("모금 기간에 2 번 스테이킹 하고 첫번째 스테이킹의 모든 토큰을 언스테이킹 하면 두번째 스테이킹만 남는다.", async function () {
    const { stakingPool, suffle, staker_1, owner } =
      await deployStakingPoolFixture();

    // staking 은 모금/운영 시에만 가능
    await stakingPool.connect(owner).startFundraising();

    const STAKING_AMOUNT_ETHER_730 = "730";
    const STAKING_AMOUNT_ETHER_365 = "365";

    await suffle
      .connect(staker_1)
      .approve(
        stakingPool.getAddress(),
        ethers.parseEther(STAKING_AMOUNT_ETHER_730)
      );
    await stakingPool
      .connect(staker_1)
      .stakeToken(ethers.parseEther(STAKING_AMOUNT_ETHER_730));

    await suffle
      .connect(staker_1)
      .approve(
        stakingPool.getAddress(),
        ethers.parseEther(STAKING_AMOUNT_ETHER_365)
      );
    await stakingPool
      .connect(staker_1)
      .stakeToken(ethers.parseEther(STAKING_AMOUNT_ETHER_365));

    let stakeRecord = await stakingPool.userStakes(
      await staker_1.getAddress(),
      0
    );
    expect(stakeRecord.amountStaked).to.equal(
      ethers.parseEther(STAKING_AMOUNT_ETHER_730)
    );
    expect(stakeRecord.claimedRewards).to.equal(0);
    expect(stakeRecord.pendingRewardScheduleIndex).to.equal(0);
    expect(stakeRecord.multipliedTokenPrice).to.equal(1000000);
    expect(stakeRecord.dailyInterestInUSD).to.equal(ethers.parseEther("2"));

    await stakingPool
      .connect(staker_1)
      .unStakeToken(0, ethers.parseEther(STAKING_AMOUNT_ETHER_730));

    const stakeLength = await stakingPool.getUserStakeCount(
      await staker_1.getAddress()
    );
    expect(stakeLength).to.equal(1);

    stakeRecord = await stakingPool.userStakes(await staker_1.getAddress(), 0);
    expect(stakeRecord.amountStaked).to.equal(
      ethers.parseEther(STAKING_AMOUNT_ETHER_365)
    );
    expect(stakeRecord.claimedRewards).to.equal(0);
    expect(stakeRecord.pendingRewardScheduleIndex).to.equal(0);
    expect(stakeRecord.multipliedTokenPrice).to.equal(1000000);
    expect(stakeRecord.dailyInterestInUSD).to.equal(ethers.parseEther("1"));
  });

  it("모금 기간에 일부 토큰을 언스테이킹 한다.", async function () {
    const { stakingPool, suffle, staker_1, owner } =
      await deployStakingPoolFixture();

    // staking 은 모금/운영 시에만 가능
    await stakingPool.connect(owner).startFundraising();

    const STAKING_AMOUNT_ETHER_730 = "730";
    const STAKING_AMOUNT_ETHER_365 = "365";

    await suffle
      .connect(staker_1)
      .approve(
        stakingPool.getAddress(),
        ethers.parseEther(STAKING_AMOUNT_ETHER_730)
      );
    await stakingPool
      .connect(staker_1)
      .stakeToken(ethers.parseEther(STAKING_AMOUNT_ETHER_730));

    let stakeRecord = await stakingPool.userStakes(
      await staker_1.getAddress(),
      0
    );
    expect(stakeRecord.amountStaked).to.equal(
      ethers.parseEther(STAKING_AMOUNT_ETHER_730)
    );
    expect(stakeRecord.claimedRewards).to.equal(0);
    expect(stakeRecord.pendingRewardScheduleIndex).to.equal(0);
    expect(stakeRecord.multipliedTokenPrice).to.equal(1000000);
    expect(stakeRecord.dailyInterestInUSD).to.equal(ethers.parseEther("2"));

    await stakingPool.connect(owner).updateMultipliedTokenPrice(2000000);

    await stakingPool
      .connect(staker_1)
      .unStakeToken(0, ethers.parseEther(STAKING_AMOUNT_ETHER_365));

    const stakeLength = await stakingPool.getUserStakeCount(
      await staker_1.getAddress()
    );
    expect(stakeLength).to.equal(1);

    stakeRecord = await stakingPool.userStakes(await staker_1.getAddress(), 0);
    expect(stakeRecord.amountStaked).to.equal(
      ethers.parseEther(STAKING_AMOUNT_ETHER_365)
    );
    expect(stakeRecord.claimedRewards).to.equal(0);
    expect(stakeRecord.pendingRewardScheduleIndex).to.equal(0);
    expect(stakeRecord.multipliedTokenPrice).to.equal(1000000);
    expect(stakeRecord.dailyInterestInUSD).to.equal(ethers.parseEther("1"));
  });

  it("운영 기간내 토큰을 언스테이킹 하면 실패한다.", async function () {
    const { stakingPool, suffle, staker_1, owner } =
      await deployStakingPoolFixture();

    // staking 은 모금/운영 시에만 가능
    await stakingPool.connect(owner).startFundraising();

    const STAKING_AMOUNT_ETHER_730 = "730";

    await suffle
      .connect(staker_1)
      .approve(
        stakingPool.getAddress(),
        ethers.parseEther(STAKING_AMOUNT_ETHER_730)
      );
    await stakingPool
      .connect(staker_1)
      .stakeToken(ethers.parseEther(STAKING_AMOUNT_ETHER_730));

    await stakingPool.connect(owner).startOperating();

    await expect(
      stakingPool
        .connect(staker_1)
        .unStakeToken(0, ethers.parseEther(STAKING_AMOUNT_ETHER_730))
    ).to.be.revertedWith("Unstaking is only allowed during fundraising");
  });

  it("중지 시 토큰을 언스테이킹 하면 실패한다.", async function () {
    const { stakingPool, suffle, staker_1, owner } =
      await deployStakingPoolFixture();

    // staking 은 모금/운영 시에만 가능
    await stakingPool.connect(owner).startFundraising();

    const STAKING_AMOUNT_ETHER_730 = "730";

    await suffle
      .connect(staker_1)
      .approve(
        stakingPool.getAddress(),
        ethers.parseEther(STAKING_AMOUNT_ETHER_730)
      );
    await stakingPool
      .connect(staker_1)
      .stakeToken(ethers.parseEther(STAKING_AMOUNT_ETHER_730));

    await stakingPool.connect(owner).stopPoolFundraising();

    await expect(
      stakingPool
        .connect(staker_1)
        .unStakeToken(0, ethers.parseEther(STAKING_AMOUNT_ETHER_730))
    ).to.be.revertedWith("Unstaking is only allowed during fundraising");
  });

  it("종료 시 토큰을 언스테이킹 하면 실패한다.", async function () {
    const { stakingPool, suffle, staker_1, owner } =
      await deployStakingPoolFixture();

    // staking 은 모금/운영 시에만 가능
    await stakingPool.connect(owner).startFundraising();
    await stakingPool.connect(owner).startOperating();

    const STAKING_AMOUNT_ETHER_730 = "730";

    await suffle
      .connect(staker_1)
      .approve(
        stakingPool.getAddress(),
        ethers.parseEther(STAKING_AMOUNT_ETHER_730)
      );
    await stakingPool
      .connect(staker_1)
      .stakeToken(ethers.parseEther(STAKING_AMOUNT_ETHER_730));

    await stakingPool.connect(owner).closePool();

    await expect(
      stakingPool
        .connect(staker_1)
        .unStakeToken(0, ethers.parseEther(STAKING_AMOUNT_ETHER_730))
    ).to.be.revertedWith("Unstaking is only allowed during fundraising");
  });

  // 총 모금액 테스트 케이스 추가
  it("언스테이킹 시 총 모금액이 올바르게 차감된다.", async function () {
    const { stakingPool, suffle, staker_1, owner } =
      await deployStakingPoolFixture();

    // 모금 시작
    await stakingPool.connect(owner).startFundraising();

    const STAKING_AMOUNT_ETHER_1000 = "1000";
    const UNSTAKING_AMOUNT_ETHER_500 = "500";
    const TOKEN_PRICE_USD = 2000000;

    await stakingPool
      .connect(owner)
      .updateMultipliedTokenPrice(TOKEN_PRICE_USD);

    // 스테이킹
    await suffle
      .connect(staker_1)
      .approve(
        stakingPool.getAddress(),
        ethers.parseEther(STAKING_AMOUNT_ETHER_1000)
      );
    await stakingPool
      .connect(staker_1)
      .stakeToken(ethers.parseEther(STAKING_AMOUNT_ETHER_1000));

    // 총 모금액 확인
    let totalFundraisingInMultipliedUSD =
      await stakingPool.totalFundraisingInMultipliedUSD();
    expect(totalFundraisingInMultipliedUSD).to.equal(1000 * TOKEN_PRICE_USD); // 1,000 USD * 1,000,000

    // 언스테이킹
    await stakingPool
      .connect(staker_1)
      .unStakeToken(0, ethers.parseEther(UNSTAKING_AMOUNT_ETHER_500));

    // 총 모금액 확인
    totalFundraisingInMultipliedUSD =
      await stakingPool.totalFundraisingInMultipliedUSD();
    expect(totalFundraisingInMultipliedUSD).to.equal(500 * TOKEN_PRICE_USD); // 500 USD * 1,000,000
  });
});
