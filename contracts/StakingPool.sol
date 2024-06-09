// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @dev ERC20(staking token) standard interface
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
  /// 소수점 계산을 위해 이자율 x10,000 (ex. 이자율: 0.05% == 0.0005)
  uint256 public constant RATE_MULTIPLIER = 10000;

  /// staking token 의 소수점 자리수에 따라 변경 가능
  uint256 public tokenDecimals = 1e18; /// default: wei

  /// 토큰 당 달러 가격 (ex. 토근 가격이 $1 인 경우 실제 값은 1 x PRICE_MULTIPLIER)
  /// 실시간 Token 가격 반영을 위해 외부에서 주기적으로 업데이트 필요
  /// staking 시 해당 값을 적용하여 일(day) 이자율 계산
  uint256 public currentTokenMultipliedPrice = 0;

  /// 총 모금 금액 (ex. 총 모금액이 $100 인 경우 실제 값은 100 x PRICE_MULTIPLIER)
  uint256 public totalFundraisingMultipliedPrice = 0;

  /**
   * @dev Pool 의 상태를 나타내는 열거형
   */
  enum State {
    Waiting, /// 대기 (다음 상태: 모금)
    Fundraising, /// 모금 진행 (다음 상태: 운영 or 모금 잠김 or 모금 중지 or 모금 실패)
    FundraisingLocked, /// 모금 잠김 (다음 상태: 운영)
    FundraisingStopped, /// 모금 중지
    FundraisingFailed, /// 모금 실패
    Operating, /// 운영 (다음 상태: 운영 종료 or 운영 중지)
    OperatingClosed, /// 운영 종료
    OperatingStopped /// 운영 중지
  }
  State public state;

  /**
   * @dev Pool 의 세부사항을 나타내는 구조체
   */
  struct Details {
    string name; /// 이름
    string description; /// 설명
    uint256 minStakePrice; /// 최소 스테이킹 금액
    uint256 minFundraisingPrice; /// 최소 모금 금액
    uint256 maxFundraisingPrice; /// 최대 모금 금액
    uint256 annualInterestMultipliedRate; /// 연이율
    address stakingToken; /// staking token address
  }
  Details public details;

  /**
   * @dev 스테이킹 정보를 저장하는 구조체
   */
  struct StakeRecord {
    uint256 amountStaked; /// 스테이킹 수량
    uint256 stakeTime; /// 스테이킹 시점(Unix time)
    uint256 claimedReward; /// 받은 보상
    uint256 pendingRewardScheduleIndex; /// 보상 스케줄 목록에서 받을 보상들 중 첫 번째 index
    uint256 tokenMultipliedPrice; /// staking 시점의 토큰 가격
    uint256 dailyInterestMultipliedPriceAndRate; /// 일 이자
  }
  /// 동일 사용자의 스테이킹 이라도 개별 관리
  mapping(address => StakeRecord[]) public userStakes;

  /**
   * @dev 보상 스케줄을 정의하는 구조체
   */
  struct RewardSchedule {
    uint256 tokenMultipliedPriceAtPayout; /// 보상 시 적용될 토큰 가격
    uint256 start; /// 보상 시작 시점(Unix time)
    uint256 end; /// 보상 종료 시점(Unix time)
  }
  /// 보상 스케줄 목록
  /// 보상 시점마다 외부에서 해당 스케줄을 추가한다.
  /// ex) 1년간 매월 15일 보상을 주는 경우, 매월 15일 마다 보상 스케줄을 추가하여 총 12 개의 목록이 필요
  RewardSchedule[] public rewardSchedules;

  /**
   * @dev 이벤트 정의
   */
  event TokenMultipliedPriceUpdated(uint256 newPrice);
  event RewardScheduleAdded(
    uint256 tokenMultipliedPriceAtPayout,
    uint256 start,
    uint256 end
  );
  event Staked(address indexed user, uint256 amount);
  event Unstaked(address indexed user, uint256 amount);
  event RewardClaimed(address indexed user, uint256 reward);
  event PrincipalWithdrawn(address indexed user, uint256 totalAmount);

  event FundraisingStarted();
  event FundraisingLocked();
  event FundraisingStopped();
  event FundraisingFailed();
  event OperatingStarted();
  event OperatingClosed();
  event OperatingStopped();

  event AdminChanged(address indexed previousAdmin, address indexed newAdmin);

  /**
   * @dev 스테이킹풀 생성자
   * @param _admin Pool 의 관리자 주소
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
  /// Pool 운영 관련 함수들 by Admin ///
  //////////////////////////////////

  /**
   * @notice 관리자 변경 함수
   * @param newAdmin 새 관리자 주소
   */
  function changeAdmin(address newAdmin) public onlyAdmin {
    require(newAdmin != address(0), "New admin address cannot be zero");

    address previousAdmin = admin;
    admin = newAdmin;

    emit AdminChanged(previousAdmin, newAdmin);
  }

  /**
   * @notice 스테이킹풀이 보유한 토큰을 관리자 권한으로 전송
   * @param _recipient 받는 주소
   * @param _amount 전송할 토큰의 양
   */
  function transferStakingToken(
    address _recipient,
    uint256 _amount
  ) external onlyAdmin {
    require(_recipient != address(0), "Recipient address cannot be zero");
    require(_amount > 0, "Amount must be greater than zero");

    IERC20(details.stakingToken).transfer(_recipient, _amount);
  }

  /**
   * @notice 토큰 소수점 자릿수 설정
   * @param _decimals 소수점 자릿수
   */
  function setTokenDecimals(uint256 _decimals) public onlyAdmin {
    require(state == State.Waiting, "Pool is not in Waiting state");

    tokenDecimals = _decimals;
  }

  /**
   * @notice Pool 이름 설정
   * @param _name Pool 이름
   */
  function setPoolName(string memory _name) public onlyAdmin {
    require(state == State.Waiting, "Pool is not in Waiting state");

    details.name = _name;
  }

  /**
   * @notice Pool 설명 설정
   * @param _description Pool 설명
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

    details.minStakePrice = _price;
  }

  /**
   * @notice 연이율 설정
   * @param _interestMultipliedRate 연이율, ex) 0.5% 경우, 실제값은 0.5 x RATE_MULTIPLIER
   */
  function setAnnualInterestRateMultiplier(
    uint256 _interestMultipliedRate
  ) public onlyAdmin {
    require(state == State.Waiting, "Pool is not in Waiting state");

    details.annualInterestMultipliedRate = _interestMultipliedRate;
  }

  /**
   * @notice 최소 모금 금액 설정
   * @param _price 최소 모금 금액
   */
  function setMinFundraisingPrice(uint256 _price) public onlyAdmin {
    require(state == State.Waiting, "Pool is not in Waiting state");

    details.minFundraisingPrice = _price;
  }

  /**
   * @notice 최대 모금 금액 설정
   * @param _price 최대 모금 금액
   */
  function setMaxFundraisingPrice(uint256 _price) public onlyAdmin {
    require(state == State.Waiting, "Pool is not in Waiting state");

    details.maxFundraisingPrice = _price;
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
   * @param _multipliedPrice 새로운 Token 가격
   * ex) $1 인 경우, 실제값은 1 x PRICE_MULTIPLIER
   */
  function updateTokenMultipliedPrice(
    uint256 _multipliedPrice
  ) external onlyAdmin {
    currentTokenMultipliedPrice = _multipliedPrice;
    emit TokenMultipliedPriceUpdated(_multipliedPrice);
  }

  /**
   * @notice 보상 스케줄을 추가한다.
   * @param _tokenMultipliedPriceAtPayout 보상 시 적용될 토큰 가격
   * ex) $1 인 경우, 실제값은 1 x PRICE_MULTIPLIER
   * @param _start 보상 시작 시점(Unix time)
   * @param _end 보상 종료 시점(Unix time)
   */
  function addRewardSchedule(
    uint256 _tokenMultipliedPriceAtPayout,
    uint256 _start,
    uint256 _end
  ) external onlyAdmin {
    require(_start < _end, "Start date must be before end date");
    require(
      state == State.Operating ||
        state == State.OperatingClosed ||
        state == State.OperatingStopped,
      "Pool is not in Operating, OperatingClosed, or OperatingStopped state"
    );

    rewardSchedules.push(
      RewardSchedule({
        tokenMultipliedPriceAtPayout: _tokenMultipliedPriceAtPayout,
        start: _start,
        end: _end
      })
    );

    emit RewardScheduleAdded(_tokenMultipliedPriceAtPayout, _start, _end);
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
      "Pool must be in Waiting state to be Fundraising"
    );

    state = State.Fundraising;
    emit FundraisingStarted();
  }

  /**
   * @notice 모금 잠김
   */
  function lockFundraising() public onlyAdmin {
    require(
      state == State.Fundraising,
      "Pool must be in Fundraising state to be FundraisingLocked"
    );

    state = State.FundraisingLocked;
    emit FundraisingLocked();
  }

  /**
   * @notice 모금 중지
   */
  function stopFundraising() public onlyAdmin {
    require(
      state == State.Fundraising,
      "Pool must be in Fundraising state to be FundraisingStopped"
    );

    state = State.FundraisingStopped;
    emit FundraisingStopped();
  }

  /**
   * @notice 모금 실패
   */
  function failFundraising() public onlyAdmin {
    require(
      state == State.Fundraising,
      "Pool must be in Fundraising state to be FundraisingFailed"
    );

    state = State.FundraisingFailed;
    emit FundraisingFailed();
  }

  /**
   * @notice 운영 시작
   */
  function startOperating() public onlyAdmin {
    require(
      state == State.Fundraising || state == State.FundraisingLocked,
      "Pool must be in Fundraising or FundraisingLocked state to be Operating"
    );

    state = State.Operating;
    emit OperatingStarted();
  }

  /**
   * @notice 운영 종료
   */
  function closeOperating() public onlyAdmin {
    require(
      state == State.Operating,
      "Pool must be in Operating state to be OperatingClosed"
    );

    state = State.OperatingClosed;
    emit OperatingClosed();
  }

  /**
   * @notice 운영 중지
   */
  function stopOperating() public onlyAdmin {
    require(
      state == State.Operating,
      "Pool must be in Operating state to be OperatingStopped"
    );

    state = State.OperatingStopped;
    emit OperatingStopped();
  }

  ////////////////
  /// 사용자 요청 ///
  ////////////////

  /**
   * @notice 스테이킹 (모금/운영 인 경우)
   * 사전에 user 가 _amount 만큼의 approve 를 해당 Pool 에 해야한다.
   * @param _amount 스테이킹 수량
   */
  function stakeToken(uint256 _amount) external {
    require(
      state == State.Fundraising || state == State.Operating,
      "Invalid state for staking"
    );

    /// 최소 스테이킹 금액 이상인지 확인
    uint256 minStakeAmount = (details.minStakePrice *
      tokenDecimals *
      PRICE_MULTIPLIER) / currentTokenMultipliedPrice;

    require(
      _amount >= minStakeAmount,
      "Amount is less than the minimum stakeToken amount"
    );

    /// 최대 모금액을 초과하지 않는지 확인
    uint256 stakingMultipliedPrice = (_amount * currentTokenMultipliedPrice) /
      tokenDecimals;
    uint256 newTotalFundraisingMultipliedPrice = totalFundraisingMultipliedPrice +
        stakingMultipliedPrice;
    require(
      newTotalFundraisingMultipliedPrice <=
        details.maxFundraisingPrice * PRICE_MULTIPLIER,
      "Amount exceeds the maximum fundraising amount"
    );

    /// 최대 모금액에 도달한 경우 풀 상태를 "FundraisingLocked"으로 변경
    if (
      newTotalFundraisingMultipliedPrice ==
      details.maxFundraisingPrice * PRICE_MULTIPLIER
    ) {
      state = State.FundraisingLocked;
      emit FundraisingLocked();
    }

    totalFundraisingMultipliedPrice = newTotalFundraisingMultipliedPrice;

    uint256 dailyInterestMultipliedPriceAndRate = ((_amount *
      currentTokenMultipliedPrice) * details.annualInterestMultipliedRate) /
      365 /* 1 year */ /
      tokenDecimals;

    userStakes[msg.sender].push(
      StakeRecord({
        amountStaked: _amount,
        stakeTime: block.timestamp,
        claimedReward: 0,
        pendingRewardScheduleIndex: 0,
        tokenMultipliedPrice: currentTokenMultipliedPrice,
        dailyInterestMultipliedPriceAndRate: dailyInterestMultipliedPriceAndRate
      })
    );

    IERC20(details.stakingToken).transferFrom(
      msg.sender,
      address(this),
      _amount
    );

    emit Staked(msg.sender, _amount);
  }

  /**
   * @notice 언스테이킹 (모금 인 경우)
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

      uint256 dailyInterestMultipliedPriceAndRate = ((record.amountStaked *
        record.tokenMultipliedPrice) * details.annualInterestMultipliedRate) /
        365 /* 1 year */ /
        tokenDecimals;

      record
        .dailyInterestMultipliedPriceAndRate = dailyInterestMultipliedPriceAndRate;
    }

    totalFundraisingMultipliedPrice -=
      (_amount * record.tokenMultipliedPrice) /
      tokenDecimals;

    IERC20(details.stakingToken).transfer(msg.sender, _amount);

    emit Unstaked(msg.sender, _amount);
  }

  /**
   * @notice 특정 staking 의 보상 요청 (운영/운영종료/운영중지 인 경우)
   * @param _stakeIndex 스테이킹 인덱스
   */
  function claimReward(uint256 _stakeIndex) public {
    require(
      state == State.Operating ||
        state == State.OperatingClosed ||
        state == State.OperatingStopped,
      "Invalid state for claiming reward"
    );

    require(
      _stakeIndex < userStakes[msg.sender].length,
      "Invalid stakeToken index"
    );

    (uint256 reward, uint256 nextIndex) = calculatePendingRewardForStake(
      msg.sender,
      _stakeIndex
    );
    require(reward > 0, "No reward available");

    StakeRecord storage userStake = userStakes[msg.sender][_stakeIndex];
    userStake.claimedReward += reward;
    userStake.pendingRewardScheduleIndex = nextIndex;

    IERC20(details.stakingToken).transfer(msg.sender, reward);

    emit RewardClaimed(msg.sender, reward);
  }

  /**
   * @notice 사용자의 전체 보상 요청
   */
  function claimAllReward() public {
    require(
      state == State.Operating ||
        state == State.OperatingClosed ||
        state == State.OperatingStopped,
      "Invalid state for claiming all reward"
    );

    StakeRecord[] storage records = userStakes[msg.sender];

    for (uint256 i = 0; i < records.length; i++) {
      claimReward(i);
    }
  }

  /**
   * @notice 원금 회수 (모금중지/모금실패/운영중지/운영종료 인 경우)
   */
  function withdrawAllPrincipal() public {
    require(
      state == State.FundraisingStopped ||
        state == State.FundraisingFailed ||
        state == State.OperatingStopped ||
        state == State.OperatingClosed,
      "Invalid state for withdrawing principal"
    );

    StakeRecord[] storage records = userStakes[msg.sender];
    uint256 totalAmount = 0;

    /// 모든 보상이 청구되었는지 확인
    for (uint256 i = 0; i < records.length; i++) {
      (uint256 reward, ) = calculatePendingRewardForStake(msg.sender, i);
      require(
        reward == 0,
        "Please claim all reward before withdrawing principal"
      );
    }

    // 모든 원금 계산
    for (uint256 i = 0; i < records.length; i++) {
      uint256 amount = (records[i].amountStaked *
        records[i].tokenMultipliedPrice) / currentTokenMultipliedPrice;

      totalAmount += amount;
      records[i].amountStaked = 0;
    }

    IERC20(details.stakingToken).transfer(msg.sender, totalAmount);

    emit PrincipalWithdrawn(msg.sender, totalAmount);
  }

  ////////////////
  /// 사용자 조회 ///
  ////////////////

  /**
   * @notice Pool 의 세부사항을 조회하는 함수
   * @return Pool 의 세부사항을 담은 Details 구조체
   */
  function getPoolDetails() external view returns (Details memory) {
    return details;
  }

  /**
   * @notice 특정 스테이킹에 대해 받을 보상을 조회
   * @param _user 사용자 주소
   * @param _stakeIndex 스테이킹 인덱스
   * @return 받을 보상 금액과 다음번 계산될 보상 스케줄 인덱스
   */
  function calculatePendingRewardForStake(
    address _user,
    uint256 _stakeIndex
  ) public view returns (uint256, uint256) {
    require(_stakeIndex < userStakes[_user].length, "Invalid stake index");

    StakeRecord storage userStake = userStakes[_user][_stakeIndex];
    uint256 reward = 0;
    uint256 nextIndex = userStake.pendingRewardScheduleIndex;

    for (
      uint256 i = userStake.pendingRewardScheduleIndex;
      i < rewardSchedules.length;
      i++
    ) {
      RewardSchedule memory schedule = rewardSchedules[i];

      // 현재 시간이 보상 종료 시간을 넘지 않았으면 보상 계산에서 제외
      if (block.timestamp < schedule.end) {
        break;
      }

      // 보상 계산을 위한 시작 시점: 스테이킹 시점과 스케줄의 시작 시점 중 더 늦은 시점
      uint256 effectiveStart = userStake.stakeTime > schedule.start
        ? userStake.stakeTime
        : schedule.start;

      // 스케줄의 시작 시점이 스케줄의 종료 시점보다 이전인 경우에만 보상을 계산
      uint256 stakingDays = (schedule.end - effectiveStart) / 1 days;

      reward +=
        (userStake.dailyInterestMultipliedPriceAndRate *
          stakingDays *
          tokenDecimals) /
        schedule.tokenMultipliedPriceAtPayout /
        RATE_MULTIPLIER;

      // 현재 시간이 보상 종료 시간을 넘었을 때 다음 보상 스케줄로 넘어갑니다.
      nextIndex += 1;
    }

    return (reward, nextIndex);
  }

  /**
   * @notice 전체 스테이킹에 대해 받을 보상을 조회
   * @param _user 사용자 주소
   * @return 사용자가 받을 전체 보상 금액
   */
  function calculatePendingRewardForAllStakes(
    address _user
  ) public view returns (uint256) {
    require(state == State.Operating, "Invalid state for viewing reward");

    // 보상 조회 로직
    uint256 totalReward = 0;
    StakeRecord[] storage records = userStakes[_user];

    for (uint256 i = 0; i < records.length; i++) {
      (uint256 reward, ) = calculatePendingRewardForStake(_user, i);
      totalReward += reward;
    }

    return totalReward;
  }

  /**
   * @notice 사용자의 전체 받은 보상 조회
   * @param _user 사용자 주소
   * @return 사용자가 받은 전체 보상 금액
   */
  function calculateClaimedRewardForAllStakes(
    address _user
  ) public view returns (uint256) {
    require(state == State.Operating, "Invalid state for viewing reward");

    /// 누적 보상 조회 로직
    uint256 totalReward = 0;
    StakeRecord[] storage records = userStakes[_user];

    for (uint256 i = 0; i < records.length; i++) {
      totalReward += records[i].claimedReward;
    }

    return totalReward;
  }

  /**
   * @notice 특정 사용자의 전체 스테이킹 수량을 조회하는 함수
   * @param user 사용자의 주소
   * @return 특정 사용자가 스테이킹한 전체 수량
   */
  function getTotalStakedAmount(address user) external view returns (uint256) {
    uint256 totalStaked = 0;

    for (uint256 i = 0; i < userStakes[user].length; i++) {
      totalStaked += userStakes[user][i].amountStaked;
    }

    return totalStaked;
  }

  /**
   * @notice 사용자의 스테이킹 개수를 얻어온다.
   * @param _user 사용자 주소
   * @return 사용자의 스테이킹 개수
   */
  function getStakeCount(address _user) external view returns (uint256) {
    return userStakes[_user].length;
  }

  /**
   * @notice 사용자의 특정 스테이킹 정보를 조회하는 함수
   * @param _user 사용자 주소
   * @param _stakeIndex 스테이킹 인덱스
   * @return 스테이킹 정보를 담은 StakeRecord 구조체
   */
  function getStake(
    address _user,
    uint256 _stakeIndex
  ) external view returns (StakeRecord memory) {
    require(_stakeIndex < userStakes[_user].length, "Invalid stake index");

    return userStakes[_user][_stakeIndex];
  }

  /**
   * @notice 보상 스케줄의 개수를 얻어온다.
   * @return 보상 스케줄의 개수
   */
  function getRewardScheduleCount() external view returns (uint256) {
    return rewardSchedules.length;
  }
}
