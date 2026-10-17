// MACI v3 deployment SDK uses the Hardhat 2 ethers plugin from the isolated runtime.
const path = require('node:path');
require('./runtime-env/node_modules/@maci-protocol/contracts/node_modules/@nomicfoundation/hardhat-ethers');

module.exports = {
  solidity: '0.8.28',
  paths: {
    artifacts: path.join(__dirname, 'runtime-env/node_modules/@maci-protocol/contracts/build/artifacts'),
  },
  networks: {
    persistentLocal: {
      url: process.env.MACI_RPC_URL || 'http://127.0.0.1:8545',
      chainId: 31337,
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
  },
};
