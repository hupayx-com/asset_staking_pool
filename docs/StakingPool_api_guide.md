# 스테이킹풀 API 가이드

## 개요

이 가이드는 스테이킹풀 스마트 계약을 사용하는 방법에 대한 정보를 제공합니다. 스테이킹풀을 통해 사용자는 토큰을 스테이킹하고, 보상을 청구하며, 풀의 설정 및 상태를 관리할 수 있습니다.

## 함수 시그니처

### 관리자 함수

#### changeAdmin(address newAdmin)

- **설명:** 관리자 주소를 업데이트합니다.
- **매개변수:**
- `newAdmin (address)`: 새로운 관리자 주소.
- **시그니처:** `changeAdmin(address newAdmin)`

#### setPoolName(string memory \_name)

- **설명:** 풀 이름을 설정합니다.
- **매개변수:**
- `_name (string)`: 풀 이름.
- **시그니처:** `setPoolName(string memory _name)`

#### setPoolDescription(string memory \_description)

- **설명:** 풀 설명을 설정합니다.
- **매개변수:**
- `_description (string)`: 풀 설명.
- **시그니처:** `setPoolDescription(string memory _description)`

#### setMinStakePrice(uint256 \_price)

- **설명:** 최소 스테이킹 금액을 설정합니다.
- **매개변수:**
- `_price (uint256)`: 최소 스테이킹 금액.
- **시그니처:** `setMinStakePrice(uint256 _price)`

#### setAnnualInterestRateMultiplier(uint256 \_multipliedInterestRate)

- **설명:** 연 이자율을 설정합니다.
- **매개변수:**
- `_multipliedInterestRate (uint256)`: 연 이자율.
- **시그니처:** `setAnnualInterestRateMultiplier(uint256 _multipliedInterestRate)`

#### setMinFundraisingPrice(uint256 \_price)

- **설명:** 최소 모금 금액을 설정합니다.
- **매개변수:**
- `_price (uint256)`: 최소 모금 금액.
- **시그니처:** `setMinFundraisingPrice(uint256 _price)`

#### setMaxFundraisingPrice(uint256 \_price)

- **설명:** 최대 모금 금액을 설정합니다.
- **매개변수:**
- `_price (uint256)`: 최대 모금 금액.
- **시그니처:** `setMaxFundraisingPrice(uint256 _price)`

#### setStakingToken(address \_tokenAddress)

- **설명:** 스테이킹 토큰 주소를 설정합니다.
- **매개변수:**
- `_tokenAddress (address)`: 토큰 주소.
- **시그니처:** `setStakingToken(address _tokenAddress)`

#### updateMultipliedTokenPrice(uint256 \_price)

- **설명:** 실시간 토큰 가격을 업데이트합니다.
- **매개변수:**
- `_price (uint256)`: 새로운 토큰 가격.
- **시그니처:** `updateMultipliedTokenPrice(uint256 _price)`

#### addRewardSchedule(uint256 \_multipliedTokenPriceAtPayout, uint256 \_start, uint256 \_end)

- **설명:** 보상 스케줄을 추가합니다.
- **매개변수:**
- `_multipliedTokenPriceAtPayout (uint256)`: 보상 시 적용될 토큰 가격.
- `_start (uint256)`: 보상 시작 시점(Unix time).
- `_end (uint256)`: 보상 종료 시점(Unix time).
- **시그니처:** `addRewardSchedule(uint256 _multipliedTokenPriceAtPayout, uint256 _start, uint256 _end)`

### 상태 변경 함수

#### startFundraising()

- **설명:** 모금을 시작합니다.
- **매개변수:** 없음.
- **시그니처:** `startFundraising()`

#### startOperating()

- **설명:** 운영을 시작합니다.
- **매개변수:** 없음.
- **시그니처:** `startOperating()`

#### closePool()

- **설명:** 풀을 종료합니다.
- **매개변수:** 없음.
- **시그니처:** `closePool()`

#### lockPool()

- **설명:** 풀을 잠급니다.
- **매개변수:** 없음.
- **시그니처:** `lockPool()`

#### stopPoolFundraising()

- **설명:** 모금을 중지합니다.
- **매개변수:** 없음.
- **시그니처:** `stopPoolFundraising()`

#### stopPoolOperating()

- **설명:** 운영을 중지합니다.
- **매개변수:** 없음.
- **시그니처:** `stopPoolOperating()`

#### failPool()

- **설명:** 풀을 실패로 표시합니다.
- **매개변수:** 없음.
- **시그니처:** `failPool()`

### 사용자 함수

#### stakeToken(uint256 \_amount)

- **설명:** 토큰을 스테이킹합니다.
- **매개변수:**
- `_amount (uint256)`: 스테이킹 할 금액.
- **시그니처:** `stakeToken(uint256 _amount)`

#### unStakeToken(uint256 \_stakeIndex, uint256 \_amount)

- **설명:** 토큰을 언스테이킹합니다.
- **매개변수:**
- `_stakeIndex (uint256)`: 스테이킹 인덱스.
- `_amount (uint256)`: 언스테이킹 할 금액.
- **시그니처:** `unStakeToken(uint256 _stakeIndex, uint256 _amount)`

#### claimRewardToken(uint256 \_stakeIndex)

- **설명:** 스테이킹 별 보상을 청구합니다.
- **매개변수:**
- `_stakeIndex (uint256)`: 스테이킹 인덱스.
- **시그니처:** `claimRewardToken(uint256 _stakeIndex)`

#### withdrawAllPrincipal()

- **설명:** 원금을 회수합니다.
- **매개변수:** 없음.
- **시그니처:** `withdrawAllPrincipal()`

#### claimAllRewardToken()

- **설명:** 사용자의 전체 보상을 요청합니다.
- **매개변수:** 없음.
- **시그니처:** `claimAllRewardToken()`

### 조회 함수

#### getPoolDetails()

- **설명:** 풀의 세부사항을 조회합니다.
- **매개변수:** 없음.
- **시그니처:** `getPoolDetails()`

#### calculatePendingRewardToken(address \_user, uint256 \_stakeIndex)

- **설명:** 사용자가 받을 보상 금액과 다음 인덱스를 조회합니다.
- **매개변수:**
- `_user (address)`: 사용자 주소.
- `_stakeIndex (uint256)`: 스테이킹 인덱스.
- **시그니처:** `calculatePendingRewardToken(address _user, uint256 _stakeIndex)`

#### calculateAllPendingRewardToken(address \_staker)

- **설명:** 사용자가 받을 전체 보상 금액을 조회합니다.
- **매개변수:**
- `_staker (address)`: 사용자 주소.
- **시그니처:** `calculateAllPendingRewardToken(address _staker)`

#### calculateAllClaimedRewardToken(address \_staker)

- **설명:** 사용자가 청구한 전체 보상 금액을 조회합니다.
- **매개변수:**
- `_staker (address)`: 사용자 주소.
- **시그니처:** `calculateAllClaimedRewardToken(address _staker)`

#### getUserStakeCount(address \_user)

- **설명:** 사용자의 스테이킹 개수를 조회합니다.
- **매개변수:**
- `_user (address)`: 사용자 주소.
- **시그니처:** `getUserStakeCount(address _user)`
