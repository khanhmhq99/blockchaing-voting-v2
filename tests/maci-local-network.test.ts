import assert from 'node:assert/strict';
import test from 'node:test';
import { chainConfig } from '../services/api/src/config.ts';
import { ChainService } from '../services/api/src/chain.ts';
import { MaciService } from '../services/api/src/maci/module.ts';

test('API configuration rejects chain 97 and a non-loopback RPC', () => {
  const local = { RPC_URL: 'http://127.0.0.1:8545', CHAIN_ID: '31337' };
  assert.equal(chainConfig(local).CHAIN_ID, 31337);
  assert.throws(() => chainConfig({ ...local, CHAIN_ID: '97' }), /Hardhat Local/);
  assert.throws(() => chainConfig({ ...local, RPC_URL: 'https://example.invalid' }), /Hardhat Local/);
  assert.throws(() => chainConfig({ ...local, MACI_RPC_URL: 'http://127.0.0.1:8546' }), /same Hardhat Local RPC/);
});

test('a chain 97 election is rejected before contract reads', async () => {
  let reads = 0;
  const chain = { config: { CHAIN_ID: 31337 }, client: {
    getChainId: async () => 31337,
    getBlockNumber: async () => 10n,
    getCode: async () => { reads += 1; return '0x1234'; },
  } };
  const service = new MaciService({} as never, chain as never, {} as never);
  await assert.rejects(service.verifyDeployment({
    chainId: '97', maciAddress: '0x1111111111111111111111111111111111111111',
    registrationAddress: '0x2222222222222222222222222222222222222222',
    pollAddress: '0x3333333333333333333333333333333333333333',
    pollId: '0', deploymentBlock: '1',
  }), error => typeof error === 'object' && error !== null && 'response' in error &&
    (error.response as { code?: string }).code === 'MACI_CHAIN_MISMATCH');
  assert.equal(reads, 0);
});

test('relay preflight rejects disconnected RPC and missing bytecode', async () => {
  const address = '0x1111111111111111111111111111111111111111';
  const service = Object.create(ChainService.prototype) as ChainService;
  Object.assign(service, { client: { getChainId: async () => { throw new Error('offline'); } } });
  await assert.rejects(service.requireLocalContract(address), error => typeof error === 'object' && error !== null && 'response' in error &&
    (error.response as { code?: string }).code === 'DEPENDENCY_UNAVAILABLE');
  Object.assign(service, { client: { getChainId: async () => 31337, getCode: async () => undefined } });
  await assert.rejects(service.requireLocalContract(address), error => typeof error === 'object' && error !== null && 'response' in error &&
    (error.response as { code?: string }).code === 'MACI_CONTRACT_MISSING');
});
