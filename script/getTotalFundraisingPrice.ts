import { ethers } from "hardhat";
import fs from "fs";
import path from "path";
import { JsonRpcProvider } from "@ethersproject/providers";
import { Contract } from "ethers";

async function main() {
  // Polygon Mumbai Testnet 설정
  const provider: any = new ethers.JsonRpcProvider(
    "https://rpc-amoy.polygon.technology/"
  );

  // 스마트 컨트랙트 주소 설정
  const contractAddress: string = "0x57DC23ddb0195Ea073AEEa83FF10713c928d2882";

  // ABI 파일 경로 (동일 디렉토리에 있는 경우)
  const abiFilePath: string = path.resolve(__dirname, "StakingPoolABI.json");

  // ABI 파일 읽기
  const abi: any = JSON.parse(fs.readFileSync(abiFilePath, "utf8"));

  // Contract 인스턴스 생성
  const contract: Contract = new ethers.Contract(
    contractAddress,
    abi,
    provider
  );

  // totalFundraisingMultipliedPrice 호출
  const totalFundraisingMultipliedPrice = await contract.getStake(
    "0x4bbE33d3B29037baE9e6f23E60839Ac54b659651",
    0
  );
  console.log(
    "Total Fundraising Multiplied Price:",
    totalFundraisingMultipliedPrice
  );

  const totalFundraisingMultipliedPrice2 = await contract.getStakeCount(
    "0x4bbE33d3B29037baE9e6f23E60839Ac54b659651"
  );
  console.log(
    "Total Fundraising Multiplied Price:",
    totalFundraisingMultipliedPrice2
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
