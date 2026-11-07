// Read-only BSC Testnet signer/funding check. Never print addresses or keys.
import { config as dotenv } from 'dotenv';
import { JsonRpcProvider, Wallet } from 'ethers';

if (process.env.CHAIN_ID !== '97') throw new Error('Signer preflight requires CHAIN_ID=97');
const worker = dotenv({ path: '.env.bsc-worker', quiet: true, processEnv: {} }).parsed;
if (!worker) throw new Error('Ignored worker environment is unavailable');
const roles = [
  ['deployer', process.env.DEPLOYER_PRIVATE_KEY],
  ['issuer', process.env.MACI_ISSUER_PRIVATE_KEY],
  ['registration', process.env.MACI_REGISTRATION_RELAYER_PRIVATE_KEY],
  ['join', process.env.MACI_JOIN_RELAYER_PRIVATE_KEY],
  ['message', process.env.MACI_RELAYER_PRIVATE_KEY],
  ['prover', worker.MACI_PROVER_PRIVATE_KEY],
];
if (roles.some(([, key]) => !/^0x[0-9a-fA-F]{64}$/.test(key ?? ''))) throw new Error('A BSC signer is missing or malformed');
const wallets = roles.map(([role, key]) => ({ role, address: new Wallet(key).address }));
if (new Set(wallets.map(wallet => wallet.address.toLowerCase())).size !== wallets.length) throw new Error('BSC signer roles must use distinct wallets');
const provider = new JsonRpcProvider(process.env.MACI_RPC_URL);
if (Number((await provider.getNetwork()).chainId) !== 97) throw new Error('Signer RPC is not BSC Testnet');
const fee = await provider.getFeeData();
const results = await Promise.all(wallets.map(async ({ role, address }) => ({
  role,
  balanceWei: (await provider.getBalance(address)).toString(),
  pendingNonce: await provider.getTransactionCount(address, 'pending'),
})));
if (results.some(result => BigInt(result.balanceWei) === 0n)) throw new Error('At least one BSC signer has no tBNB');
process.stdout.write(`${JSON.stringify({ chainId: 97, distinctSigners: true,
  feeDataWei: { gasPrice: fee.gasPrice?.toString() ?? null, maxFeePerGas: fee.maxFeePerGas?.toString() ?? null }, results })}\n`);
