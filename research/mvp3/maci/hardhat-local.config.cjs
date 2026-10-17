// Isolated in-process EVM for the synthetic MACI v3 research run.
const path = require('node:path');
require('./runtime-env/node_modules/@maci-protocol/contracts/node_modules/@nomicfoundation/hardhat-ethers');

module.exports = {
  solidity: '0.8.28',
  paths: {
    artifacts: path.join(__dirname, 'runtime-env/node_modules/@maci-protocol/contracts/build/artifacts'),
  },
  networks: {
    hardhat: {
      chainId: 31337,
      allowUnlimitedContractSize: true,
    },
  },
};
