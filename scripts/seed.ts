import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createPublicClient, createWalletClient, http, type Address } from 'viem';
import { votingAbi } from '../packages/contracts/src/abi.js';
import { payloadHash } from '../packages/shared-types/src/index.js';

async function seed() {
  const url = process.env.RPC_URL || 'http://127.0.0.1:8545';
  if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) throw new Error('Local synthetic seed only');
  const transport = http(url);
  const client = createPublicClient({ transport, pollingInterval: 20 });
  if (await client.getChainId() !== 31337) throw new Error('Local chain required');
  const wallet = createWalletClient({ transport });
  const accounts = await wallet.getAddresses();
  const address = process.env.VOTING_CONTRACT_ADDRESS as Address;
  const write = async (functionName: string, args: readonly unknown[]) => {
    const hash = await wallet.writeContract({ account: accounts[0]!, chain: null, address, abi: votingAbi, functionName, args } as Parameters<typeof wallet.writeContract>[0]);
    return client.waitForTransactionReceipt({ hash });
  };
  const manifest = { title: 'Synthetic research election', description: 'Local development only. Public ballots.', candidates: [{ name: 'Candidate A', biography: '' }, { name: 'Candidate B', biography: '' }] };
  const start = (await client.getBlock()).timestamp + 600n;
  await write('createElection', [start, start + 86400n, 2, payloadHash(manifest)]);
  const id = await client.readContract({ address, abi: votingAbi, functionName: 'electionCount' });
  await write('registerCandidates', [id, manifest.candidates.map(payloadHash)]);
  await write('setEligibility', [id, accounts.slice(1, 4), true]);
  await write('freeze', [id]);
  mkdirSync('deployments', { recursive: true });
  writeFileSync(`deployments/seed-${id}.json`, JSON.stringify({ electionId: id.toString(), manifest, syntheticVoters: accounts.slice(1, 4) }, null, 2) + '\n');
  console.log(`Created election ${id}. Starts in 10 chain minutes. Save the exact manifest through the signed admin metadata endpoint. Public fixture: deployments/seed-${id}.json`);
}
seed().catch(() => { console.error('Synthetic seed failed. Verify the local deployment configuration.'); process.exitCode = 1; });
