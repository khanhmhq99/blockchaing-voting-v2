import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const directory = process.argv[2];
if (!directory) throw new Error('Pass the retained paired benchmark directory.');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const read = path => readFileSync(`${directory}/${path}`);
const hashes = JSON.parse(read('source-hashes.json'));
for (const [path, hash] of Object.entries(hashes)) assert.equal(sha(read(`source-snapshot/${path}`)), hash, path);
const comparison = JSON.parse(read('comparison.json'));
for (const pair of comparison) {
  for (const mode of ['mvp1', 'mvp2']) {
    const path = `${mode}-${pair.size}`;
    const metadata = JSON.parse(read(`${path}/manifest.json`));
    const raw = read(`${path}/transaction-attempts.jsonl`);
    const logical = read(`${path}/logical-submissions.jsonl`);
    assert.equal(metadata.sourceSnapshotHash, sha(read('source-hashes.json')));
    assert.equal(metadata.rawHash, sha(raw)); assert.equal(metadata.logicalHash, sha(logical));
    assert.equal(metadata.sourceHash, sha(read(`${path}/contract.sol`)));
    assert.equal(metadata.driverHash, sha(read('benchmark-driver.ts')));
    const rows = raw.toString().trim().split('\n').map(JSON.parse);
    assert.equal(rows.length, pair.size); assert.equal(new Set(rows.map(r => r.transactionHash)).size, pair.size);
    assert.equal(logical.toString().trim().split('\n').length, pair.size);
    const total = field => rows.reduce((sum, row) => sum + BigInt(row[field]), 0n).toString();
    for (const row of rows) {
      assert.equal(row.success, true);
      assert.equal(BigInt(row.feeWei), BigInt(row.gasUsed) * BigInt(row.effectiveGasPrice));
      assert.equal(row.senderRole, mode === 'mvp1' ? 'voter' : 'relayer');
      assert.equal(row[mode === 'mvp1' ? 'sponsorFeeWei' : 'voterFeeWei'], '0');
    }
    assert.equal(metadata.summary.gasTotal, total('gasUsed'));
    assert.equal(metadata.summary.feeTotalWei, total('feeWei'));
    assert.equal(metadata.summary.voterFeeWei, total('voterFeeWei'));
    assert.equal(metadata.summary.relayerFeeWei, total('sponsorFeeWei'));
    assert.deepEqual(metadata.summary, pair[mode === 'mvp1' ? 'baseline' : 'gasless']);
  }
}
console.log('Verified six workloads: source snapshots, raw hashes, logical counts, receipt fee arithmetic and payer attribution.');
