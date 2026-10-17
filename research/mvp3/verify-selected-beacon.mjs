import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { HttpCachingChain, HttpChainClient, fetchBeacon } from './ceremony/beacon-tools/node_modules/drand-client/build/esm/index.mjs';

const round = 6551994;
const chainHash = '8990e7a9aaed2ffed73dbd7092123d6f289930540d7651336225dc172e51b2ce';
const publicKey = '868f005eb8e6e4ca0a47c8a77ceaa5309a47978a7c71bc5cce96366b5d7a569937c529eeda66c7293784a9402801af31';
const relays = ['https://api.drand.sh', 'https://drand.cloudflare.com'];
const options = { disableBeaconVerification: false, noCache: false, chainVerificationParams: { chainHash, publicKey } };
const evidencePath = new URL('../../docs/mvp3/BEACON_EVIDENCE.json', import.meta.url);
const capture = process.argv.includes('--capture');

const stored = capture ? null : JSON.parse(readFileSync(evidencePath, 'utf8'));
if (stored && (stored.selectedRound !== round || stored.chainHash !== chainHash || stored.publicKey !== publicKey)) {
  throw new Error('Stored beacon parameters differ from precommitment');
}
const results = capture ? [] : stored.results;
if (results.length !== relays.length) throw new Error('Unexpected relay count');
for (let index = 0; index < relays.length; index++) {
  const relay = relays[index];
  const chain = capture ? new HttpCachingChain(`${relay}/${chainHash}`, options) : {
    info: async () => results[index].info,
  };
  const client = capture ? new HttpChainClient(chain, options) : {
    options, chain: () => chain, get: async () => results[index].beacon,
  };
  const info = await chain.info();
  if (info.hash !== chainHash || info.public_key !== publicKey || info.schemeID !== 'pedersen-bls-chained'
    || info.period !== 30 || info.genesis_time !== 1595431050) {
    throw new Error(`Unexpected drand chain info from ${relay}`);
  }
  const beacon = await fetchBeacon(client, round); // drand-client verifies the BLS signature.
  if (beacon.round !== round || !/^[0-9a-f]{64}$/.test(beacon.randomness)) throw new Error(`Invalid round or randomness from ${relay}`);
  if (createHash('sha256').update(Buffer.from(beacon.signature, 'hex')).digest('hex') !== beacon.randomness) {
    throw new Error(`Signature/randomness mismatch from ${relay}`);
  }
  if (capture) results.push({ relay, info, beacon });
  else if (results[index].relay !== relay) throw new Error(`Unexpected relay label at index ${index}`);
}
if (['round', 'randomness', 'signature', 'previous_signature'].some(field => results[0].beacon[field] !== results[1].beacon[field])) {
  throw new Error('Drand relays disagree about the selected beacon');
}
if (capture) {
  const evidence = {
    selectedRound: round, chainHash, publicKey, checkedAtUtc: new Date().toISOString(),
    verifier: 'drand-client@1.4.2, BLS verification enabled', results,
  };
  writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
}
console.log(JSON.stringify({ round, randomness: results[0].beacon.randomness, relays: relays.length, signatureVerified: true, matching: true }));
