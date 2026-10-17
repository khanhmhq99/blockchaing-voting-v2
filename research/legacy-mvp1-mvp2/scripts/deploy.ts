import 'dotenv/config';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createPublicClient, createWalletClient, http, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { votingAbi } from '../packages/contracts/src/abi.js';

async function deploy() {
  const url = process.env.RPC_URL || 'http://127.0.0.1:8545';
  const transport = http(url);
  const client = createPublicClient({ transport });
  const chainId = await client.getChainId();
  const local = chainId === 31337 && ['127.0.0.1', 'localhost'].includes(new URL(url).hostname);
  // This MVP deliberately supports only the explicit Sepolia testnet, never mainnet.
  if (!local && (chainId !== 11155111 || process.env.CHAIN_ID !== '11155111')) throw new Error('Unsupported deployment network');
  const wallet = createWalletClient({ transport });
  const account = local ? (await wallet.getAddresses())[0]! : privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY as Hex);
  const artifact = JSON.parse(readFileSync('packages/contracts/generated/BasicVoting.json', 'utf8')) as { bytecode: Hex; compiler: string; settings: unknown };
  const hash = await wallet.deployContract({ account, chain: null, abi: votingAbi, bytecode: artifact.bytecode });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error('Deployment reverted');
  const record = { chainId, address: receipt.contractAddress, deploymentBlock: receipt.blockNumber.toString(), transactionHash: hash, compiler: artifact.compiler, settings: artifact.settings };
  mkdirSync('deployments', { recursive: true });
  writeFileSync(`deployments/${chainId}.json`, JSON.stringify(record, null, 2) + '\n');
  console.log(JSON.stringify(record, null, 2));
}
deploy().catch(() => { console.error('Deployment failed. Check network configuration, wallet funding, and deployment environment.'); process.exitCode = 1; });
