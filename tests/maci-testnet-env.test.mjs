import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import test from 'node:test';

test('testnet wrapper rejects a non-97 file and never inherits local chain secrets', () => {
  const directory = mkdtempSync(join(tmpdir(), 'maci-testnet-env-'));
  const file = join(directory, '.env.bsc-testnet');
  const env = { ...process.env, MACI_ENV_FILE: file, MACI_RELAYER_PRIVATE_KEY: 'local-only-secret', CHAIN_ID: '31337' };
  try {
    writeFileSync(file, 'CHAIN_ID=31337\n');
    const rejected = spawnSync(process.execPath, ['scripts/maci-testnet-env.mjs', '-e', 'process.exit(0)'], { cwd: process.cwd(), env, encoding: 'utf8' });
    assert.notEqual(rejected.status, 0);
    writeFileSync(file, 'CHAIN_ID=97\n');
    const accepted = spawnSync(process.execPath, ['scripts/maci-testnet-env.mjs', '-e', "process.stdout.write(process.env.CHAIN_ID + ':' + (process.env.MACI_RELAYER_PRIVATE_KEY ?? 'missing'))"], { cwd: process.cwd(), env, encoding: 'utf8' });
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.equal(accepted.stdout, '97:missing');
  } finally {
    if (!resolve(directory).startsWith(`${resolve(tmpdir())}${sep}`)) throw new Error('Test cleanup path escaped the temporary directory.');
    rmSync(directory, { recursive: true, force: true });
  }
});
