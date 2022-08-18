require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  solidity: {
    version: '0.8.16',
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000000,
      },
    },
  },
  defaultNetwork: 'hardhat',
  abiExporter: {
    path: './abi',
    clear: true,
    flat: true,
    pretty: true,
  },
  mocha: {
    timeout: 60 * 60 * 1000,
  },
};
