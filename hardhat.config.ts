import { HardhatUserConfig } from "hardhat/config";

import "@nomicfoundation/hardhat-toolbox";

import "solidity-coverage";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",

    settings: {
      optimizer: {
        enabled: true,

        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {},
    amoy: {
      url: "https://rpc-amoy.polygon.technology",
      accounts: ["YOUR PRIVATE KEY"],
    },
  },
  etherscan: {
    apiKey: "YOUR KEY",
  },
};

export default config;
