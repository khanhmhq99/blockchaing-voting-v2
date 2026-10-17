// MACI credential and command operations run only in the browser. No secret is sent to the API.
import { Keypair, PrivateKey, PublicKey, VoteCommand } from '@maci-protocol/domainobjs';
import { encodeFunctionData, encodePacked, keccak256, type Address } from 'viem';
import { MACI_SNARK_FIELD } from '../../../packages/shared-types/src/maci';

const pollPublishAbi = [{ type: 'function', name: 'publishMessage', stateMutability: 'nonpayable', inputs: [
  { name: '_message', type: 'tuple', components: [{ name: 'data', type: 'uint256[10]' }] },
  { name: '_encryptionPublicKey', type: 'tuple', components: [{ name: 'x', type: 'uint256' }, { name: 'y', type: 'uint256' }] },
], outputs: [] }] as const;

function random256() {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return BigInt(`0x${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`);
}

function randomField() {
  // Rejection sampling over a 254-bit candidate, using the browser CSPRNG.
  for (;;) {
    const candidate = random256() & ((1n << 254n) - 1n);
    if (candidate > 0n && candidate < MACI_SNARK_FIELD) return candidate;
  }
}

function keypairFromSecret(secret: string) {
  if (!/^macisk\.[0-9a-f]{64}$/.test(secret)) throw new Error('Invalid MACI credential backup.');
  return new Keypair(PrivateKey.deserialize(secret));
}

export function createMaciCredential() {
  const pair = new Keypair(new PrivateKey(random256()));
  return { secret: pair.privateKey.serialize(), publicKeyX: pair.publicKey.raw[0].toString(), publicKeyY: pair.publicKey.raw[1].toString() };
}

export function publicKeyFromSecret(secret: string) {
  const pair = keypairFromSecret(secret);
  return { publicKeyX: pair.publicKey.raw[0].toString(), publicKeyY: pair.publicKey.raw[1].toString() };
}

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
function fromBase64(value: string) {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error('Invalid MACI backup encoding.');
  return Uint8Array.from(atob(value), character => character.charCodeAt(0));
}

async function backupKey(passphrase: string, salt: Uint8Array) {
  if (passphrase.length < 12) throw new Error('Use a backup passphrase of at least 12 characters.');
  const material = await globalThis.crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return globalThis.crypto.subtle.deriveKey({ name: 'PBKDF2', salt: new Uint8Array(salt), iterations: 310_000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function exportCredentialBackup(secret: string, passphrase: string) {
  keypairFromSecret(secret);
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await backupKey(passphrase, salt);
  const ciphertext = new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(secret)));
  return JSON.stringify({ version: 'maci-credential-backup-v1', kdf: 'PBKDF2-SHA256', iterations: 310000, cipher: 'AES-256-GCM', salt: toBase64(salt), iv: toBase64(iv), ciphertext: toBase64(ciphertext) });
}

export async function importCredentialBackup(json: string, passphrase: string) {
  if (json.length > 4096) throw new Error('MACI backup is too large.');
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { throw new Error('Invalid MACI backup.'); }
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid MACI backup.');
  const record = parsed as Record<string, unknown>;
  if (Object.keys(record).sort().join(',') !== 'cipher,ciphertext,iterations,iv,kdf,salt,version') throw new Error('Unsupported MACI backup.');
  if (record.version !== 'maci-credential-backup-v1' || record.kdf !== 'PBKDF2-SHA256' || record.iterations !== 310000 || record.cipher !== 'AES-256-GCM' || typeof record.salt !== 'string' || typeof record.iv !== 'string' || typeof record.ciphertext !== 'string') throw new Error('Unsupported MACI backup.');
  const salt = fromBase64(record.salt);
  const iv = fromBase64(record.iv);
  const ciphertext = fromBase64(record.ciphertext);
  if (salt.length !== 16 || iv.length !== 12 || ciphertext.length > 256 || ciphertext.length < 32) throw new Error('Invalid MACI backup encoding.');
  const key = await backupKey(passphrase, salt);
  try {
    const secret = new TextDecoder().decode(await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(iv) }, key, new Uint8Array(ciphertext)));
    keypairFromSecret(secret);
    return secret;
  } catch { throw new Error('MACI backup could not be opened. Check the file and passphrase.'); }
}

export function encryptMaciVote(args: {
  secret: string; pollId: string; pollStateIndex: string; candidateIndex: number;
  nonce: number; coordinatorKeyX: string; coordinatorKeyY: string; voteOptions: number;
  chainId: string; pollAddress: Address;
}) {
  if (!Number.isInteger(args.candidateIndex) || args.candidateIndex < 0 || args.candidateIndex >= args.voteOptions) throw new Error('Invalid candidate index.');
  if (!Number.isSafeInteger(args.nonce) || args.nonce < 1) throw new Error('Invalid MACI command nonce.');
  const stateIndex = BigInt(args.pollStateIndex);
  if (stateIndex < 1n || stateIndex >= 2n ** 50n) throw new Error('Invalid poll state index.');
  const voter = keypairFromSecret(args.secret);
  const ephemeral = new Keypair(new PrivateKey(random256()));
  const coordinator = new PublicKey([BigInt(args.coordinatorKeyX), BigInt(args.coordinatorKeyY)]);
  const command = new VoteCommand(stateIndex, voter.publicKey, BigInt(args.candidateIndex), 1n, BigInt(args.nonce), BigInt(args.pollId), randomField());
  const signed = command.sign(voter.privateKey);
  const encrypted = command.encrypt(signed, Keypair.generateEcdhSharedKey(ephemeral.privateKey, coordinator));
  const message = { data: encrypted.data.map(value => value.toString()) };
  const encryptionPublicKey = { x: ephemeral.publicKey.raw[0].toString(), y: ephemeral.publicKey.raw[1].toString() };
  const calldata = encodeFunctionData({ abi: pollPublishAbi, functionName: 'publishMessage', args: [
    { data: encrypted.data as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint] },
    { x: ephemeral.publicKey.raw[0], y: ephemeral.publicKey.raw[1] },
  ] });
  const idempotencyKey = keccak256(encodePacked(['uint256', 'address', 'bytes32'], [BigInt(args.chainId), args.pollAddress, keccak256(calldata)]));
  return { message, encryptionPublicKey, idempotencyKey };
}
