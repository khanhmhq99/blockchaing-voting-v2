import 'dotenv/config';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createPublicClient, createWalletClient, http, keccak256, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bscTestnet } from 'viem/chains';
import { gaslessAbi } from '../packages/contracts/src/gasless-abi.js';

async function deploy() {
  const url = process.env.RPC_URL || 'http://127.0.0.1:8545';
  const client = createPublicClient({ transport: http(url) });
  const chainId = await client.getChainId();
  const local = chainId === 31337 && ['127.0.0.1', 'localhost'].includes(new URL(url).hostname);
  const testnet = chainId === 97 && process.env.CHAIN_ID === '97' && new URL(url).protocol === 'https:';
  if (!local && !testnet) throw new Error('Only loopback 31337 and explicitly configured BSC Testnet 97 are supported');
  const wallet = createWalletClient({ transport: http(url) });
  const artifact = JSON.parse(readFileSync('packages/contracts/generated/GaslessVoting.json', 'utf8')) as { bytecode: Hex; compiler: string; settings: unknown };
  mkdirSync('deployments/mvp2', { recursive: true });
  let hash: Hex;
  let deployer: Hex;
  if (testnet) {
    const key = process.env.DEPLOYER_PRIVATE_KEY ?? '';
    const account = privateKeyToAccount((key.startsWith('0x') ? key : `0x${key}`) as Hex);
    deployer = account.address;
    const relayerKey = process.env.RELAYER_PRIVATE_KEY;
    if (relayerKey && privateKeyToAccount((relayerKey.startsWith('0x') ? relayerKey : `0x${relayerKey}`) as Hex).address === deployer) throw new Error('Separate deployer and relayer required');
    const journal = `deployments/mvp2/97-${deployer}-pending.json`;
    if (existsSync(journal)) {
      const pending = JSON.parse(readFileSync(journal, 'utf8')) as { transactionHash: Hex; creationCodeHash: Hex };
      if (pending.creationCodeHash !== keccak256(artifact.bytecode)) throw new Error('Pending deployment artifact mismatch');
      hash = pending.transactionHash;
    } else {
      const gas = (await client.estimateGas({ account, data: artifact.bytecode })) * 120n / 100n;
      const gasPrice = await client.getGasPrice();
      const balance = await client.getBalance({ address: deployer });
      if (gasPrice > 10_000_000_000n || gas * gasPrice > 10_000_000_000_000_000n || balance < gas * gasPrice) throw new Error('Deployment exceeds testnet fee/balance limits');
      const nonce = await client.getTransactionCount({ address: deployer, blockTag: 'pending' });
      const signed = await account.signTransaction({ chainId, type: 'legacy', nonce, gas, gasPrice, data: artifact.bytecode, value: 0n });
      hash = keccak256(signed);
      // Persist the public hash before broadcast. An uncertain send must never create a second deployment.
      writeFileSync(journal, JSON.stringify({ chainId, deployer, transactionHash: hash, nonce, creationCodeHash: keccak256(artifact.bytecode) }, null, 2) + '\n', { flag: 'wx' });
      console.error(`BSC Testnet deployment ${hash}; maximum fee ${gas * gasPrice} wei`);
      await createWalletClient({ account, chain: bscTestnet, transport: http(url, { retryCount: 0 }) }).sendRawTransaction({ serializedTransaction: signed });
    }
  } else {
    const [account] = await wallet.getAddresses(); if (!account) throw new Error('Local admin unavailable');
    deployer = account;
    hash = await wallet.deployContract({ account, chain: null, abi: gaslessAbi, bytecode: artifact.bytecode });
  }
  const receipt = await client.waitForTransactionReceipt({ hash, confirmations: testnet ? 2 : 1 });
  if (receipt.status !== 'success' || !receipt.contractAddress) throw new Error('Deployment reverted');
  const address = receipt.contractAddress;
  const code = await client.getCode({ address });
  const owner = await client.readContract({ address, abi: gaslessAbi, functionName: 'owner' });
  const domain = await client.readContract({ address, abi: gaslessAbi, functionName: 'eip712Domain' });
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  if (!code || code === '0x' || owner.toLowerCase() !== deployer.toLowerCase() || domain[1] !== 'HCMUT Gasless Voting' || domain[2] !== '2' || domain[3] !== BigInt(chainId) || domain[4].toLowerCase() !== address.toLowerCase() || block.hash !== receipt.blockHash) throw new Error('Deployment verification failed');
  const record = { protocol: 'signed-intent-v2', chainId, address, deployer, deploymentBlock: receipt.blockNumber.toString(), transactionHash: hash, blockHash: receipt.blockHash, gasUsed: receipt.gasUsed.toString(), effectiveGasPrice: receipt.effectiveGasPrice.toString(), creationCodeHash: keccak256(artifact.bytecode), runtimeCodeHash: keccak256(code), compiler: artifact.compiler, settings: artifact.settings };
  mkdirSync('deployments/mvp2', { recursive: true });
  writeFileSync(`deployments/mvp2/${chainId}-${receipt.transactionHash}.json`, JSON.stringify(record, null, 2) + '\n');
  console.log(JSON.stringify(record, null, 2));
}
deploy().catch(() => { console.error('Gasless deployment failed. Check chain configuration, signer, test funds and public pending journal. Do not delete a pending journal or redeploy until its transaction is reconciled.'); process.exitCode = 1; });
