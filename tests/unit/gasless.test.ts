import { describe, expect, it } from 'vitest';
import { gaslessRequestSchema, uint256Schema } from '../../packages/shared-types/src/gasless.js';
import { relayerConfig } from '../../services/api/src/relayer/config.js';

describe('gasless canonical boundary and sponsorship configuration', () => {
  it('rejects noncanonical, negative, floating, unsafe numeric and overflowing integers', () => {
    for (const value of ['01', '-1', '1.0', '1e2', ' 1', Number.MAX_SAFE_INTEGER, (2n ** 256n).toString()]) expect(uint256Schema.safeParse(value).success).toBe(false);
    expect(uint256Schema.parse((2n ** 256n - 1n).toString())).toBe((2n ** 256n - 1n).toString());
  });
  it('rejects arbitrary destination, extra fields and unbounded signature bytes', () => {
    const body = { intent: { electionId: '1', candidateId: '0', manifestHash: `0x${'11'.repeat(32)}`, voter: `0x${'22'.repeat(20)}`, nonce: '0', deadline: '123' }, signature: `0x${'33'.repeat(65)}` };
    expect(gaslessRequestSchema.safeParse(body).success).toBe(true);
    expect(gaslessRequestSchema.safeParse({ ...body, contract: body.intent.voter }).success).toBe(false);
    expect(gaslessRequestSchema.safeParse({ ...body, signature: '0x' + '33'.repeat(100000) }).success).toBe(false);
    expect(gaslessRequestSchema.safeParse({ ...body, intent: { ...body.intent, candidateId: '100' } }).success).toBe(false);
  });
  it('defaults disabled and rejects malformed integer budget configuration', () => {
    expect(relayerConfig({}).enabled).toBe(false);
    expect(() => relayerConfig({ RELAYER_BUDGET_WEI: '1.5' })).toThrow();
    expect(() => relayerConfig({ RELAYER_QUEUE_LIMIT: '0' })).toThrow();
  });
});
