// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

// Uncomment this line to use console.log
import "hardhat/console.sol";

interface IERC20 {
  function transferFrom(
    address sender,
    address recipient,
    uint256 amount
  ) external returns (bool);
  function transfer(address recipient, uint256 amount) external returns (bool);
}

// 가격 기준: 달러($)
// 시간 단위: 초
contract StakingPool {
  // 관리자 주소
  address public admin;

  // 소수점 계산을 위해 Token 가격 x1,000,000 scaleUp (ex. 2024년 4월27일 SFL 가격: $0.002718)
  uint256 public constant TOKEN_PRICE_SCALEUP = 1e6;
  // 소수점 계산을 위해 이자을 x100 scaleUp (ex. 이자율: 0.05 %)
  uint256 public constant ANNUAL_INTEREST_RATE_SCALEUP = 100;

  // 기본은 wei 단위
  uint256 public decimal = 1e18;

  // 실시간 Token 가격을 반영하기 위해 외부에서 주기적으로 업데이트 필요
  // staking 시 현재 값을 적용하여 연이자를 계산
  uint256 public currentScaledTokenPrice = 0;

  // 현재까지 모금된 총 금액
  uint256 public currentTotalFundraising = 0;

  // staking pool 상태
  enum State {
    Waiting, // 대기 (-> 모금)
    Fundraising, // 모금 (-> 운영/잠김/모금 중지/실패)
    Operating, // 운영 (-> 종료/운영 중지)
    Closed, // 운영 종료
    Locked, // 모금 잠김 (-> 운영)
    FundraisingStopped, // 모금 중지
    OperatingStopped, // 운영 중지
    Failed // 모금 실패
  }
  State public state;

  // staking pool 속성
  struct Details {
    string name; // 이름
    string description; // 설명
    uint256 minStakePrice; // 최소 스테이킹 금액
    uint256 scaledAnnualInterestRate; // 연 이자율
    uint256 minFundraisingPrice; // 최소 모금 금액
    uint256 maxFundraisingPrice; // 최대 모금 금액
    address stakingToken; // staking token address
  }
  Details public details;

  // staking 정보
  struct StakingRecord {
    uint256 amountStaked; // staking 수량
    uint256 stakeTimestamp; // staking 시점
    uint256 receivedRewardToken; // 받은 보상
    uint256 pendingRewardScheduleIndex; // 보상 스케줄 목록에서 받을 보상들 중 첫번째 index
    uint256 scaledTokenPrice; // staking 시점의 토큰 가격
    uint256 dailyInterest; // 일 이자
  }
  // 동일 사용자의 staking 이라도 개별 관리
  mapping(address => StakingRecord[]) public stakingRecords;

  // 보상 스케줄
  struct RewardSchedule {
    uint256 scaledTokenPriceAtPayout; // 보상 시 적용될 토큰 가격
    uint256 startDate; // 보상 시작 시점(Unix time)
    uint256 endDate; // 보상 종료 시점(Unix time)
  }
  // 보상 스케줄 목록
  // 보상 시점 마다 외부에서 해당 스케줄을 추가한다.
  // ex) 1년간 매월 보상을 준다면 보상 기간이 연속되어지는 총 12 개 목록이 필요
  RewardSchedule[] public RewardSchedules;

  // 이벤트 정의
  event Staked(address indexed user, uint256 amount);
  event RewardClaimed(address indexed user, uint256 reward);

  event FundraisingStarted(address indexed self);
  event OperatingStarted(address indexed self);
  event PoolClosed(address indexed self);
  event PoolLocked(address indexed self);
  event PoolFundraisingStopped(address indexed self);
  event PoolOperatingStopped(address indexed self);
  event PoolFailed(address indexed self);

  constructor() {
    admin = msg.sender;
    state = State.Waiting;
  }

  modifier onlyAdmin() {
    require(msg.sender == admin, "Not an admin");
    _;
  }

  ////////////////////////////////
  // Pool 관련 설정 함수들 by Admin //
  ////////////////////////////////

  // Pool 이름 설정
  function setPoolName(string memory _name) public onlyAdmin {
    require(state == State.Waiting, "Pool is not in Waiting state");

    details.name = _name;
  }

  // Pool 설명 설정
  function setPoolDescription(string memory _description) public onlyAdmin {
    require(state == State.Waiting, "Pool is not in Waiting state");

    details.description = _description;
  }

  // 최소 스테이킹 금액 설정
  function setMinStakePrice(uint256 _price) public onlyAdmin {
    require(state == State.Waiting, "Pool is not in Waiting state");

    details.minStakePrice = _price;
  }

  // 연 이자율 설정
  function setScaledAnnualInterestRate(
    uint256 _scaledInterestRate
  ) public onlyAdmin {
    require(state == State.Waiting, "Pool is not in Waiting state");

    details.scaledAnnualInterestRate = _scaledInterestRate;
  }

  // 최소 모금 금액 설정
  function setMinFundraisingPrice(uint256 _price) public onlyAdmin {
    require(state == State.Waiting, "Pool is not in Waiting state");

    details.minFundraisingPrice = _price;
  }

  // 최대 모금 금액 설정
  function setMaxFundraisingPrice(uint256 _price) public onlyAdmin {
    require(state == State.Waiting, "Pool is not in Waiting state");

    details.maxFundraisingPrice = _price;
  }

  // 스테이킹 토큰 주소 설정
  function setStakingToken(address _tokenAddress) public onlyAdmin {
    require(state == State.Waiting, "Pool is not in Waiting state");

    details.stakingToken = _tokenAddress;
  }

  // 실시간 Token 가격을 외부에서 주기적으로 업데이트 한다.
  function updateScaledTokenPrice(uint256 _price) external onlyAdmin {
    currentScaledTokenPrice = _price;
  }

  // 보상 스케줄을 추가한다.
  function addRewardSchedule(
    uint256 _scaledTokenPriceAtPayout,
    uint256 _startDate,
    uint256 _endDate
  ) external onlyAdmin {
    require(_startDate < _endDate, "Start date must be before end date");
    require(
      state == State.Operating ||
        state == State.Closed ||
        state == State.OperatingStopped,
      "Pool is not in Operating, Closed, or OperatingStopped state"
    );

    RewardSchedules.push(
      RewardSchedule({
        scaledTokenPriceAtPayout: _scaledTokenPriceAtPayout,
        startDate: _startDate,
        endDate: _endDate
      })
    );
  }

  ///////////////////////////
  // 상태 변경 함수들 by Admin //
  ///////////////////////////

  // 모금 시작
  function startFundraising() public onlyAdmin {
    require(
      state == State.Waiting,
      "Pool must be in Waiting state to start fundraising"
    );

    state = State.Fundraising;
    emit FundraisingStarted(address(this));
  }

  // 운영 시작
  function startOperating() public onlyAdmin {
    require(
      state == State.Fundraising || state == State.Locked,
      "Pool must be in Fundraising or Locked state to start operating"
    );

    state = State.Operating;
    emit OperatingStarted(address(this));
  }

  // Pool 종료
  function closePool() public onlyAdmin {
    require(
      state == State.Operating,
      "Pool must be in Operating state to be closed"
    );

    state = State.Closed;
    emit PoolClosed(address(this));
  }

  // 잠김
  function lockPool() public onlyAdmin {
    require(
      state == State.Fundraising,
      "Pool must be in Fundraising state to be locked"
    );

    state = State.Locked;
    emit PoolLocked(address(this));
  }

  // 모금 중지
  function stopPoolFundrasing() public onlyAdmin {
    require(
      state == State.Fundraising,
      "Pool must be in Fundraising or Operating state to be FundraisingStopped"
    );

    state = State.FundraisingStopped;
    emit PoolFundraisingStopped(address(this));
  }

  // 운영 중지
  function stopPoolOperating() public onlyAdmin {
    require(
      state == State.Operating,
      "Pool must be in Fundraising or Operating state to be OperatingStopped"
    );

    state = State.OperatingStopped;
    emit PoolOperatingStopped(address(this));
  }

  // 실패
  function failPool() public onlyAdmin {
    require(
      state == State.Fundraising,
      "Pool must be in Fundraising state to be marked as failed"
    );

    state = State.Failed;
    emit PoolFailed(address(this));
  }

  //////////////
  // 사용자 요청 //
  //////////////

  // 스테이킹
  function stake(uint256 _amount) external {
    require(
      state == State.Fundraising || state == State.Operating,
      "Invalid state for staking"
    );

    // 최소 스테이킹 금액 이상인지 확인
    uint256 minStakeAmountInTokens = (details.minStakePrice *
      decimal *
      TOKEN_PRICE_SCALEUP) / currentScaledTokenPrice;

    require(
      _amount >= minStakeAmountInTokens,
      "Amount is less than the minimum stake amount"
    );

    // 최대 모금액을 초과하지 않는지 확인
    uint256 stakingAmountInUSD = (_amount * currentScaledTokenPrice) / decimal;
    uint256 newTotalFundraising = currentTotalFundraising + stakingAmountInUSD;
    require(
      newTotalFundraising <= details.maxFundraisingPrice * TOKEN_PRICE_SCALEUP,
      "Amount exceeds the maximum fundraising amount"
    );

    // 최대 모금액에 도달한 경우 풀 상태를 "Locked"으로 변경
    if (
      newTotalFundraising == details.maxFundraisingPrice * TOKEN_PRICE_SCALEUP
    ) {
      state = State.Locked;
      emit PoolLocked(address(this));
    }
    currentTotalFundraising = newTotalFundraising;

    IERC20(details.stakingToken).transferFrom(
      msg.sender,
      address(this),
      _amount
    );

    uint256 dailyInterest = ((_amount * currentScaledTokenPrice) *
      details.scaledAnnualInterestRate) /
      365 /* 1 year */ /
      TOKEN_PRICE_SCALEUP /
      ANNUAL_INTEREST_RATE_SCALEUP;

    stakingRecords[msg.sender].push(
      StakingRecord({
        amountStaked: _amount,
        stakeTimestamp: block.timestamp,
        receivedRewardToken: 0,
        pendingRewardScheduleIndex: 0,
        scaledTokenPrice: currentScaledTokenPrice,
        dailyInterest: dailyInterest
      })
    );

    emit Staked(msg.sender, _amount);
  }

  // 언스테이킹
  function unStake(uint256 _stakeIndex, uint256 _amount) public {
    require(
      state == State.Fundraising,
      "Unstaking is only allowed during fundraising"
    );

    StakingRecord[] storage records = stakingRecords[msg.sender];
    require(_stakeIndex < records.length, "Invalid stake index");

    StakingRecord storage record = records[_stakeIndex];
    require(record.amountStaked >= _amount, "Insufficient staked amount");

    if (record.amountStaked == _amount) {
      records[_stakeIndex] = records[records.length - 1];
      records.pop();
    } else {
      record.amountStaked -= _amount;

      uint256 dailyInterest = ((record.amountStaked * record.scaledTokenPrice) *
        details.scaledAnnualInterestRate) /
        365 /* 1 year */ /
        TOKEN_PRICE_SCALEUP /
        ANNUAL_INTEREST_RATE_SCALEUP;

      record.dailyInterest = dailyInterest;
    }

    IERC20(details.stakingToken).transfer(msg.sender, _amount);
  }

  // 보상 요청 (운영/운영종료/운영중지 인 경우)
  function claimRewardToken(uint256 _stakeIndex) public {
    require(
      state == State.Operating ||
        state == State.Closed ||
        state == State.OperatingStopped,
      "Invalid state for claiming rewards"
    );

    require(
      _stakeIndex < stakingRecords[msg.sender].length,
      "Invalid stake index"
    );

    (uint256 reward, uint256 nextIndex) = getPendingRewardToken(
      msg.sender,
      _stakeIndex
    );
    require(reward > 0, "No reward available");

    StakingRecord storage userStake = stakingRecords[msg.sender][_stakeIndex];
    userStake.receivedRewardToken += reward;
    userStake.pendingRewardScheduleIndex = nextIndex;

    IERC20(details.stakingToken).transfer(msg.sender, reward);

    emit RewardClaimed(msg.sender, reward);
  }

  // 원금 회수 (모금중지/모금실패/운영중지/운영종료 인 경우)
  function withdrawPrincipal() public {
    require(
      state == State.FundraisingStopped ||
        state == State.Failed ||
        state == State.OperatingStopped ||
        state == State.Closed,
      "Invalid state for withdrawing principal"
    );

    StakingRecord[] storage records = stakingRecords[msg.sender];
    uint256 totalAmount = 0;

    // 모든 보상이 청구되었는지 확인
    for (uint256 i = 0; i < records.length; i++) {
      (uint256 reward, ) = getPendingRewardToken(msg.sender, i);
      require(
        reward == 0,
        "Please claim all rewards before withdrawing principal"
      );
    }

    for (uint256 i = 0; i < records.length; i++) {
      totalAmount += records[i].amountStaked;
      records[i].amountStaked = 0;
    }

    IERC20(details.stakingToken).transfer(msg.sender, totalAmount);
  }

  //////////////
  // 사용자 조회 //
  //////////////

  // 보상 확인
  function getPendingRewardToken(
    address _user,
    uint256 _stakeIndex
  ) public view returns (uint256, uint256) {
    require(_stakeIndex < stakingRecords[_user].length, "Invalid stake index");

    StakingRecord storage userStake = stakingRecords[_user][_stakeIndex];
    uint256 reward = 0;
    uint256 nextIndex = userStake.pendingRewardScheduleIndex;

    for (
      uint256 i = userStake.pendingRewardScheduleIndex;
      i < RewardSchedules.length;
      i++
    ) {
      RewardSchedule memory schedule = RewardSchedules[i];

      // 현재 시간이 보상 종료 시간을 넘지 않았으면 보상 계산에서 제외
      if (block.timestamp < schedule.endDate) {
        break;
      }

      // 보상 계산을 위한 시작 시점: 스테이킹 시점과 스케줄의 시작 시점 중 더 늦은 시점
      uint256 effectiveStartDate = userStake.stakeTimestamp > schedule.startDate
        ? userStake.stakeTimestamp
        : schedule.startDate;

      // 보상 계산을 위한 종료 시점: 현재 시간과 스케줄의 종료 시점 중 더 이른 시점
      uint256 effectiveEndDate = block.timestamp < schedule.endDate
        ? block.timestamp
        : schedule.endDate;

      // 스테이킹 시점이 스케줄의 종료 시점보다 이전이고, 현재 시간이 스케줄의 시작 시점보다 이후인 경우에만 보상을 계산합니다.
      if (
        userStake.stakeTimestamp < schedule.endDate &&
        block.timestamp > schedule.startDate
      ) {
        if (effectiveStartDate < effectiveEndDate) {
          uint256 stakingDays = (effectiveEndDate - effectiveStartDate) /
            1 days;

          reward += (((userStake.dailyInterest * stakingDays) /
            schedule.scaledTokenPriceAtPayout) * TOKEN_PRICE_SCALEUP);
        }
      }

      // 현재 시간이 보상 종료 시간을 넘었을때 다음 보상 스케줄로 넘어간다.
      if (block.timestamp >= schedule.endDate) {
        nextIndex += 1;
      }
    }

    return (reward, nextIndex);
  }

  // 사용자의 전체 보상 조회
  function getPendingRewardTokens(
    address _staker
  ) public view returns (uint256) {
    require(state == State.Operating, "Invalid state for viewing rewards");

    // 보상 조회 로직
    uint256 totalReward = 0;
    StakingRecord[] storage records = stakingRecords[_staker];

    for (uint256 i = 0; i < records.length; i++) {
      (uint256 reward, ) = getPendingRewardToken(_staker, i);
      totalReward += reward;
    }

    return totalReward;
  }

  // 전체 누적 보상 조회
  function viewAccumulatedRewards(
    address _staker
  ) public view returns (uint256) {
    require(state == State.Operating, "Invalid state for viewing rewards");

    // 누적 보상 조회 로직
    uint256 totalReward = 0;
    StakingRecord[] storage records = stakingRecords[_staker];

    for (uint256 i = 0; i < records.length; i++) {
      totalReward += records[i].receivedRewardToken;
    }

    return totalReward;
  }

  // 전체 보상 요청
  function requestRewards() public {
    require(state == State.Operating, "Invalid state for requesting rewards");

    // 보상 요청 로직
    StakingRecord[] storage records = stakingRecords[msg.sender];

    for (uint256 i = 0; i < records.length; i++) {
      claimRewardToken(i);
    }
  }

  // function to get length of the staking records array
  function getStakingRecordLength(
    address _user
  ) external view returns (uint256) {
    return stakingRecords[_user].length;
  }
}
