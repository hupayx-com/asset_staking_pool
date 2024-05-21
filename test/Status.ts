import { ethers, network } from "hardhat";
import { expect } from "chai";
import { Signer } from "ethers";
import {
  Suffle,
  StakingPool,
  StakingPoolFactory,
} from "../typechain-types/index";
import { PoolState } from "./util";

describe("Status", function () {
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

  it("Pool 이 생성되면 대기 상태이다.", async function () {
    const { stakingPool, suffle, staker_1, owner } =
      await deployStakingPoolFixture();

    const status = await stakingPool.state();

    expect(status).to.equal(PoolState.Waiting);
  });

  it("Pool 상태가 대기 인 경우에 모금 으로만 변경된다.", async function () {
    const { stakingPool, suffle, staker_1, owner } =
      await deployStakingPoolFixture();

    await expect(stakingPool.startOperating()).to.be.revertedWith(
      "Pool must be in Fundraising or Locked state to start operating"
    );
    await expect(stakingPool.closePool()).to.be.revertedWith(
      "Pool must be in Operating state to be closed"
    );
    await expect(stakingPool.lockPool()).to.be.revertedWith(
      "Pool must be in Fundraising state to be locked"
    );
    await expect(stakingPool.stopPoolFundraising()).to.be.revertedWith(
      "Pool must be in Fundraising or Operating state to be FundraisingStopped"
    );
    await expect(stakingPool.failPool()).to.be.revertedWith(
      "Pool must be in Fundraising state to be marked as failed"
    );

    await stakingPool.startFundraising();
    const status = await stakingPool.state();

    expect(status).to.equal(PoolState.Fundraising);
  });

  it("Pool 상태가 모금 인 경우에 운영/잠김/모금중지/실패 로만 변경된다.", async function () {
    const { stakingPool, suffle, staker_1, owner } =
      await deployStakingPoolFixture();

    await stakingPool.startFundraising();

    let snapshotId = await ethers.provider.send("evm_snapshot", []);

    await expect(stakingPool.closePool()).to.be.revertedWith(
      "Pool must be in Operating state to be closed"
    );
    await expect(stakingPool.stopPoolOperating()).to.be.revertedWith(
      "Pool must be in Fundraising or Operating state to be OperatingStopped"
    );

    let status;

    // 운영 상태로 변경
    await stakingPool.startOperating();
    status = await stakingPool.state();
    expect(status).to.equal(PoolState.Operating);

    await ethers.provider.send("evm_revert", [snapshotId]);
    snapshotId = await ethers.provider.send("evm_snapshot", []);

    // 잠김 상태로 변경
    await stakingPool.lockPool();
    status = await stakingPool.state();
    expect(status).to.equal(PoolState.Locked);

    await ethers.provider.send("evm_revert", [snapshotId]);
    snapshotId = await ethers.provider.send("evm_snapshot", []);

    // 중지 상태로 변경
    await stakingPool.stopPoolFundraising();
    status = await stakingPool.state();
    expect(status).to.equal(PoolState.FundraisingStopped);

    await ethers.provider.send("evm_revert", [snapshotId]);
    snapshotId = await ethers.provider.send("evm_snapshot", []);

    // 실패 상태로 변경
    await stakingPool.failPool();
    status = await stakingPool.state();
    expect(status).to.equal(PoolState.Failed);
  });

  it("Pool 상태가 운영 인 경우에 종료/운영중지 로만 변경된다.", async function () {
    const { stakingPool, suffle, staker_1, owner } =
      await deployStakingPoolFixture();

    await stakingPool.startFundraising();
    await stakingPool.startOperating();

    let snapshotId = await ethers.provider.send("evm_snapshot", []);

    await expect(stakingPool.startFundraising()).to.be.revertedWith(
      "Pool must be in Waiting state to start fundraising"
    );
    await expect(stakingPool.lockPool()).to.be.revertedWith(
      "Pool must be in Fundraising state to be locked"
    );
    await expect(stakingPool.failPool()).to.be.revertedWith(
      "Pool must be in Fundraising state to be marked as failed"
    );
    await expect(stakingPool.stopPoolFundraising()).to.be.revertedWith(
      "Pool must be in Fundraising or Operating state to be FundraisingStopped"
    );

    let status;

    // 종료 상태로 변경
    await stakingPool.closePool();
    status = await stakingPool.state();
    expect(status).to.equal(PoolState.Closed);

    await ethers.provider.send("evm_revert", [snapshotId]);
    snapshotId = await ethers.provider.send("evm_snapshot", []);

    // 중지 상태로 변경
    await stakingPool.stopPoolOperating();
    status = await stakingPool.state();
    expect(status).to.equal(PoolState.OperatingStopped);

    await ethers.provider.send("evm_revert", [snapshotId]);
    snapshotId = await ethers.provider.send("evm_snapshot", []);
  });

  it("Pool 상태가 종료 인 경우에 상태는 변경 되지 않는다.", async function () {
    const { stakingPool, suffle, staker_1, owner } =
      await deployStakingPoolFixture();

    await stakingPool.startFundraising();
    await stakingPool.startOperating();
    await stakingPool.closePool();

    await expect(stakingPool.startFundraising()).to.be.revertedWith(
      "Pool must be in Waiting state to start fundraising"
    );
    await expect(stakingPool.startOperating()).to.be.revertedWith(
      "Pool must be in Fundraising or Locked state to start operating"
    );
    await expect(stakingPool.lockPool()).to.be.revertedWith(
      "Pool must be in Fundraising state to be locked"
    );
    await expect(stakingPool.stopPoolFundraising()).to.be.revertedWith(
      "Pool must be in Fundraising or Operating state to be FundraisingStopped"
    );
    await expect(stakingPool.stopPoolOperating()).to.be.revertedWith(
      "Pool must be in Fundraising or Operating state to be OperatingStopped"
    );
    await expect(stakingPool.failPool()).to.be.revertedWith(
      "Pool must be in Fundraising state to be marked as failed"
    );
  });

  it("Pool 상태가 잠김 인 경우에 상태는 운영 으로만 변경된다.", async function () {
    const { stakingPool, suffle, staker_1, owner } =
      await deployStakingPoolFixture();

    await stakingPool.startFundraising();
    await stakingPool.lockPool();

    await expect(stakingPool.startFundraising()).to.be.revertedWith(
      "Pool must be in Waiting state to start fundraising"
    );
    await expect(stakingPool.closePool()).to.be.revertedWith(
      "Pool must be in Operating state to be closed"
    );
    await expect(stakingPool.lockPool()).to.be.revertedWith(
      "Pool must be in Fundraising state to be locked"
    );
    await expect(stakingPool.stopPoolFundraising()).to.be.revertedWith(
      "Pool must be in Fundraising or Operating state to be FundraisingStopped"
    );
    await expect(stakingPool.stopPoolOperating()).to.be.revertedWith(
      "Pool must be in Fundraising or Operating state to be OperatingStopped"
    );
    await expect(stakingPool.failPool()).to.be.revertedWith(
      "Pool must be in Fundraising state to be marked as failed"
    );

    await stakingPool.startOperating();
    const status = await stakingPool.state();
    expect(status).to.equal(PoolState.Operating);
  });

  it("Pool 상태가 모금중지 인 경우에 상태는 변경 되지 않는다.", async function () {
    const { stakingPool, suffle, staker_1, owner } =
      await deployStakingPoolFixture();

    await stakingPool.startFundraising();
    await stakingPool.stopPoolFundraising();

    await expect(stakingPool.startFundraising()).to.be.revertedWith(
      "Pool must be in Waiting state to start fundraising"
    );
    await expect(stakingPool.startOperating()).to.be.revertedWith(
      "Pool must be in Fundraising or Locked state to start operating"
    );
    await expect(stakingPool.closePool()).to.be.revertedWith(
      "Pool must be in Operating state to be closed"
    );
    await expect(stakingPool.lockPool()).to.be.revertedWith(
      "Pool must be in Fundraising state to be locked"
    );
    await expect(stakingPool.failPool()).to.be.revertedWith(
      "Pool must be in Fundraising state to be marked as failed"
    );
    await expect(stakingPool.stopPoolOperating()).to.be.revertedWith(
      "Pool must be in Fundraising or Operating state to be OperatingStopped"
    );
  });

  it("Pool 상태가 운영중지 인 경우에 상태는 변경 되지 않는다.", async function () {
    const { stakingPool, suffle, staker_1, owner } =
      await deployStakingPoolFixture();

    await stakingPool.startFundraising();
    await stakingPool.startOperating();
    await stakingPool.stopPoolOperating();

    await expect(stakingPool.startFundraising()).to.be.revertedWith(
      "Pool must be in Waiting state to start fundraising"
    );
    await expect(stakingPool.startOperating()).to.be.revertedWith(
      "Pool must be in Fundraising or Locked state to start operating"
    );
    await expect(stakingPool.closePool()).to.be.revertedWith(
      "Pool must be in Operating state to be closed"
    );
    await expect(stakingPool.lockPool()).to.be.revertedWith(
      "Pool must be in Fundraising state to be locked"
    );
    await expect(stakingPool.failPool()).to.be.revertedWith(
      "Pool must be in Fundraising state to be marked as failed"
    );
    await expect(stakingPool.stopPoolFundraising()).to.be.revertedWith(
      "Pool must be in Fundraising or Operating state to be FundraisingStopped"
    );
  });

  it("Pool 상태가 실패 인 경우에 상태는 변경 되지 않는다.", async function () {
    const { stakingPool, suffle, staker_1, owner } =
      await deployStakingPoolFixture();

    await stakingPool.startFundraising();
    await stakingPool.failPool();

    await expect(stakingPool.startFundraising()).to.be.revertedWith(
      "Pool must be in Waiting state to start fundraising"
    );
    await expect(stakingPool.startOperating()).to.be.revertedWith(
      "Pool must be in Fundraising or Locked state to start operating"
    );
    await expect(stakingPool.closePool()).to.be.revertedWith(
      "Pool must be in Operating state to be closed"
    );
    await expect(stakingPool.lockPool()).to.be.revertedWith(
      "Pool must be in Fundraising state to be locked"
    );
    await expect(stakingPool.stopPoolFundraising()).to.be.revertedWith(
      "Pool must be in Fundraising or Operating state to be FundraisingStopped"
    );
    await expect(stakingPool.stopPoolOperating()).to.be.revertedWith(
      "Pool must be in Fundraising or Operating state to be OperatingStopped"
    );
  });
});
