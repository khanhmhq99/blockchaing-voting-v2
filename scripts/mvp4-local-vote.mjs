// Synthetic two-voter walletless MACI flow on the already anchored local poll.
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { Contract, JsonRpcProvider, NonceManager, Wallet } from 'ethers';
import * as sdk from '@maci-protocol/sdk';
import { Keypair } from '@maci-protocol/domainobjs';
import { generateRandomSalt } from '@maci-protocol/crypto';

const deploymentPath = process.argv[2];
if (!deploymentPath) throw new Error('Usage: node scripts/mvp4-local-vote.mjs <deployment.json>');
const deployment = JSON.parse(fs.readFileSync(path.resolve(deploymentPath), 'utf8'));
const output = path.dirname(path.resolve(deploymentPath));
const runDir = path.resolve(output, '../..', deployment.runId);
const config = JSON.parse(fs.readFileSync(path.join(runDir, 'election-config.json'), 'utf8'));
const rpc = process.env.MACI_RPC_URL;
if (rpc !== 'http://127.0.0.1:8545' || deployment.chainId !== 31337 || config.pollAddress.toLowerCase() !== deployment.pollAddress.toLowerCase()) throw new Error('Local election binding is invalid');
let stage = 'initialize';
async function main() {
const provider = new JsonRpcProvider(rpc);
if (Number((await provider.getNetwork()).chainId) !== 31337) throw new Error('Refusing nonlocal chain');
const issuer = new Wallet(process.env.MACI_ISSUER_PRIVATE_KEY, provider);
const registrationSponsor = new NonceManager(new Wallet(process.env.MACI_REGISTRATION_RELAYER_PRIVATE_KEY, provider));
const joinSponsor = new NonceManager(new Wallet(process.env.MACI_JOIN_RELAYER_PRIVATE_KEY, provider));
const messageSponsor = new NonceManager(new Wallet(process.env.MACI_RELAYER_PRIVATE_KEY, provider));
const registrationAbi = JSON.parse(fs.readFileSync(path.resolve('packages/contracts/generated/SponsoredMaciRegistration.json'), 'utf8')).abi;
const registration = new Contract(deployment.registrationAddress, registrationAbi, registrationSponsor);
const credentials = [new Keypair(), new Keypair()];
const deadline = BigInt(deployment.endTimestamp + 3600);
const domain = { name: 'HCMUT MACI Registration', version: '1', chainId: 31337n, verifyingContract: deployment.registrationAddress };
const types = { Registration: [
  { name: 'ticket', type: 'bytes32' }, { name: 'publicKeyX', type: 'uint256' },
  { name: 'publicKeyY', type: 'uint256' }, { name: 'deadline', type: 'uint256' },
] };
const registrationTransactions = [];
for (const voter of credentials) {
  stage = `registration-${registrationTransactions.length}`;
  const key = voter.publicKey.asContractParam();
  const ticket = `0x${randomBytes(32).toString('hex')}`;
  const signature = await issuer.signTypedData(domain, types, { ticket, publicKeyX: key.x, publicKeyY: key.y, deadline });
  const receipt = await (await registration.register(key, ticket, deadline, signature)).wait();
  if (receipt.status !== 1) throw new Error('Sponsored registration failed');
  registrationTransactions.push(receipt.hash);
}
const start = BigInt(deployment.startTimestamp);
const current = BigInt((await provider.getBlock('latest')).timestamp);
if (current >= start) throw new Error('Poll opened before registrations completed');
await provider.send('evm_setNextBlockTimestamp', [Number(start + 1n)]);
await provider.send('evm_mine', []);
const joinTransactions = [];
const indexes = [];
for (const voter of credentials) {
  stage = `join-${joinTransactions.length}`;
  const joined = await sdk.joinPoll({
    maciAddress: deployment.maciAddress, privateKey: voter.privateKey.serialize(),
    pollId: BigInt(deployment.pollId),
    pollJoiningZkey: path.resolve('research/mvp3/maci/artifacts/polljoining_14.zkey'),
    pollJoiningWasm: path.resolve('research/mvp3/maci/probe-output/circuits/PollJoining_14_js/PollJoining_14.wasm'),
    useWasm: true, sgDataArg: '0x', ivcpDataArg: '0x', signer: joinSponsor,
  });
  const receipt = await provider.getTransactionReceipt(joined.hash);
  if (receipt?.status !== 1) throw new Error('Sponsored poll join failed');
  joinTransactions.push(receipt.hash);
  if (!/^(0|[1-9][0-9]*)$/.test(joined.pollStateIndex)) throw new Error('Joined state index is missing');
  indexes.push(BigInt(joined.pollStateIndex));
}
const selections = [1n, 2n];
const messageTransactions = [];
for (let i = 0; i < credentials.length; i++) {
  stage = `publish-${i}`;
  const published = await sdk.publish({
    publicKey: credentials[i].publicKey.serialize(), privateKey: credentials[i].privateKey.serialize(),
    stateIndex: indexes[i], voteOptionIndex: selections[i], nonce: 1n,
    pollId: BigInt(deployment.pollId), newVoteWeight: 1n,
    maciAddress: deployment.maciAddress, salt: generateRandomSalt(), signer: messageSponsor,
  });
  if (!published.hash) throw new Error('Encrypted command publication has no hash');
  messageTransactions.push(published.hash);
}
const finish = BigInt(deployment.endTimestamp);
if (BigInt((await provider.getBlock('latest')).timestamp) >= finish) throw new Error('Poll expired before both commands');
await provider.send('evm_setNextBlockTimestamp', [Number(finish + 1n)]);
await provider.send('evm_mine', []);
const row = { chainId: 31337, electionId: config.electionId, pollId: deployment.pollId, registrationTransactions, joinTransactions, messageTransactions, intendedChoices: ['synthetic-b', 'synthetic-c'], voterCount: 2, commandsSubmitted: 2, pollClosedBlock: await provider.getBlockNumber() };
fs.writeFileSync(path.join(runDir, 'voting-observation.json'), `${JSON.stringify(row, null, 2)}\n`, { flag: 'wx' });
process.stdout.write(`${JSON.stringify(row)}\n`);
}
main().catch(error => {
  const detail = String(error.shortMessage ?? error.message ?? 'RUNTIME_ERROR').split(' (')[0].split('(transaction=')[0].slice(0, 180);
  process.stderr.write(`MVP4 local voting failed at ${stage}: ${error.code ?? 'RUNTIME_ERROR'}: ${detail}\n`);
  process.exitCode = 1;
});
