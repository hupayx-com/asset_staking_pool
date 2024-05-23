// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.24;

import "./StakingPool.sol"; // StakingPool 컨트랙트를 가져옵니다.

/**
 * @title StakingPoolFactory
 * @dev StakingPool 컨트랙트를 생성하고 관리하는 팩토리 컨트랙트입니다.
 */
contract StakingPoolFactory {
  // 관리자 주소
  address public admin;

  // 생성된 모든 풀들을 저장하는 배열
  StakingPool[] public pools;

  /**
   * @dev 이벤트 정의
   */
  event PoolCreated(address indexed poolAddress, address indexed creator);

  /**
   * @dev StakingPool 팩토리 생성자
   */
  constructor() {
    admin = msg.sender;
  }

  /**
   * @dev 관리자 전용 함수 제한자
   */
  modifier onlyAdmin() {
    require(msg.sender == admin, "Not an admin");
    _;
  }

  /**
   * @notice 관리자 변경 함수
   * @param newAdmin 새 관리자 주소
   */
  function changeAdmin(address newAdmin) public onlyAdmin {
    require(newAdmin != address(0), "New admin address cannot be zero");

    admin = newAdmin;
  }

  /**
   * @notice 새로운 StakingPool을 생성하는 함수
   */
  function createPool() public onlyAdmin {
    // 새로운 StakingPool 인스턴스 생성
    StakingPool newPool = new StakingPool(msg.sender);

    // pools 배열에 새로 생성된 풀 추가
    pools.push(newPool);

    emit PoolCreated(address(newPool), msg.sender);
  }

  /**
   * @notice 생성된 모든 풀의 주소를 반환하는 함수
   * @return StakingPool[] 생성된 모든 풀의 주소가 포함된 배열
   */
  function getAllPools() public view returns (StakingPool[] memory) {
    return pools;
  }

  /**
   * @notice 특정 인덱스의 풀 정보를 반환하는 함수
   * @param _index 풀의 인덱스
   * @return StakingPool.Details 특정 인덱스의 풀 정보
   */
  function getPoolDetails(
    uint256 _index
  ) public view returns (StakingPool.Details memory) {
    require(_index < pools.length, "Index out of bounds");

    return pools[_index].getPoolDetails();
  }

  /**
   * @notice 생성된 풀의 개수를 반환하는 함수
   * @return uint256 생성된 풀의 개수
   */
  function getPoolsLength() public view returns (uint256) {
    return pools.length;
  }
}
