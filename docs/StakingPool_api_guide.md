# Staking Pool

## 개요

이 문서는 Solidity로 작성된 `StakingPool` 스마트 컨트랙트의 주석을 기반으로 작성된 문서입니다. 이 스마트 컨트랙트는 토큰 스테이킹 풀을 구현합니다.

## 용어 정의

- **소수점 계산을 위한 의사 수치:**
- `PRICE_MULTIPLIER`: 1,000,000 (ex. 2024년 4월 27일 SFL 가격: $0.002718)
- `ANNUAL_INTEREST_RATE_MULTIPLIER`: 100 (ex. 이자율: 0.05 %)
- **시간 단위**: 초

## 구현된 기능

### 주요 변수

- `admin`: 풀의 관리자 주소
- `tokenDecimals`: 기본값은 1e18 (wei)
- `currentMultipliedTokenPrice`: 실시간 Token 가격 반영을 위해 외부에서 주기적으로 업데이트 필요
- `totalFundraisingInMultipliedUSD`: 총 모금 금액

### 상태 (State) 열거형

- `State.Waiting`: 대기 (-> 모금)
- `State.Fundraising`: 모금 (-> 운영/모금 잠김/모금 중지/모금 실패)
- `State.Operating`: 운영 (-> 운영 종료/운영 중지)
- `State.Closed`: 운영 종료
- `State.Locked`: 모금 잠김 (-> 운영)
- `State.FundraisingStopped`: 모금 중지
- `State.OperatingStopped`: 운영 중지
- `State.Failed`: 모금 실패

### 구조체

#### `Details`

풀의 세부사항을 나타내는 구조체:

- `name`: 이름
- `description`: 설명
- `minStakeInUSD`: 최소 스테이킹 금액
- `multipliedAnnualInterestRate`: 연 이자율
- `minFundraisingInUSD`: 최소 모금 금액
- `maxFundraisingInUSD`: 최대 모금 금액
- `stakingToken`: 스테이킹 토큰 주소

#### `StakeRecord`

스테이킹 정보를 저장하는 구조체:

- `amountStaked`: 스테이킹 수량
- `stakeTime`: 스테이킹 시점(Unix time)
- `claimedRewards`: 받은 보상
- `pendingRewardScheduleIndex`: 보상 스케줄 목록에서 받을 보상들 중 첫 번째 인덱스
- `multipliedTokenPrice`: 스테이킹 시점의 토큰 가격
- `dailyInterestInUSD`: 일 이자

#### `RewardSchedule`

보상 스케줄을 정의하는 구조체:

- `multipliedTokenPriceAtPayout`: 보상 시 적용될 토큰 가격
- `start`: 보상 시작 시점(Unix time)
- `end`: 보상 종료 시점(Unix time)

### 이벤트

- `Staked`: 스테이킹 발생 시 이벤트 (사용자 주소, 금액)
- `Unstaked`: 언스테이킹 발생 시 이벤트 (사용자 주소, 금액)
- `RewardScheduleAdded`: 보상 스케줄 추가 이벤트 (보상 시 토큰 가격, 시작 시점, 종료 시점)
- `RewardClaimed`: 보상 청구 시 이벤트 (사용자 주소, 보상 금액)
- `MultipliedTokenPriceUpdated`: 토큰 가격 업데이트 시 이벤트 (새로운 가격)
- `PrincipalWithdrawn`: 원금 회수 시 이벤트 (사용자 주소, 총 금액)

## 관리자 전용 함수

### Pool 관련 설정 함수 by Admin

#### `changeAdmin`

관리자 변경 함수:

- `newAdmin`: 새 관리자 주소

#### `setPoolName`

Pool 이름 설정:

- `_name`: 풀 이름

#### `setPoolDescription`

Pool 설명 설정:

- `_description`: 풀 설명

#### `setMinStakePrice`

최소 스테이킹 금액 설정:

- `_price`: 최소 스테이킹 금액

#### `setAnnualInterestRateMultiplier`

연 이자율 설정:

- `_multipliedInterestRate`: 연 이자율

#### `setMinFundraisingPrice`

최소 모금 금액 설정:

- `_price`: 최소 모금 금액

#### `setMaxFundraisingPrice`

최대 모금 금액 설정:

- `_price`: 최대 모금 금액

#### `setStakingToken`

스테이킹 토큰 주소 설정:

- `_tokenAddress`: 토큰 주소

#### `updateMultipliedTokenPrice`

실시간 Token 가격을 외부에서 주기적으로 업데이트:

- `_price`: 새로운 토큰 가격

#### `addRewardSchedule`

보상 스케줄을 추가:

- `_multipliedTokenPriceAtPayout`: 보상 시 적용될 토큰 가격
- `_start`: 보상 시작 시점(Unix time)
- `_end`: 보상 종료 시점(Unix time)

### 상태 변경 함수 by Admin

#### `startFundraising`

모금 시작

#### `startOperating`

운영 시작

#### `closePool`

풀 종료

#### `lockPool`

풀 잠금

#### `stopPoolFundraising`

모금 중지

#### `stopPoolOperating`

운영 중지

#### `failPool`

풀 실패

## 사용자 요청 함수

#### `stakeToken`

스테이킹:

- `_amount`: 스테이킹 금액

#### `unStakeToken`

언스테이킹:

- `_stakeIndex`: 스테이킹 인덱스
- `_amount`: 언스테이킹 할 금액

#### `claimRewardToken`

스테이킹 별 보상 요청:

- `_stakeIndex`: 스테이킹 인덱스

#### `withdrawAllPrincipal`

원금 회수

#### `claimAllRewardToken`

사용자의 전체 보상 요청

## 사용자 조회 함수

### `getPoolDetails`

풀 세부사항 조회

### `calculatePendingRewardToken`

받을 보상 조회:

- `_user`: 사용자 주소
- `_stakeIndex`: 스테이킹 인덱스

### `calculateAllPendingRewardToken`

사용자의 전체 받을 보상 조회:

- `_staker`: 사용자 주소

### `calculateAllClaimedRewardToken`

사용자의 전체 받은 보상 조회:

- `_staker`: 사용자 주소

### `getUserStakeCount`

사용자의 스테이킹 개수 조회:

- `_user`: 사용자 주소
