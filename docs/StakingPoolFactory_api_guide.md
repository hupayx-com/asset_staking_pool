# StakingPoolFactory API 가이드

## 개요

이 가이드는 StakingPoolFactory 스마트 계약을 사용하는 방법에 대한 정보를 제공합니다. StakingPoolFactory를 통해 관리자는 새로운 스테이킹 풀을 생성하고, 모든 풀을 관리할 수 있습니다.

## 함수 시그니처

### 관리자 함수

#### changeAdmin(address newAdmin)

- **설명:** 관리자 주소를 업데이트합니다.
- **매개변수:**
- `newAdmin (address)`: 새로운 관리자 주소.
- **시그니처:** `changeAdmin(address newAdmin)`

#### createPool()

- **설명:** 새로운 StakingPool을 생성합니다.
- **매개변수:** 없음.
- **리턴값:**
- `address`: 새로 생성된 StakingPool 컨트랙트 주소.
- **시그니처:** `createPool()`

#### getAllPools()

- **설명:** 생성된 모든 풀의 주소를 반환합니다.
- **매개변수:** 없음.
- **리턴값:**
- `StakingPool[]`: 생성된 모든 풀의 주소가 포함된 배열.
- **시그니처:** `getAllPools()`

#### getPoolDetails(uint256 \_index)

- **설명:** 특정 인덱스의 풀 정보를 반환합니다.
- **매개변수:**
- `_index (uint256)`: 풀의 인덱스.
- **리턴값:**
- `StakingPool.Details`: 특정 인덱스의 풀 정보.
- **시그니처:** `getPoolDetails(uint256 _index)`

#### getPoolsLength()

- **설명:** 생성된 풀의 개수를 반환합니다.
- **매개변수:** 없음.
- **리턴값:**
- `uint256`: 생성된 풀의 개수.
- **시그니처:** `getPoolsLength()`
