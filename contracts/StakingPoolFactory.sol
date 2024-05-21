// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.24;

import "./StakingPool.sol"; // StakingPool 컨트랙트를 가져옵니다.

contract StakingPoolFactory {
  // 관리자 주소
  address public admin;

  // 생성된 모든 풀들을 저장하는 배열
  StakingPool[] public pools;

  // 이벤트 정의
  event PoolCreated(address indexed poolAddress, address indexed creator);

  constructor() {
    admin = msg.sender;
  }

  modifier onlyAdmin() {
    require(msg.sender == admin, "Not an admin");
    _;
  }

  // 새로운 StakingPool을 생성하는 함수
  function createPool() public onlyAdmin returns (address) {
    // 새로운 StakingPool 인스턴스 생성
    StakingPool newPool = new StakingPool(msg.sender);

    // pools 배열에 새로 생성된 풀 추가
    pools.push(newPool);

    emit PoolCreated(address(newPool), msg.sender);

    return address(newPool);
  }

  // 생성된 모든 풀의 주소를 반환하는 함수

  function getAllPools() public view returns (StakingPool[] memory) {
    return pools;
  }

  // 특정 인덱스의 풀 정보를 반환하는 함수

  function getPoolDetails(
    uint256 _index
  ) public view returns (StakingPool.Details memory) {
    require(_index < pools.length, "Index out of bounds");

    return pools[_index].getPoolDetails();
  }

  function getPoolsLength() public view returns (uint256) {
    return pools.length;
  }
}
