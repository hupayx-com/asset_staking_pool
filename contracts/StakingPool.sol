// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

// Uncomment this line to use console.log
// import "hardhat/console.sol";

interface IERC20 {
  function transferFrom(
    address sender,
    address recipient,
    uint256 amount
  ) external returns (bool);
  function transfer(address recipient, uint256 amount) external returns (bool);
}

contract StakingPool {
  // 관리자 주소
  address public admin;

  // 소수점 계산을 위해 SFL 달러 가격 x1,000,000 scale (ex. 2024년 4월27일 SFL 가격: $0.002718)
  uint256 public constant TOKEN_PRICE_SCALE = 1e6;
  // 소수점 계산을 위해 이자을 x100 scale (ex. 이자율: 0.05 %)
  uint256 public constant INTEREST_RATE_SCALE = 100;

  // 주기적으로 업데이트 되는 SFL 달러 가격
  uint256 public currentScaledTokenPrice = 0;

  // staking pool status
  enum State {
    Waiting, // 대기
    Fundraising, // 모금
    Operating, // 운영
    Closed, // 종료
    Stopped // 중지
  }
  State public state;

  // 스테이킹 풀의 속성
  struct Details {
    string name; // 풀 이름
    string description; // 풀 설명
    uint256 minStakeAmount; // 최소 스테이킹 금액 (달러)
    uint256 annualScaledInterestRate; // 연 이자율 (x100 scale)
    uint256 fundraisingDuration; // 모금 기간
    uint256 operatingDuration; // 운영 기간
    uint256 minFundraisingAmount; // 최소 모금 금액 (달러)
    uint256 maxFundraisingAmount; // 최대 모금 금액 (달러)
    address stakingToken; // staking token address
  }
  Details public details;

  struct StakeInfo {
    uint256 amountStaked;
    uint256 stakeTimestamp;
    uint256 totalReward;
    uint256 lastRewardPeriodProcessed;
    uint256 scaledTokenPrice;
    uint256 dailyInterestDollar; // 일 이자 (x100 scale)
  }
  mapping(address => StakeInfo[]) public stakeInfos;

  struct RewardPeriod {
    uint256 scaledTokenPriceAtPayout;
    uint256 startDate;
    uint256 endDate;
  }
  RewardPeriod[] public rewardPeriods;

  constructor() {
    admin = msg.sender;
    state = State.Waiting;
  }

  modifier onlyAdmin() {
    require(msg.sender == admin, "Not an admin");
    _;
  }

  function updateScaledTokenPrice(uint256 _price) external {
    currentScaledTokenPrice = _price;
  }

  function stake(uint256 _amount) external {
    require(
      state == State.Fundraising || state == State.Operating,
      "Invalid state for staking"
    );

    require(
      _amount >= details.minStakeAmount,
      "Amount is less than the minimum stake amount"
    );

    IERC20(details.stakingToken).transferFrom(
      msg.sender,
      address(this),
      _amount
    );

    uint256 dailyInterestDollar = ((_amount * currentScaledTokenPrice) *
      details.annualScaledInterestRate) /
      365 /* 1 year */ /
      TOKEN_PRICE_SCALE /
      INTEREST_RATE_SCALE;

    stakeInfos[msg.sender].push(
      StakeInfo({
        amountStaked: _amount,
        stakeTimestamp: block.timestamp,
        totalReward: 0,
        lastRewardPeriodProcessed: 0,
        scaledTokenPrice: currentScaledTokenPrice,
        dailyInterestDollar: dailyInterestDollar
      })
    );
  }

  // 보상 확인
  function viewReward(
    address _user,
    uint256 _stakeIndex
  ) public view returns (uint256) {
    require(_stakeIndex < stakeInfos[_user].length, "Invalid stake index");

    StakeInfo storage userStake = stakeInfos[_user][_stakeIndex];
    uint256 reward = 0;

    for (
      uint256 i = userStake.lastRewardPeriodProcessed;
      i < rewardPeriods.length;
      i++
    ) {
      RewardPeriod memory period = rewardPeriods[i];

      if (userStake.stakeTimestamp < period.endDate) {
        uint256 effectiveStartDate = userStake.stakeTimestamp > period.startDate
          ? userStake.stakeTimestamp
          : period.startDate;

        uint256 stakingDays = (period.endDate - effectiveStartDate) / 1 days;

        reward += (((userStake.dailyInterestDollar * stakingDays) /
          period.scaledTokenPriceAtPayout) * TOKEN_PRICE_SCALE);
      }
    }

    return reward;
  }

  // 보상 반영
  function updateReward(address _user, uint256 _stakeIndex) private {
    StakeInfo storage userStake = stakeInfos[_user][_stakeIndex];

    userStake.totalReward += viewReward(_user, _stakeIndex);
  }

  // 보상 관련 기간 추가
  function addRewardPeriod(
    uint256 _scaledTokenPriceAtPayout, // 이미 스케일업된 가격
    uint256 _startDate,
    uint256 _endDate
  ) external onlyAdmin {
    require(_startDate < _endDate, "Start date must be before end date");
    rewardPeriods.push(
      RewardPeriod({
        scaledTokenPriceAtPayout: _scaledTokenPriceAtPayout,
        startDate: _startDate,
        endDate: _endDate
      })
    );
  }

  // 보상 요청
  function claimReward(uint256 _stakeIndex) external {
    require(state == State.Operating);

    require(_stakeIndex < stakeInfos[msg.sender].length, "Invalid stake index");
    updateReward(msg.sender, _stakeIndex);

    StakeInfo storage userStake = stakeInfos[msg.sender][_stakeIndex];
    uint256 reward = userStake.totalReward;
    require(reward > 0, "No reward available");

    userStake.totalReward = 0; // Reset reward after claiming
    IERC20(details.stakingToken).transfer(msg.sender, reward);
  }

  function getIndividualReward(
    address _user,
    uint256 _stakeIndex
  ) public view returns (uint256) {
    require(_stakeIndex < stakeInfos[_user].length, "Invalid stake index");
    StakeInfo memory userStake = stakeInfos[_user][_stakeIndex];
    return userStake.totalReward;
  }

  // 동일 지갑의 전체 보상을 조회합니다.
  function getTotalRewards(
    address _user
  ) public view returns (uint256 totalRewards) {
    for (uint256 i = 0; i < stakeInfos[_user].length; i++) {
      totalRewards += stakeInfos[_user][i].totalReward;
    }
  }

  ///////////////////////
  // Pool 관련 설정 함수들 //
  ///////////////////////
  function setPoolName(string memory _name) public onlyAdmin {
    require(state == State.Waiting);

    details.name = _name;
  }

  function setPoolDescription(string memory _description) public onlyAdmin {
    require(state == State.Waiting);

    details.description = _description;
  }

  // 상태 변경 함수들
  function startFundraising() public onlyAdmin {
    require(state == State.Waiting);

    state = State.Fundraising; // 상태를 '모금 기간'으로 변경
  }

  // Pool 설정 관련 함수들 (모금 대기 상태에서만 설정 가능)
  function setMinStakeAmount(uint256 _amount) public onlyAdmin {
    require(state == State.Waiting);

    details.minStakeAmount = _amount;
  }

  function setInterestRate(uint256 _interestRate) public onlyAdmin {
    require(state == State.Waiting);

    details.annualScaledInterestRate = _interestRate;
  }

  function setFundraisingDuration(uint256 _duration) public onlyAdmin {
    require(state == State.Waiting);

    details.fundraisingDuration = _duration;
  }

  function setOperatingDuration(uint256 _duration) public onlyAdmin {
    require(state == State.Waiting);

    details.operatingDuration = _duration;
  }

  function setMinFundraisingAmount(uint256 _amount) public onlyAdmin {
    require(state == State.Waiting);

    details.minFundraisingAmount = _amount;
  }

  function setMaxFundraisingAmount(uint256 _amount) public onlyAdmin {
    require(state == State.Waiting);

    details.maxFundraisingAmount = _amount;
  }

  function setStakingToken(address _tokenAddress) public onlyAdmin {
    require(state == State.Waiting);

    details.stakingToken = _tokenAddress;
  }

  // 모금 기간 관련 함수들
  function stopFundraising() public onlyAdmin {
    require(state == State.Fundraising);

    // 모금 중지 로직
    state = State.Stopped;
  }

  function unstakeSFL(uint256 _amount) public {
    require(state == State.Fundraising);
    // SFL unstaking 로직
  }

  function withdrawFailedFundraising() public {
    require(state == State.Fundraising);
    // 모금 실패 시 자금 회수 로직
  }

  // 운영 기간 관련 함수들
  function stopOperating() public onlyAdmin {
    require(state == State.Operating);

    // 운영 중지 로직
    state = State.Stopped;
  }

  function viewRewards(address _staker) public view returns (uint256) {
    require(state == State.Operating);

    // 보상 조회 로직
    return 0;
  }

  function viewAccumulatedRewards(
    address _staker
  ) public view returns (uint256) {
    require(state == State.Operating);

    // 누적 보상 조회 로직
    return 0;
  }

  function requestRewards() public {
    require(state == State.Operating);

    // 보상 요청 로직
  }

  function withdrawAtClosure() public {
    require(state == State.Operating);

    // 운영 종료 시 자금 회수 로직
  }

  // 상태 변경 함수들
  function startOperating() public onlyAdmin {
    require(state == State.Fundraising);

    // 상태를 '운영 기간'으로 변경하는 로직
    state = State.Operating;
  }

  function closePool() public onlyAdmin {
    require(state == State.Operating);

    // 스테이킹 풀을 종료하는 로직
    state = State.Closed;
  }
}
