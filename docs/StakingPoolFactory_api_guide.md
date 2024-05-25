# StakingPoolFactory API 가이드

## 개요

이 가이드는 StakingPoolFactory 스마트 계약에 대해 설명합니다. 이 계약은 새로운 스테이킹풀을 생성하고 관리하는 기능을 제공합니다. 관리자는 새로운 풀을 생성할 수 있으며, 모든 생성된 풀을 조회할 수 있습니다.

## 함수 시그니처

### 관리자 함수

#### changeAdmin(address newAdmin)

- **설명:** 팩토리 계약의 관리자 주소를 업데이트합니다. 오직 현 관리자만 호출할 수 있습니다.
- **매개변수:**
  - `newAdmin (address)`: 새로운 관리자 주소.
- **이벤트 트리거:**
  - `AdminChanged(address indexed previousAdmin, address indexed newAdmin)`

### 생성 함수

#### createPool()

- **설명:** 새로운 스테이킹풀을 생성합니다. 오직 관리자만 호출할 수 있습니다.
- **매개변수:** 없음.
- **이벤트 트리거:**
  - `PoolCreated(address indexed poolAddress, address indexed creator)`

### 조회 함수

#### getAllPools()

- **설명:** 생성된 모든 풀의 주소를 반환합니다.
- **매개변수:** 없음.
- **리턴값:**
  - `StakingPool[] memory`: 생성된 모든 풀의 주소가 포함된 배열.

#### getPoolDetails(uint256 \_index)

- **설명:** 특정 인덱스의 풀 정보를 반환합니다.
- **매개변수:**
  - `_index (uint256)`: 풀의 인덱스.
- **리턴값:**
  - `StakingPool.Details memory`: 특정 인덱스의 풀 정보.

#### getPoolsLength()

- **설명:** 생성된 풀의 개수를 반환합니다.
- **매개변수:** 없음.
- **리턴값:**
  - `uint256`: 생성된 풀의 개수.

### 이벤트

- **PoolCreated**
- **설명:** 새로운 스테이킹풀이 생성되었을 때 발생합니다.
- **매개변수:**

  - `poolAddress (address)`: 생성된 풀의 주소.
  - `creator (address)`: 풀을 생성한 관리자 주소.

- **AdminChanged**
- **설명:** 관리자 주소가 변경되었을 때 발생합니다.
- **매개변수:**
  - `previousAdmin (address)`: 이전 관리자 주소.
  - `newAdmin (address)`: 새로운 관리자 주소.
