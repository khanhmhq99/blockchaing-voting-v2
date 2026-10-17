import { describe, expect, it, vi } from 'vitest';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { databaseOptions } from '../../services/api/src/config.js';
import { AdminService } from '../../services/api/src/admin.js';
import type { ChainService } from '../../services/api/src/chain.js';
import { manifestSchema, payloadHash } from '../../packages/shared-types/src/index.js';

describe('configuration and authorization boundaries', () => {
  it('requires credentials and enforces verified TLS despite URL overrides', () => {
    expect(() => databaseOptions({})).toThrow();
    const options = databaseOptions({ DATABASE_URL: 'postgresql://synthetic:placeholder@invalid.example:5432/postgres?sslmode=disable' });
    expect(options.ssl.rejectUnauthorized).toBe(true);
    expect(options.connectionString).not.toContain('sslmode');
    expect(options.max).toBe(5);
    expect(() => databaseOptions({ DATABASE_URL: 'postgresql://x:x@invalid.example:6543/postgres', DATABASE_POOL_MODE: 'session' })).toThrow();
  });
  it('canonicalizes metadata and rejects unknown fields', () => {
    expect(payloadHash({ b: 2, a: 1 })).toBe(payloadHash({ a: 1, b: 2 }));
    expect(payloadHash({ a: 2 })).not.toBe(payloadHash({ a: 1 }));
    expect(() => manifestSchema.parse({ title: 'Test', description: '', candidates: [{ name: 'A', biography: '' }, { name: 'B', biography: '' }], eligible: true })).toThrow();
  });
  it('binds signatures to action/payload/current owner and consumes nonces', async () => {
    const owner = privateKeyToAccount(generatePrivateKey());
    const other = privateKeyToAccount(generatePrivateKey());
    const chain = { owner: async () => owner.address, address: owner.address, config: { CHAIN_ID: 31337 } } as unknown as ChainService;
    const admin = new AdminService(chain);
    const payload = { electionId: '1' };
    const challenge = await admin.challenge('metadata', payloadHash(payload));
    const signature = await owner.signMessage({ message: challenge.message });
    await admin.authorize('metadata', payload, challenge.nonce, signature);
    await expect(admin.authorize('metadata', payload, challenge.nonce, signature)).rejects.toThrow();
    const forged = await admin.challenge('index', payloadHash({}));
    await expect(admin.authorize('index', {}, forged.nonce, await other.signMessage({ message: forged.message }))).rejects.toThrow();
    const changed = await admin.challenge('metadata', payloadHash(payload));
    await expect(admin.authorize('metadata', { electionId: '2' }, changed.nonce, await owner.signMessage({ message: changed.message }))).rejects.toThrow();
  });
  it('rejects expired administrative challenges', async () => {
    const owner = privateKeyToAccount(generatePrivateKey());
    const chain = { owner: async () => owner.address, address: owner.address, config: { CHAIN_ID: 31337 } } as unknown as ChainService;
    const admin = new AdminService(chain);
    const challenge = await admin.challenge('index', payloadHash({}));
    const signature = await owner.signMessage({ message: challenge.message });
    const clock = vi.spyOn(Date, 'now').mockReturnValue(challenge.expires);
    try { await expect(admin.authorize('index', {}, challenge.nonce, signature)).rejects.toThrow(); }
    finally { clock.mockRestore(); }
  });
});
