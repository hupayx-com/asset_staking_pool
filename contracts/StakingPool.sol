// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

// Uncomment this line to use console.log
// import "hardhat/console.sol";

/**
 * @dev ERC20 표준 인터페이스를 정의한 인터페이스
 */
interface IERC20 {
  /**
   * @dev `amount` 만큼의 토큰을 `sender`로부터 `recipient`로 전송합니다.
   * @param sender 보내는 주소
   * @param recipient 받는 주소
   * @param amount 전송할 토큰의 양
   * @return 성공 여부
   */
  function transferFrom(
    address sender,
    address recipient,
    uint256 amount
  ) external returns (bool);

  /**
   * @dev `amount` 만큼의 토큰을 호출자 주소로부터 `recipient`로 전송합니다.
   * @param recipient 받는 주소
   * @param amount 전송할 토큰의 양
   * @return 성공 여부
   */
  function transfer(address recipient, uint256 amount) external returns (bool);
}

/// 가격 기준: 달러($)
/// 시간 단위: 초
contract StakingPool {
  /// 관리자 주소
  address public admin;

  /// 소수점 계산을 위해 가격 x1,000,000 (ex. 2024년 4월 27일 SFL 가격: $0.002718)
  uint256 public constant PRICE_MULTIPLIER = 1e6;
  /// 소수점 계산을 위해 연 이자율 x100 (ex. 이자율: 0.05 %)
  uint256 public constant ANNUAL_INTEREST_RATE_MULTIPLIER = 100;

  /// default: wei
  uint256 public tokenDecimals = 1e18;

  /// 실시간 Token 가격 반영을 위해 외부에서 주기적으로 업데이트 필요
  /// staking 시 현재 token 가격을 적용하여 연 이자율 계산
  uint256 public currentMultipliedTokenPrice = 0;

  /// 총 모금 금액
  uint256 public totalFundraisingInMultipliedUSD = 0;

  /**
   * @dev 풀의 상태를 나타내는 열거형
   */
  enum State {
    Waiting, /// 대기 (-> 모금)
    Fundraising, /// 모금 (-> 운영/모금 잠김/모금 중지/모금 실패)
    Operating, /// 운영 (-> 운영 종료/운영 중지)
    Closed, /// 운영 종료
    Locked, /// 모금 잠김 (-> 운영)
    FundraisingStopped, /// 모금 중지
    OperatingStopped, /// 운영 중지
    Failed /// 모금 실패
  }
  State public state;

  /**
   * @dev 풀의 세부사항을 나타내는 구조체
   */
  struct Details {
    string name; /// 이름
    string description; /// 설명
    uint256 minStakeInUSD; /// 최소 스테이킹 금액
    uint256 multipliedAnnualInterestRate; /// 연 이자율
    uint256 minFundraisingInUSD; /// 최소 모금 금액
    uint256 maxFundraisingInUSD; /// 최대 모금 금액
    address stakingToken; /// staking token address
  }
  Details public details;

  /**
   * @dev 스테이킹 정보를 저장하는 구조체
   */
  struct StakeRecord {
    uint256 amountStaked; /// staking 수량
    uint256 stakeTime; /// staking 시점(Unix time)
    uint256 claimedRewards; /// 받은 보상
    uint256 pendingRewardScheduleIndex; /// 보상 스케줄 목록에서 받을 보상들 중 첫 번째 index
    uint256 multipliedTokenPrice; /// staking 시점의 토큰 가격
    uint256 dailyInterestInUSD; /// 일 이자
  }
  /// 동일 사용자의 staking이라도 개별 관리
  mapping(address => StakeRecord[]) public userStakes;

  /**
   * @dev 보상 스케줄을 정의하는 구조체
   */
  struct RewardSchedule {
    uint256 multipliedTokenPriceAtPayout; /// 보상 시 적용될 토큰 가격
    uint256 start; /// 보상 시작 시점(Unix time)
    uint256 end; /// 보상 종료 시점(Unix time)
  }
  /// 보상 스케줄 목록
  /// 보상 시점마다 외부에서 해당 스케줄을 추가한다.
  /// ex) 1년간 매월 보상을 준다면 보상 기간이 연속되는 총 12개의 목록이 필요
  RewardSchedule[] public rewardSchedules;

  /**
   * @dev 이벤트 정의
   */
  event Staked(address indexed user, uint256 amount);
  event Unstaked(address indexed user, uint256 amount);
  event RewardScheduleAdded(
    uint256 multipliedTokenPriceAtPayout,
    uint256 start,
    uint256 end
  );
  event RewardClaimed(address indexed user, uint256 reward);
  event MultipliedTokenPriceUpdated(uint256 newPrice);
  event PrincipalWithdrawn(address indexed user, uint256 totalAmount);

  event FundraisingStarted();
  event OperatingStarted();
  event PoolClosed();
  event PoolLocked();
  event PoolFundraisingStopped();
  event PoolOperatingStopped();
  event PoolFailed();

  /**
   * @dev 스테이킹풀 생성자
   * @param _admin 풀의 관리자 주소
   */
  constructor(address _admin) {
    admin = _admin;
    state = State.Waiting;
  }

  modifier onlyAdmin() {
    require(msg.sender == admin, "Not an admin");
    _;
  }

  //////////////////////////////////
  /// Pool 관련 설정 함수들 by Admin ///
  //////////////////////////////////

  /**
   * @notice 관리자 변경 함수
   * @param newAdmin 새 관리자 주소
   */
  function changeAdmin(address newAdmin) public onlyAdmin {
    require(newAdmin != address(0), "New admin address cannot be zero");

    admin = newAdmin;
  }

  /**
   * @notice Pool 이름 설정
   * @param _name 풀 이름
   */
  function setPoolName(string memory _name) public onlyAdmin {
    require(state == State.Waiting, "Pool is not in Waiting state");

    details.name = _name;
  }

  /**
   * @notice Pool 설명 설정
   * @param _description 풀 설명
   */
  function setPoolDescription(string memory _description) public onlyAdmin {
    require(state == State.Waiting, "Pool is not in Waiting state");

    details.description = _description;
  }

  /**
   * @notice 최소 스테이킹 금액 설정
   * @param _price 최소 스테이킹 금액
   */
  function setMinStakePrice(uint256 _price) public onlyAdmin {
    require(state == State.Waiting, "Pool is not in Waiting state");

    details.minStakeInUSD = _price;
  }

  /**
   * @notice 연 이자율 설정
   * @param _multipliedInterestRate 연 이자율
   */
  function setAnnualInterestRateMultiplier(
    uint256 _multipliedInterestRate
  ) public onlyAdmin {
    require(state == State.Waiting, "Pool is not in Waiting state");

    details.multipliedAnnualInterestRate = _multipliedInterestRate;
  }

  /**
   * @notice 최소 모금 금액 설정
   * @param _price 최소 모금 금액
   */
  function setMinFundraisingPrice(uint256 _price) public onlyAdmin {
    require(state == State.Waiting, "Pool is not in Waiting state");

    details.minFundraisingInUSD = _price;
  }

  /**
   * @notice 최대 모금 금액 설정
   * @param _price 최대 모금 금액
   */
  function setMaxFundraisingPrice(uint256 _price) public onlyAdmin {
    require(state == State.Waiting, "Pool is not in Waiting state");

    details.maxFundraisingInUSD = _price;
  }

  /**
   * @notice 스테이킹 토큰 주소 설정
   * @param _tokenAddress 토큰 주소
   */
  function setStakingToken(address _tokenAddress) public onlyAdmin {
    require(state == State.Waiting, "Pool is not in Waiting state");

    details.stakingToken = _tokenAddress;
  }

  /**
   * @notice 실시간 Token 가격을 외부에서 주기적으로 업데이트 한다.
   * @param _price 새로운 Token 가격
   */
  function updateMultipliedTokenPrice(uint256 _price) external onlyAdmin {
    currentMultipliedTokenPrice = _price;
    emit MultipliedTokenPriceUpdated(_price);
  }

  /**
   * @notice 보상 스케줄을 추가한다.
   * @param _multipliedTokenPriceAtPayout 보상 시 적용될 토큰 가격
   * @param _start 보상 시작 시점(Unix time)
   * @param _end 보상 종료 시점(Unix time)
   */
  function addRewardSchedule(
    uint256 _multipliedTokenPriceAtPayout,
    uint256 _start,
    uint256 _end
  ) external onlyAdmin {
    require(_start < _end, "Start date must be before end date");
    require(
      state == State.Operating ||
        state == State.Closed ||
        state == State.OperatingStopped,
      "Pool is not in Operating, Closed, or OperatingStopped state"
    );

    rewardSchedules.push(
      RewardSchedule({
        multipliedTokenPriceAtPayout: _multipliedTokenPriceAtPayout,
        start: _start,
        end: _end
      })
    );

    emit RewardScheduleAdded(_multipliedTokenPriceAtPayout, _start, _end);
  }

  /////////////////////////////
  /// 상태 변경 함수들 by Admin ///
  /////////////////////////////

  /**
   * @notice 모금 시작
   */
  function startFundraising() public onlyAdmin {
    require(
      state == State.Waiting,
      "Pool must be in Waiting state to start fundraising"
    );

    state = State.Fundraising;
    emit FundraisingStarted();
  }

  /**
   * @notice 운영 시작
   */
  function startOperating() public onlyAdmin {
    require(
      state == State.Fundraising || state == State.Locked,
      "Pool must be in Fundraising or Locked state to start operating"
    );

    state = State.Operating;
    emit OperatingStarted();
  }

  /**
   * @notice Pool 종료
   */
  function closePool() public onlyAdmin {
    require(
      state == State.Operating,
      "Pool must be in Operating state to be closed"
    );

    state = State.Closed;
    emit PoolClosed();
  }

  /**
   * @notice 잠김
   */
  function lockPool() public onlyAdmin {
    require(
      state == State.Fundraising,
      "Pool must be in Fundraising state to be locked"
    );

    state = State.Locked;
    emit PoolLocked();
  }

  /**
   * @notice 모금 중지
   */
  function stopPoolFundraising() public onlyAdmin {
    require(
      state == State.Fundraising,
      "Pool must be in Fundraising or Operating state to be FundraisingStopped"
    );

    state = State.FundraisingStopped;
    emit PoolFundraisingStopped();
  }

  /**
   * @notice 운영 중지
   */
  function stopPoolOperating() public onlyAdmin {
    require(
      state == State.Operating,
      "Pool must be in Fundraising or Operating state to be OperatingStopped"
    );

    state = State.OperatingStopped;
    emit PoolOperatingStopped();
  }

  /**
   * @notice 실패
   */
  function failPool() public onlyAdmin {
    require(
      state == State.Fundraising,
      "Pool must be in Fundraising state to be marked as failed"
    );

    state = State.Failed;
    emit PoolFailed();
  }

  //////////////
  /// 사용자 요청 ///
  //////////////

  /**
   * @notice 스테이킹
   * @param _amount 스테이킹 금액
   */
  function stakeToken(uint256 _amount) external {
    require(
      state == State.Fundraising || state == State.Operating,
      "Invalid state for staking"
    );

    /// 최소 스테이킹 금액 이상인지 확인
    uint256 minStakeAmountInTokens = (details.minStakeInUSD *
      tokenDecimals *
      PRICE_MULTIPLIER) / currentMultipliedTokenPrice;

    require(
      _amount >= minStakeAmountInTokens,
      "Amount is less than the minimum stakeToken amount"
    );

    /// 최대 모금액을 초과하지 않는지 확인
    uint256 stakingAmountInUSD = (_amount * currentMultipliedTokenPrice) /
      tokenDecimals;
    uint256 newTotalFundraising = totalFundraisingInMultipliedUSD +
      stakingAmountInUSD;
    require(
      newTotalFundraising <= details.maxFundraisingInUSD * PRICE_MULTIPLIER,
      "Amount exceeds the maximum fundraising amount"
    );

    /// 최대 모금액에 도달한 경우 풀 상태를 "Locked"으로 변경
    if (newTotalFundraising == details.maxFundraisingInUSD * PRICE_MULTIPLIER) {
      state = State.Locked;
      emit PoolLocked();
    }
    totalFundraisingInMultipliedUSD = newTotalFundraising;

    IERC20(details.stakingToken).transferFrom(
      msg.sender,
      address(this),
      _amount
    );

    uint256 dailyInterestInUSD = ((_amount * currentMultipliedTokenPrice) *
      details.multipliedAnnualInterestRate) /
      365 /* 1 year */ /
      PRICE_MULTIPLIER /
      ANNUAL_INTEREST_RATE_MULTIPLIER;

    userStakes[msg.sender].push(
      StakeRecord({
        amountStaked: _amount,
        stakeTime: block.timestamp,
        claimedRewards: 0,
        pendingRewardScheduleIndex: 0,
        multipliedTokenPrice: currentMultipliedTokenPrice,
        dailyInterestInUSD: dailyInterestInUSD
      })
    );

    emit Staked(msg.sender, _amount);
  }

  /**
   * @notice 언스테이킹
   * @param _stakeIndex 스테이킹 인덱스
   * @param _amount 언스테이킹 할 금액
   */
  function unStakeToken(uint256 _stakeIndex, uint256 _amount) public {
    require(
      state == State.Fundraising,
      "Unstaking is only allowed during fundraising"
    );

    StakeRecord[] storage records = userStakes[msg.sender];
    require(_stakeIndex < records.length, "Invalid stakeToken index");

    StakeRecord storage record = records[_stakeIndex];
    require(record.amountStaked >= _amount, "Insufficient staked amount");

    if (record.amountStaked == _amount) {
      records[_stakeIndex] = records[records.length - 1];
      records.pop();
    } else {
      record.amountStaked -= _amount;

      uint256 dailyInterestInUSD = ((record.amountStaked *
        record.multipliedTokenPrice) * details.multipliedAnnualInterestRate) /
        365 /* 1 year */ /
        PRICE_MULTIPLIER /
        ANNUAL_INTEREST_RATE_MULTIPLIER;

      record.dailyInterestInUSD = dailyInterestInUSD;
    }

    IERC20(details.stakingToken).transfer(msg.sender, _amount);

    totalFundraisingInMultipliedUSD -=
      (_amount * record.multipliedTokenPrice) /
      tokenDecimals;

    emit Unstaked(msg.sender, _amount);
  }

  /**
   * @notice staking 별 보상 요청 (운영/운영종료/운영중지 인 경우)
   * @param _stakeIndex 스테이킹 인덱스
   */
  function claimRewardToken(uint256 _stakeIndex) public {
    require(
      state == State.Operating ||
        state == State.Closed ||
        state == State.OperatingStopped,
      "Invalid state for claiming rewards"
    );

    require(
      _stakeIndex < userStakes[msg.sender].length,
      "Invalid stakeToken index"
    );

    (uint256 reward, uint256 nextIndex) = calculatePendingRewardToken(
      msg.sender,
      _stakeIndex
    );
    require(reward > 0, "No reward available");

    StakeRecord storage userStake = userStakes[msg.sender][_stakeIndex];
    userStake.claimedRewards += reward;
    userStake.pendingRewardScheduleIndex = nextIndex;

    IERC20(details.stakingToken).transfer(msg.sender, reward);

    emit RewardClaimed(msg.sender, reward);
  }

  /**
   * @notice 원금 회수 (모금중지/모금실패/운영중지/운영종료 인 경우)
   */
  function withdrawAllPrincipal() public {
    require(
      state == State.FundraisingStopped ||
        state == State.Failed ||
        state == State.OperatingStopped ||
        state == State.Closed,
      "Invalid state for withdrawing principal"
    );

    StakeRecord[] storage records = userStakes[msg.sender];
    uint256 totalAmount = 0;

    /// 모든 보상이 청구되었는지 확인
    for (uint256 i = 0; i < records.length; i++) {
      (uint256 reward, ) = calculatePendingRewardToken(msg.sender, i);
      require(
        reward == 0,
        "Please claim all rewards before withdrawing principal"
      );
    }

    for (uint256 i = 0; i < records.length; i++) {
      uint256 amount = (records[i].amountStaked *
        records[i].multipliedTokenPrice) / currentMultipliedTokenPrice;

      totalAmount += amount;
      records[i].amountStaked = 0;
    }

    IERC20(details.stakingToken).transfer(msg.sender, totalAmount);

    emit PrincipalWithdrawn(msg.sender, totalAmount);
  }

  /**
   * @notice 사용자의 전체 보상 요청
   */
  function claimAllRewardToken() public {
    require(state == State.Operating, "Invalid state for requesting rewards");

    /// 보상 요청 로직
    StakeRecord[] storage records = userStakes[msg.sender];

    for (uint256 i = 0; i < records.length; i++) {
      claimRewardToken(i);
    }
  }

  ////////////////
  /// 사용자 조회 ///
  ////////////////

  function getPoolDetails() external view returns (Details memory) {
    return details;
  }

  /**
   * @notice 보상을 확인
   * @param _user 사용자 주소
   * @param _stakeIndex 스테이킹 인덱스
   * @return 받을 보상 금액과 다음 인덱스
   */
  function calculatePendingRewardToken(
    address _user,
    uint256 _stakeIndex
  ) public view returns (uint256, uint256) {
    require(_stakeIndex < userStakes[_user].length, "Invalid stakeToken index");

    StakeRecord storage userStake = userStakes[_user][_stakeIndex];
    uint256 reward = 0;
    uint256 nextIndex = userStake.pendingRewardScheduleIndex;

    for (
      uint256 i = userStake.pendingRewardScheduleIndex;
      i < rewardSchedules.length;
      i++
    ) {
      RewardSchedule memory schedule = rewardSchedules[i];

      /// 현재 시간이 보상 종료 시간을 넘지 않았으면 보상 계산에서 제외
      if (block.timestamp < schedule.end) {
        break;
      }

      /// 보상 계산을 위한 시작 시점: 스테이킹 시점과 스케줄의 시작 시점 중 더 늦은 시점
      uint256 effectivestart = userStake.stakeTime > schedule.start
        ? userStake.stakeTime
        : schedule.start;

      // 보상 계산을 위한 종료 시점: 현재 시간과 스케줄의 종료 시점 중 더 이른 시점
      uint256 effectiveend = block.timestamp < schedule.end
        ? block.timestamp
        : schedule.end;

      /// 스테이킹 시점이 스케줄의 종료 시점보다 이전이고, 현재 시간이 스케줄의 시작 시점보다 이후인 경우에만 보상을 계산합니다.
      if (
        userStake.stakeTime < schedule.end && block.timestamp > schedule.start
      ) {
        if (effectivestart < effectiveend) {
          uint256 stakingDays = (effectiveend - effectivestart) / 1 days;

          reward += (((userStake.dailyInterestInUSD * stakingDays) /
            schedule.multipliedTokenPriceAtPayout) * PRICE_MULTIPLIER);
        }
      }

      /// 현재 시간이 보상 종료 시간을 넘었을때 다음 보상 스케줄로 넘어간다.
      if (block.timestamp >= schedule.end) {
        nextIndex += 1;
      }
    }

    return (reward, nextIndex);
  }

  /**
   * @notice 사용자의 전체 받을 보상 조회
   * @param _staker 사용자 주소
   * @return 사용자가 받을 전체 보상 금액
   */
  function calculateAllPendingRewardToken(
    address _staker
  ) public view returns (uint256) {
    require(state == State.Operating, "Invalid state for viewing rewards");

    // 보상 조회 로직
    uint256 totalReward = 0;
    StakeRecord[] storage records = userStakes[_staker];

    for (uint256 i = 0; i < records.length; i++) {
      (uint256 reward, ) = calculatePendingRewardToken(_staker, i);
      totalReward += reward;
    }

    return totalReward;
  }

  /**
   * @notice 사용자의 전체 받은 보상 조회
   * @param _staker 사용자 주소
   * @return 사용자가 받은 전체 보상 금액
   */
  function calculateAllClaimedRewardToken(
    address _staker
  ) public view returns (uint256) {
    require(state == State.Operating, "Invalid state for viewing rewards");

    /// 누적 보상 조회 로직
    uint256 totalReward = 0;
    StakeRecord[] storage records = userStakes[_staker];

    for (uint256 i = 0; i < records.length; i++) {
      totalReward += records[i].claimedRewards;
    }

    return totalReward;
  }

  /**
   * @notice 사용자의 스테이킹 개수를 얻어온다.
   * @param _user 사용자 주소
   * @return 사용자의 스테이킹 개수
   */
  function getUserStakeCount(address _user) external view returns (uint256) {
    return userStakes[_user].length;
  }
}
