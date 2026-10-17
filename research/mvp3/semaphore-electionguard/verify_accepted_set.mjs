// Compare the local chain readback with exact published ElectionGuard bytes.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { keccak256 } from 'viem';

const base = resolve(import.meta.dirname, 'outputs');
const snapshot = JSON.parse(await readFile(resolve(base, 'chain-accepted.json'), 'utf8'));
const record = resolve(base, 'electionguard-record');
const digest = async name => keccak256(await readFile(resolve(record, name)));
const require = (condition, message) => { if (!condition) throw new Error(message); };
require(snapshot.chainId === 31337, 'Wrong local chain');
require(snapshot.acceptedBallots.length === 3, 'Wrong accepted-set size');
require(snapshot.acceptedBallots.length === snapshot.receipts.length, 'Receipt count mismatch');
require(snapshot.manifestDigest === await digest('manifest.json'), 'Manifest digest mismatch');
require(snapshot.contextDigest === await digest('context.json'), 'Context digest mismatch');
for (let index = 0; index < snapshot.acceptedBallots.length; index += 1) {
  require(snapshot.acceptedBallots[index] === await digest(`accepted-ballot-${index}.json`), `Ballot ${index} digest mismatch`);
}
const tampered = Buffer.from(await readFile(resolve(record, 'accepted-ballot-0.json')));
tampered[0] ^= 1;
const changedBytesRejected = keccak256(tampered) !== snapshot.acceptedBallots[0];
require(changedBytesRejected, 'Changed bytes accepted');
console.log(JSON.stringify({ localSnapshot: true, accepted: 3, exactByteDigestsMatched: true,
  changedBytesRejected, chainId: snapshot.chainId }));
