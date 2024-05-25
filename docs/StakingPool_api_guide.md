# StakingPool API 가이드

## 개요

이 가이드는 StakingPool 스마트 계약을 사용하는 방법에 대한 정보를 제공합니다. StakingPool을 통해 사용자는 토큰을 스테이킹하고, 보상을 청구하며, 풀의 설정 및 상태를 관리할 수 있습니다.

## 함수 시그니처

### 관리자 함수

#### changeAdmin(address newAdmin)

- **설명:** 관리자 주소를 업데이트합니다. 오직 현 관리자만 호출할 수 있습니다.
- **매개변수:**
  - `newAdmin (address)`: 새로운 관리자 주소.
- **이벤트 트리거:**
  - `AdminChanged(address indexed previousAdmin, address indexed newAdmin)`

#### transferStakingToken(address \_recipient, uint256 \_amount)

- **설명:** 스테이킹된 토큰을 관리자 권한으로 전송합니다. 오직 현 관리자만 호출할 수 있습니다.
- **매개변수:**
  - `_recipient (address)`: 받는 주소.
  - `_amount (uint256)`: 전송할 토큰의 양.

#### setTokenDecimals(uint256 \_decimals)

- **설명:** 토큰 소수점 자릿수를 설정합니다. 풀의 상태가 `Waiting`일 때만 호출할 수 있습니다.
- **매개변수:**
  - `_decimals (uint256)`: 소수점 자릿수.

#### setPoolName(string memory \_name)

- **설명:** 풀 이름을 설정합니다. 풀의 상태가 `Waiting`일 때만 호출할 수 있습니다.
- **매개변수:**
  - `_name (string)`: 풀 이름.

#### setPoolDescription(string memory \_description)

- **설명:** 풀 설명을 설정합니다. 풀의 상태가 `Waiting`일 때만 호출할 수 있습니다.
- **매개변수:**
  - `_description (string)`: 풀 설명.

#### setMinStakePrice(uint256 \_price)

- **설명:** 최소 스테이킹 금액을 설정합니다. 풀의 상태가 `Waiting`일 때만 호출할 수 있습니다.
- **매개변수:**
  - `_price (uint256)`: 최소 스테이킹 금액.

#### setAnnualInterestRateMultiplier(uint256 \_interestMultipliedRate)

- **설명:** 연이율을 설정합니다. 풀의 상태가 `Waiting`일 때만 호출할 수 있습니다.
- **매개변수:**
  - `_interestMultipliedRate (uint256)`: 연이율.

#### setMinFundraisingPrice(uint256 \_price)

- **설명:** 최소 모금 금액을 설정합니다. 풀의 상태가 `Waiting`일 때만 호출할 수 있습니다.
- **매개변수:**
  - `_price (uint256)`: 최소 모금 금액.

#### setMaxFundraisingPrice(uint256 \_price)

- **설명:** 최대 모금 금액을 설정합니다. 풀의 상태가 `Waiting`일 때만 호출할 수 있습니다.
- **매개변수:**
  - `_price (uint256)`: 최대 모금 금액.

#### setStakingToken(address \_tokenAddress)

- **설명:** 스테이킹 토큰 주소를 설정합니다. 풀의 상태가 `Waiting`일 때만 호출할 수 있습니다.
- **매개변수:**
  - `_tokenAddress (address)`: 토큰 주소.

#### updateTokenMultipliedPrice(uint256 \_multipliedPrice)

- **설명:** 실시간 토큰 가격을 업데이트합니다. 오직 현 관리자만 호출할 수 있습니다.
- **매개변수:**
  - `_multipliedPrice (uint256)`: 새로운 토큰 가격.
- **이벤트 트리거:**
  - `TokenMultipliedPriceUpdated(uint256 newPrice)`

#### addRewardSchedule(uint256 \_tokenMultipliedPriceAtPayout, uint256 \_start, uint256 \_end)

- **설명:** 보상 스케줄을 추가합니다. 풀의 상태가 `Operating`, `OperatingClosed`, `OperatingStopped` 중 하나일 때만 호출할 수 있습니다.
- **매개변수:**
  - `_tokenMultipliedPriceAtPayout (uint256)`: 보상 시 적용될 토큰 가격.
  - `_start (uint256)`: 보상 시작 시점(Unix time).
  - `_end (uint256)`: 보상 종료 시점(Unix time).
- **이벤트 트리거:**
  - `RewardScheduleAdded(uint256 tokenMultipliedPriceAtPayout, uint256 start, uint256 end)`

### 상태 변경 함수

#### startFundraising()

- **설명:** 모금을 시작합니다. 풀의 상태가 `Waiting`일 때만 호출할 수 있습니다.
- **매개변수:** 없음.
- **이벤트 트리거:**
  - `FundraisingStarted()`

#### lockFundraising()

- **설명:** 모금을 잠급니다. 풀의 상태가 `Fundraising`일 때만 호출할 수 있습니다.
- **매개변수:** 없음.
- **이벤트 트리거:**
  - `FundraisingLocked()`

#### stopFundraising()

- **설명:** 모금을 중지합니다. 풀의 상태가 `Fundraising`일 때만 호출할 수 있습니다.
- **매개변수:** 없음.
- **이벤트 트리거:**
  - `FundraisingStopped()`

#### failFundraising()

- **설명:** 풀을 모금 실패로 설정합니다. 풀의 상태가 `Fundraising`일 때만 호출할 수 있습니다.
- **매개변수:** 없음.
- **이벤트 트리거:**
  - `FundraisingFailed()`

#### startOperating()

- **설명:** 풀의 운영을 시작합니다. 풀의 상태가 `Fundraising` 혹은 `FundraisingLocked`일 때만 호출할 수 있습니다.
- **매개변수:** 없음.
- **이벤트 트리거:**
  - `OperatingStarted()`

#### closeOperating()

- **설명:** 풀 운영을 종료합니다. 풀의 상태가 `Operating`일 때만 호출할 수 있습니다.
- **매개변수:** 없음.
- **이벤트 트리거:**
  - `OperatingClosed()`

#### stopOperating()

- **설명:** 풀 운영을 중지합니다. 풀의 상태가 `Operating`일 때만 호출할 수 있습니다.
- **매개변수:** 없음.
- **이벤트 트리거:**
  - `OperatingStopped()`

### 사용자 함수

#### stakeToken(uint256 \_amount)

- **설명:** 토큰을 스테이킹합니다. 풀의 상태가 `Fundraising` 또는 `Operating`일 때만 호출할 수 있습니다.
- **매개변수:**
  - `_amount (uint256)`: 스테이킹할 금액.
- **이벤트 트리거:**
  - `Staked(address indexed user, uint256 amount)`

#### unStakeToken(uint256 \_stakeIndex, uint256 \_amount)

- **설명:** 토큰을 언스테이킹합니다. 풀의 상태가 `Fundraising`일 때만 호출할 수 있습니다.
- **매개변수:**
  - `_stakeIndex (uint256)`: 스테이킹 인덱스.
  - `_amount (uint256)`: 언스테이킹할 금액.
- **이벤트 트리거:**
  - `Unstaked(address indexed user, uint256 amount)`

#### claimReward(uint256 \_stakeIndex)

- **설명:** 스테이킹별 보상을 청구합니다. 풀의 상태가 `Operating`, `OperatingClosed`, 또는 `OperatingStopped`일 때만 호출할 수 있습니다.
- **매개변수:**
  - `_stakeIndex (uint256)`: 스테이킹 인덱스.
- **이벤트 트리거:**
  - `RewardClaimed(address indexed user, uint256 reward)`

#### claimAllReward()

- **설명:** 사용자의 전체 보상을 요청합니다. 풀의 상태가 `Operating`일 때만 호출할 수 있습니다.
- **매개변수:** 없음.
- **이벤트 트리거:**
  - 개별 보상 청구를 위한 `RewardClaimed(address indexed user, uint256 reward)` 이벤트가 발생합니다.

#### withdrawAllPrincipal()

- **설명:** 원금을 회수합니다. 풀의 상태가 `FundraisingStopped`, `FundraisingFailed`, `OperatingStopped`, 또는 `OperatingClosed`일 때만 호출할 수 있습니다.
- **매개변수:** 없음.
- **이벤트 트리거:**
  - `PrincipalWithdrawn(address indexed user, uint256 totalAmount)`

### 조회 함수

#### getPoolDetails()

- **설명:** 풀의 세부사항을 조회합니다.
- **매개변수:** 없음.
- **리턴값:**
  - `Details memory`: 풀의 세부사항을 담은 구조체.

#### calculatePendingRewardForStake(address \_user, uint256 \_stakeIndex)

- **설명:** 사용자가 받을 보상 금액과 다음 인덱스를 조회합니다.
- **매개변수:**
  - `_user (address)`: 사용자 주소.
  - `_stakeIndex (uint256)`: 스테이킹 인덱스.
- **리턴값:**
  - `uint256`: 보상 금액.
  - `uint256`: 다음 인덱스.

#### calculatePendingRewardForAllStakes(address \_user)

- **설명:** 사용자가 받을 전체 보상 금액을 조회합니다. 풀의 상태가 `Operating`, `OperatingClosed`, 또는 `OperatingStopped`일 때만 호출할 수 있습니다.
- **매개변수:** 없음.
- **리턴값:**
  - `uint256`: 사용자가 받을 전체 보상 금액.

#### calculateClaimedRewardForAllStakes(address \_user)

- **설명:** 사용자가 청구한 전체 보상 금액을 조회합니다.
- **매개변수:**
  - `_user (address)`: 사용자 주소.
- **리턴값:**
  - `uint256`: 사용자가 청구한 보상 금액.

#### getTotalStakedAmount(address user)

- **설명:** 특정 사용자의 전체 스테이킹 금액을 조회합니다.
- **매개변수:**
  - `user (address)`: 사용자 주소.
- **리턴값:**
  - `uint256`: 전체 스테이킹 금액.

#### getStakeCount(address \_user)

- **설명:** 사용자의 스테이킹 개수를 조회합니다.
- **매개변수:**
  - `_user (address)`: 사용자 주소.
- **리턴값:**
  - `uint256`: 사용자의 스테이킹 개수.

#### getStake(address \_user, uint256 \_stakeIndex)

- **설명:** 사용자의 특정 스테이킹 정보를 조회합니다.
- **매개변수:**
  - `_user (address)`: 사용자 주소.
  - `_stakeIndex (uint256)`: 스테이킹 인덱스.
- **리턴값:**
  - `StakeRecord memory`: 스테이킹 정보를 담은 구조체.

### 이벤트

- **AdminChanged**
- **설명:** 관리자 주소가 변경되었을 때 발생합니다.
- **매개변수:**

  - `previousAdmin (address)`: 이전 관리자 주소.
  - `newAdmin (address)`: 새로운 관리자 주소.

- **TokenMultipliedPriceUpdated**
- **설명:** 토큰의 실시간 가격이 업데이트되었을 때 발생합니다.
- **매개변수:**

  - `newPrice (uint256)`: 업데이트된 새로운 토큰 가격.

- **RewardScheduleAdded**
- **설명:** 새로운 보상 스케줄이 추가되었을 때 발생합니다.
- **매개변수:**

  - `tokenMultipliedPriceAtPayout (uint256)`: 보상 시 적용될 토큰 가격.
  - `start (uint256)`: 보상 시작 시점(Unix time).
  - `end (uint256)`: 보상 종료 시점(Unix time).

- **Staked**
- **설명:** 사용자가 토큰을 스테이킹했을 때 발생합니다.
- **매개변수:**

  - `user (address)`: 토큰을 스테이킹한 사용자 주소.
  - `amount (uint256)`: 스테이킹한 금액.

- **Unstaked**
- **설명:** 사용자가 토큰을 언스테이킹했을 때 발생합니다.
- **매개변수:**

  - `user (address)`: 토큰을 언스테이킹한 사용자 주소.
  - `amount (uint256)`: 언스테이킹한 금액.

- **RewardClaimed**
- **설명:** 사용자가 보상을 청구했을 때 발생합니다.
- **매개변수:**

  - `user (address)`: 보상을 청구한 사용자 주소.
  - `reward (uint256)`: 청구한 보상 금액.

- **PrincipalWithdrawn**
- **설명:** 사용자가 원금을 회수했을 때 발생합니다.
- **매개변수:**

  - `user (address)`: 원금을 회수한 사용자 주소.
  - `totalAmount (uint256)`: 회수한 전체 원금 금액.

- **FundraisingStarted**
- **설명:** 모금이 시작되었을 때 발생합니다.

- **FundraisingLocked**
- **설명:** 모금이 잠금 상태로 변경되었을 때 발생합니다.

- **FundraisingStopped**
- **설명:** 모금이 중지되었을 때 발생합니다.

- **FundraisingFailed**
- **설명:** 풀 모금이 실패로 설정되었을 때 발생합니다.

- **OperatingStarted**
- **설명:** 풀이 운영을 시작했을 때 발생합니다.

- **OperatingClosed**
- **설명:** 풀이 종료되었을 때 발생합니다.

- **OperatingStopped**
- **설명:** 운영이 중지되었을 때 발생합니다.
