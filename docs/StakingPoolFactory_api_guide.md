# StakingPoolFactory

## 개요

이 문서는 Solidity로 작성된 `StakingPoolFactory` 스마트 컨트랙트의 주석을 기반으로 작성된 문서입니다. 이 스마트 컨트랙트는 다른 `StakingPool` 컨트랙트를 생성하고 관리하는 팩토리 컨트랙트입니다.

## 주요 변수

- `admin`: 팩토리 컨트랙트의 관리자 주소
- `pools`: 생성된 모든 풀들을 저장하는 배열

## 이벤트

- `PoolCreated`: 새로운 풀 생성 시 발생하는 이벤트 (풀 주소, 생성자 주소)

## 함수

### 관리자 전용 함수 제한자 (modifier)

```solidity
modifier onlyAdmin()
```

관리자 전용 함수에 대한 접근 제한을 설정합니다. `msg.sender`가 관리자 주소와 같은지 확인합니다.

### 기본 생성자

```solidity
constructor()
```

팩토리 컨트랙트의 초기 생성자 함수입니다. 컨트랙트를 배포하는 주소를 `admin` 변수에 저장합니다.

### 관리자 변경 함수

```solidity
function changeAdmin(address newAdmin) public onlyAdmin
```

팩토리 컨트랙트의 관리자를 변경합니다.

- `newAdmin`: 새 관리자 주소
- 제한조건: 새로운 관리자의 주소는 0번 주소가 될 수 없습니다.

### 풀 생성 함수

```solidity
function createPool() public onlyAdmin returns (address)
```

새로운 `StakingPool` 컨트랙트를 생성합니다.

- 반환값: 새로 생성된 `StakingPool` 컨트랙트 주소

### 생성된 모든 풀 조회 함수

```solidity
function getAllPools() public view returns (StakingPool[] memory)
```

생성된 모든 풀의 주소를 반환합니다.

- 반환값: `StakingPool` 주소가 포함된 배열

### 특정 인덱스의 풀 정보 조회 함수

```solidity
function getPoolDetails(uint256 _index) public view returns (StakingPool.Details memory)
```

특정 인덱스의 풀 정보를 반환합니다.

- `_index`: 정보를 조회할 풀의 인덱스
- 반환값: 특정 인덱스의 풀 정보 (`StakingPool.Details` 구조체)

### 생성된 풀의 개수 조회 함수

```solidity
function getPoolsLength() public view returns (uint256)
```

생성된 풀의 개수를 반환합니다.

- 반환값: 생성된 풀의 개수
