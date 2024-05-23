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

describe("WithdrawPrincipal", function () {
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

    return { stakingPool, suffle, owner, staker_1, staker_2 };
  }

  beforeEach(async function () {
    await network.provider.request({
      method: "hardhat_reset",
      params: [],
    });
  });

  it("모금 중지 시 원금이 회수 된다.(원금은 회수 시점 토큰 가격에 비례)", async function () {
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
      .stakeToken(ethers.parseEther(STAKING_AMOUNT_ETHER));

    await stakingPool.connect(owner).stopPoolFundraising();
    await stakingPool.connect(owner).updateMultipliedTokenPrice(100000);

    await stakingPool.connect(staker_1).withdrawAllPrincipal();

    const stakerBalance = await suffle.balanceOf(await staker_1.getAddress());
    const expectedBalance =
      ethers.parseEther("1000000000") -
      ethers.parseEther(STAKING_AMOUNT_ETHER) +
      ethers.parseEther((parseInt(STAKING_AMOUNT_ETHER) * 10).toString());

    expect(stakerBalance).to.equal(expectedBalance);
  });

  it("모금 실패 시 원금은 회수 된다.(원금은 회수 시점 토큰 가격에 비례)", async function () {
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
      .stakeToken(ethers.parseEther(STAKING_AMOUNT_ETHER));

    await stakingPool.connect(owner).failPool();

    await stakingPool.connect(owner).updateMultipliedTokenPrice(500000);
    await stakingPool.connect(staker_1).withdrawAllPrincipal();

    const stakerBalance = await suffle.balanceOf(await staker_1.getAddress());
    const expectedBalance =
      ethers.parseEther("1000000000") -
      ethers.parseEther(STAKING_AMOUNT_ETHER) +
      ethers.parseEther((parseInt(STAKING_AMOUNT_ETHER) * 2).toString());

    expect(stakerBalance).to.equal(expectedBalance);
  });

  it("운영 중지 시 보상과 원금을 순서대로 수령한다(원금은 회수 시점 토큰 가격에 비례)", async function () {
    const { stakingPool, suffle, staker_1, owner } =
      await deployStakingPoolFixture();

    await stakingPool.connect(owner).startFundraising();
    await stakingPool.connect(owner).startOperating(); // Pool을 운영 상태로 전환

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

    // 보상 스케줄 추가
    const currentTime = await getCurrentBlockchainTime();
    await stakingPool
      .connect(owner)
      .addRewardSchedule(
        2000000,
        currentTime + SECONDS_IN_A_DAY * 1,
        currentTime + SECONDS_IN_A_DAY * 11
      );

    // 시간을 앞당김
    await ethers.provider.send("evm_increaseTime", [
      SECONDS_IN_A_DAY * (10 + 1),
    ]);
    await ethers.provider.send("evm_mine");

    // Pool 상태 '운영 중지'로 변경
    await stakingPool.connect(owner).stopPoolOperating();

    // 보상이 남아 있는 상태에서 원금 인출 시도
    await expect(
      stakingPool.connect(staker_1).withdrawAllPrincipal()
    ).to.be.revertedWith(
      "Please claim all rewards before withdrawing principal"
    );

    // 보상 청구
    await stakingPool.connect(staker_1).claimRewardToken(0);

    // 원금 인출 시도
    await stakingPool.connect(owner).updateMultipliedTokenPrice(200000);
    await stakingPool.connect(staker_1).withdrawAllPrincipal();

    const stakerBalance = await suffle.balanceOf(await staker_1.getAddress());
    const expectedBalance =
      ethers.parseEther("1000000000") -
      ethers.parseEther(STAKING_AMOUNT_ETHER) +
      ethers.parseEther((parseInt(STAKING_AMOUNT_ETHER) * 5).toString()) +
      ethers.parseEther("5");

    expect(stakerBalance).to.equal(expectedBalance);
  });

  it("운영 종료 시 보상과 원금을 순서대로 수령한다.(원금은 회수 시점 토큰 가격에 비례)", async function () {
    const { stakingPool, suffle, staker_1, owner } =
      await deployStakingPoolFixture();

    await stakingPool.connect(owner).startFundraising();
    await stakingPool.connect(owner).startOperating(); // Pool을 운영 상태로 전환

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

    // 보상 스케줄 추가
    const currentTime = await getCurrentBlockchainTime();
    await stakingPool
      .connect(owner)
      .addRewardSchedule(
        5000000,
        currentTime + SECONDS_IN_A_DAY * 1,
        currentTime + SECONDS_IN_A_DAY * 11
      );

    // 시간을 앞당김
    await ethers.provider.send("evm_increaseTime", [
      SECONDS_IN_A_DAY * (10 + 1),
    ]);
    await ethers.provider.send("evm_mine");

    // Pool 상태 '운영 중지'로 변경
    await stakingPool.connect(owner).closePool();

    // 보상이 남아 있는 상태에서 원금 인출 시도
    await expect(
      stakingPool.connect(staker_1).withdrawAllPrincipal()
    ).to.be.revertedWith(
      "Please claim all rewards before withdrawing principal"
    );

    // 보상 청구
    await stakingPool.connect(staker_1).claimRewardToken(0);

    // 원금 인출 시도
    await stakingPool.connect(owner).updateMultipliedTokenPrice(1000000 * 5);
    await stakingPool.connect(staker_1).withdrawAllPrincipal();

    const stakerBalance = await suffle.balanceOf(await staker_1.getAddress());
    const expectedBalance =
      ethers.parseEther("1000000000") -
      ethers.parseEther(STAKING_AMOUNT_ETHER) +
      ethers.parseEther((parseInt(STAKING_AMOUNT_ETHER) * (1 / 5)).toString()) +
      ethers.parseEther("2");

    expect(stakerBalance).to.equal(expectedBalance);
  });
});
