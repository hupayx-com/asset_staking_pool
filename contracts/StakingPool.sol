// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

// Uncomment this line to use console.log
// import "hardhat/console.sol";

contract StakingPool {
  // 스테이킹 풀의 관리자 주소
  address public admin;

  // 스테이킹 풀의 상태를 나타내는 열거형
  enum PoolState {
    Waiting, // 대기
    Fundraising, // 모금
    Operating, // 운영
    Closed, // 종료
    Stopped // 중지
  }

  // 스테이킹 풀의 상태
  PoolState public state;

  // 스테이킹 풀의 속성
  struct PoolDetails {
    string name; // 풀 이름
    string description; // 풀 설명
    uint256 minStakeAmount; // 최소 스테이킹 금액 (달러 기준)
    uint256 interestRate; // 이자율
    uint256 payoutInterval; // 지급 주기
    uint256 fundraisingDuration; // 모금 기간
    uint256 operatingDuration; // 운영 기간
    uint256 minFundraisingAmount; // 최소 모금 금액
    uint256 maxFundraisingAmount; // 최대 모금 금액
    address stakingToken; // 스테이킹 대상 토큰 주소
  }

  PoolDetails public poolDetails;

  // 스테이킹 풀 생성자
  constructor() {
    admin = msg.sender; // 스마트 컨트랙트 배포자를 관리자로 설정
    state = PoolState.Waiting; // 초기 상태를 '모금 대기'로 설정
  }

  // 관리자 권한 확인을 위한 modifier
  modifier onlyAdmin() {
    require(msg.sender == admin, "Not an admin");
    _;
  }

  // 특정 상태에서만 실행 가능하도록 하는 modifier
  modifier inState(PoolState _state) {
    require(state == _state, "Invalid state");
    _;
  }

  // Pool 관련 설정 함수들 (관리자 전용)
  function setPoolName(
    string memory _name
  ) public onlyAdmin inState(PoolState.Waiting) {
    poolDetails.name = _name;
  }

  function setPoolDescription(
    string memory _description
  ) public onlyAdmin inState(PoolState.Waiting) {
    poolDetails.description = _description;
  }

  // 모금 기간 동안 실행 가능한 함수들
  function stakeSFL(uint256 _amount) public inState(PoolState.Fundraising) {
    // SFL 스테이킹 로직
  }

  function setSFLPrice(uint256 _price) public onlyAdmin {
    // SFL 가격 설정 로직
  }

  // 운영 기간 동안 실행 가능한 함수들
  function claimRewards() public inState(PoolState.Operating) {
    // 보상 조회 및 요청 로직
  }

  // 상태 변경 함수들
  function startFundraising() public onlyAdmin inState(PoolState.Waiting) {
    state = PoolState.Fundraising; // 상태를 '모금 기간'으로 변경
  }

  // Pool 설정 관련 함수들 (모금 대기 상태에서만 설정 가능)
  function setMinStakeAmount(
    uint256 _amount
  ) public onlyAdmin inState(PoolState.Waiting) {
    poolDetails.minStakeAmount = _amount;
  }

  function setInterestRate(
    uint256 _interestRate
  ) public onlyAdmin inState(PoolState.Waiting) {
    poolDetails.interestRate = _interestRate;
  }

  function setPayoutInterval(
    uint256 _interval
  ) public onlyAdmin inState(PoolState.Waiting) {
    poolDetails.payoutInterval = _interval;
  }

  function setFundraisingDuration(
    uint256 _duration
  ) public onlyAdmin inState(PoolState.Waiting) {
    poolDetails.fundraisingDuration = _duration;
  }

  function setOperatingDuration(
    uint256 _duration
  ) public onlyAdmin inState(PoolState.Waiting) {
    poolDetails.operatingDuration = _duration;
  }

  function setMinFundraisingAmount(
    uint256 _amount
  ) public onlyAdmin inState(PoolState.Waiting) {
    poolDetails.minFundraisingAmount = _amount;
  }

  function setMaxFundraisingAmount(
    uint256 _amount
  ) public onlyAdmin inState(PoolState.Waiting) {
    poolDetails.maxFundraisingAmount = _amount;
  }

  function setStakingToken(
    address _tokenAddress
  ) public onlyAdmin inState(PoolState.Waiting) {
    poolDetails.stakingToken = _tokenAddress;
  }

  // 모금 기간 관련 함수들
  function stopFundraising() public onlyAdmin inState(PoolState.Fundraising) {
    // 모금 중지 로직
  }

  function unstakeSFL(uint256 _amount) public inState(PoolState.Fundraising) {
    // SFL unstaking 로직
  }

  function withdrawFailedFundraising() public inState(PoolState.Fundraising) {
    // 모금 실패 시 자금 회수 로직
  }

  // 운영 기간 관련 함수들
  function stopOperating() public onlyAdmin inState(PoolState.Operating) {
    // 운영 중지 로직
  }

  function viewRewards(
    address _staker
  ) public view inState(PoolState.Operating) returns (uint256) {
    // 보상 조회 로직
  }

  function viewAccumulatedRewards(
    address _staker
  ) public view inState(PoolState.Operating) returns (uint256) {
    // 누적 보상 조회 로직
  }

  function requestRewards() public inState(PoolState.Operating) {
    // 보상 요청 로직
  }

  function withdrawAtClosure() public inState(PoolState.Operating) {
    // 운영 종료 시 자금 회수 로직
  }

  // 상태 변경 함수들
  function startOperating() public onlyAdmin inState(PoolState.Fundraising) {
    // 상태를 '운영 기간'으로 변경하는 로직
  }

  function closePool() public onlyAdmin inState(PoolState.Operating) {
    // 스테이킹 풀을 종료하는 로직
  }
}
