import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const StakingPoolFactoryModule = buildModule(
  "StakingPoolFactoryModule",
  (m) => {
    const stakingPoolFactory = m.contract("StakingPoolFactory", [], {});

    return { stakingPoolFactory };
  }
);

export default StakingPoolFactoryModule;
