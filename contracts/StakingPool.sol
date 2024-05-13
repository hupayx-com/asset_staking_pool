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

  // 소수점 계산을 위해 SFL 가격 x1,000,000 scaleUp (ex. 2024년 4월27일 SFL 가격: $0.002718)
  uint256 public constant TOKEN_PRICE_SCALEUP = 1e6;
  // 소수점 계산을 위해 이자을 x100 scaleUp (ex. 이자율: 0.05 %)
  uint256 public constant INTEREST_RATE_SCALEUP = 100;

  // 실시간 SFL 가격을 반영하기 위해 외부에서 주기적으로 업데이트 필요
  uint256 public currentScaledTokenPrice = 0;

  // staking pool 상태
  enum State {
    Waiting, // 대기
    Fundraising, // 모금
    Operating, // 운영
    Closed, // 종료
    Stopped // 중지
  }
  State public state;

  // staking pool 속성
  struct Details {
    string name; // 이름
    string description; // 설명
    uint256 minStakePrice; // 최소 스테이킹 금액
    uint256 annualScaledInterestRate; // 연 이자율
    uint256 fundraisingDuration; // 모금 기간
    uint256 operatingDuration; // 운영 기간
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
    uint256 nextPendingRewardScheduleIndex; // 보상 스케줄 목록에서 받을 보상의 첫번째 index
    uint256 scaledTokenPrice; // staking 시점의 토큰 가격
    uint256 dailyInterest; // 일 이자
  }
  // 동일 사용자의 staking 이라도 개별 관리
  mapping(address => StakingRecord[]) public stakingRecords;

  // 보상 스케줄
  struct RewardSchedule {
    uint256 scaledTokenPriceAtPayout; // 보상 시 적용될 SFL 토큰 가격
    uint256 startDate; // 보상 시작 시점(Unix time)
    uint256 endDate; // 보상 종료 시점(Unix time)
  }
  // 보상 스케줄 목록
  // 보상 시점 마다 외부에서 해당 스케줄을 추가한다.
  // ex) 1년간 매월 보상을 준다면 보상 기간이 연속되어지는 총 12 개 목록이 필요
  RewardSchedule[] public RewardSchedules;

  constructor() {
    admin = msg.sender;
    state = State.Waiting;
  }

  modifier onlyAdmin() {
    require(msg.sender == admin, "Not an admin");
    _;
  }

  // 실시간 Token(SFL) 가격을 외부에서 주기적으로 업데이트 한다.
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
    RewardSchedules.push(
      RewardSchedule({
        scaledTokenPriceAtPayout: _scaledTokenPriceAtPayout,
        startDate: _startDate,
        endDate: _endDate
      })
    );
  }

  function stake(uint256 _amount) external {
    require(
      state == State.Fundraising || state == State.Operating,
      "Invalid state for staking"
    );

    // TODO
    // - 최소 staking 가격 체크
    // require(
    //   _amount >= details.minStakePrice,
    //   "Amount is less than the minimum stake amount"
    // );

    IERC20(details.stakingToken).transferFrom(
      msg.sender,
      address(this),
      _amount
    );

    uint256 dailyInterest = ((_amount * currentScaledTokenPrice) *
      details.annualScaledInterestRate) /
      365 /* 1 year */ /
      TOKEN_PRICE_SCALEUP /
      INTEREST_RATE_SCALEUP;

    stakingRecords[msg.sender].push(
      StakingRecord({
        amountStaked: _amount,
        stakeTimestamp: block.timestamp,
        receivedRewardToken: 0,
        nextPendingRewardScheduleIndex: 0,
        scaledTokenPrice: currentScaledTokenPrice,
        dailyInterest: dailyInterest
      })
    );
  }

  // 받을 보상을 확인 한다.
  function getPendingRewardToken(
    address _user,
    uint256 _stakeIndex
  ) public view returns (uint256, uint256) {
    require(_stakeIndex < stakingRecords[_user].length, "Invalid stake index");

    StakingRecord storage userStake = stakingRecords[_user][_stakeIndex];
    uint256 reward = 0;
    uint256 nextIndex = 0;

    for (
      uint256 i = userStake.nextPendingRewardScheduleIndex;
      i < RewardSchedules.length;
      i++
    ) {
      nextIndex = i;

      RewardSchedule memory schedule = RewardSchedules[i];

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
    }

    return (reward, nextIndex);
  }

  // 보상 요청
  function claimRewardToken(uint256 _stakeIndex) external {
    require(state != State.Waiting && state != State.Fundraising);

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
    userStake.nextPendingRewardScheduleIndex = ++nextIndex;

    IERC20(details.stakingToken).transfer(msg.sender, reward);
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

    details.minStakePrice = _amount;
  }

  function setAnnualScaledInterestRate(uint256 _interestRate) public onlyAdmin {
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

    details.minFundraisingPrice = _amount;
  }

  function setMaxFundraisingAmount(uint256 _amount) public onlyAdmin {
    require(state == State.Waiting);

    details.maxFundraisingPrice = _amount;
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

  function getPendingRewardTokens(
    address _staker
  ) public view returns (uint256) {
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
