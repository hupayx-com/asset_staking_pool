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
  // 스테이킹 풀의 관리자 주소
  address public admin;
  // 1,000,000배 스케일업(2024년 4월27일 SFL 가격: $0.002718)
  uint256 private constant tokenPriceScale = 1e6;

  // 스테이킹 풀의 상태를 나타내는 열거형
  enum State {
    Waiting, // 대기
    Fundraising, // 모금
    Operating, // 운영
    Closed, // 종료
    Stopped // 중지
  }
  // 스테이킹 풀의 상태
  State public state;

  // 스테이킹 풀의 속성
  struct Details {
    string name; // 풀 이름
    string description; // 풀 설명
    uint256 minStakeAmount; // 최소 스테이킹 금액 (달러 기준)
    uint256 annualInterestRate; // 이자율
    uint256 fundraisingDuration; // 모금 기간
    uint256 operatingDuration; // 운영 기간
    uint256 minFundraisingAmount; // 최소 모금 금액
    uint256 maxFundraisingAmount; // 최대 모금 금액
    address stakingToken; // 스테이킹 대상 토큰 주소
  }
  Details public details;

  struct StakeInfo {
    uint256 amountStaked;
    uint256 stakeTimestamp;
    uint256 totalReward;
    uint256 lastRewardPeriodProcessed;
  }

  struct RewardPeriod {
    uint256 stakingTokenPriceAtPayout; // 스케일업된 토큰 가격
    uint256 startDate;
    uint256 endDate;
  }

  mapping(address => StakeInfo[]) public stakeInfos;
  RewardPeriod[] public rewardPeriods;

  // 스테이킹 풀 생성자
  constructor() {
    admin = msg.sender; // 스마트 컨트랙트 배포자를 관리자로 설정
    state = State.Waiting; // 초기 상태를 '모금 대기'로 설정
  }

  // 관리자 권한 확인을 위한 modifier
  modifier onlyAdmin() {
    require(msg.sender == admin, "Not an admin");
    _;
  }

  // 특정 상태에서만 실행 가능하도록 하는 modifier
  modifier inState(State _state) {
    require(state == _state, "Invalid state");
    _;
  }

  function stake(uint256 _amount) external inState(State.Fundraising) {
    require(
      _amount >= details.minStakeAmount,
      "Amount is less than the minimum stake amount"
    );

    IERC20(details.stakingToken).transferFrom(
      msg.sender,
      address(this),
      _amount
    );

    stakeInfos[msg.sender].push(
      StakeInfo({
        amountStaked: _amount,
        stakeTimestamp: block.timestamp,
        totalReward: 0,
        lastRewardPeriodProcessed: 0
      })
    );
  }

  function updateReward(address _user, uint256 _stakeIndex) private {
    require(_stakeIndex < stakeInfos[_user].length, "Invalid stake index");
    StakeInfo storage userStake = stakeInfos[_user][_stakeIndex];
    uint256 reward = 0;

    for (
      uint256 j = userStake.lastRewardPeriodProcessed;
      j < rewardPeriods.length;
      j++
    ) {
      RewardPeriod memory period = rewardPeriods[j];
      if (userStake.stakeTimestamp < period.endDate) {
        uint256 effectiveStartDate = userStake.stakeTimestamp > period.startDate
          ? userStake.stakeTimestamp
          : period.startDate;
        uint256 stakingDays = (period.endDate - effectiveStartDate) / 1 days;
        uint256 dailyInterest = (userStake.amountStaked *
          details.annualInterestRate) / 36500;

        reward +=
          (dailyInterest * stakingDays * 1e18) /
          period.stakingTokenPriceAtPayout /
          tokenPriceScale; // 스케일 다운

        userStake.lastRewardPeriodProcessed = j + 1;
      }
    }

    userStake.totalReward += reward / 1e18; // wei 단위로 변환하여 저장
  }

  function addRewardPeriod(
    uint256 _stakingTokenPriceAtPayout, // 이미 스케일업된 가격
    uint256 _startDate,
    uint256 _endDate
  ) external onlyAdmin {
    require(_startDate < _endDate, "Start date must be before end date");
    rewardPeriods.push(
      RewardPeriod({
        stakingTokenPriceAtPayout: _stakingTokenPriceAtPayout,
        startDate: _startDate,
        endDate: _endDate
      })
    );
  }

  function claimReward(uint256 _stakeIndex) external inState(State.Operating) {
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

  // Pool 관련 설정 함수들 (관리자 전용)
  function setPoolName(
    string memory _name
  ) public onlyAdmin inState(State.Waiting) {
    details.name = _name;
  }

  function setPoolDescription(
    string memory _description
  ) public onlyAdmin inState(State.Waiting) {
    details.description = _description;
  }

  // 상태 변경 함수들
  function startFundraising() public onlyAdmin inState(State.Waiting) {
    state = State.Fundraising; // 상태를 '모금 기간'으로 변경
  }

  // Pool 설정 관련 함수들 (모금 대기 상태에서만 설정 가능)
  function setMinStakeAmount(
    uint256 _amount
  ) public onlyAdmin inState(State.Waiting) {
    details.minStakeAmount = _amount;
  }

  function setInterestRate(
    uint256 _interestRate
  ) public onlyAdmin inState(State.Waiting) {
    details.annualInterestRate = _interestRate;
  }

  function setFundraisingDuration(
    uint256 _duration
  ) public onlyAdmin inState(State.Waiting) {
    details.fundraisingDuration = _duration;
  }

  function setOperatingDuration(
    uint256 _duration
  ) public onlyAdmin inState(State.Waiting) {
    details.operatingDuration = _duration;
  }

  function setMinFundraisingAmount(
    uint256 _amount
  ) public onlyAdmin inState(State.Waiting) {
    details.minFundraisingAmount = _amount;
  }

  function setMaxFundraisingAmount(
    uint256 _amount
  ) public onlyAdmin inState(State.Waiting) {
    details.maxFundraisingAmount = _amount;
  }

  function setStakingToken(
    address _tokenAddress
  ) public onlyAdmin inState(State.Waiting) {
    details.stakingToken = _tokenAddress;
  }

  // 모금 기간 관련 함수들
  function stopFundraising() public onlyAdmin inState(State.Fundraising) {
    // 모금 중지 로직
  }

  function unstakeSFL(uint256 _amount) public inState(State.Fundraising) {
    // SFL unstaking 로직
  }

  function withdrawFailedFundraising() public inState(State.Fundraising) {
    // 모금 실패 시 자금 회수 로직
  }

  // 운영 기간 관련 함수들
  function stopOperating() public onlyAdmin inState(State.Operating) {
    // 운영 중지 로직
  }

  function viewRewards(
    address _staker
  ) public view inState(State.Operating) returns (uint256) {
    // 보상 조회 로직
  }

  function viewAccumulatedRewards(
    address _staker
  ) public view inState(State.Operating) returns (uint256) {
    // 누적 보상 조회 로직
  }

  function requestRewards() public inState(State.Operating) {
    // 보상 요청 로직
  }

  function withdrawAtClosure() public inState(State.Operating) {
    // 운영 종료 시 자금 회수 로직
  }

  // 상태 변경 함수들
  function startOperating() public onlyAdmin inState(State.Fundraising) {
    // 상태를 '운영 기간'으로 변경하는 로직
  }

  function closePool() public onlyAdmin inState(State.Operating) {
    // 스테이킹 풀을 종료하는 로직
  }
}
