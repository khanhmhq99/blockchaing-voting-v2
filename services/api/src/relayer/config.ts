import { z } from 'zod';
import { uint256Schema } from '../../../../packages/shared-types/src/gasless.js';

export function relayerConfig(env: NodeJS.ProcessEnv = process.env) {
  return z.object({
    enabled: z.boolean(),
    gasLimit: uint256Schema, gasPriceWei: uint256Schema, budgetWei: uint256Schema,
    minimumBalanceWei: uint256Schema,
    maxDeadlineSeconds: z.coerce.number().int().min(30).max(3600),
    queueLimit: z.coerce.number().int().min(1).max(10000),
    ratePerMinute: z.coerce.number().int().min(1).max(10000),
    voterAttempts: z.coerce.number().int().min(1).max(20),
    pendingTimeoutMs: z.coerce.number().int().min(1000).max(3600000),
  }).parse({
    enabled: env.GASLESS_ENABLED === 'true',
    gasLimit: env.RELAYER_MAX_GAS ?? '250000', gasPriceWei: env.RELAYER_MAX_GAS_PRICE_WEI ?? '10000000000',
    budgetWei: env.RELAYER_BUDGET_WEI ?? '100000000000000000', minimumBalanceWei: env.RELAYER_MIN_BALANCE_WEI ?? '1000000000000000',
    maxDeadlineSeconds: env.RELAYER_MAX_DEADLINE_SECONDS ?? '600', queueLimit: env.RELAYER_QUEUE_LIMIT ?? '100',
    ratePerMinute: env.RELAYER_RATE_PER_MINUTE ?? '60', voterAttempts: env.RELAYER_VOTER_ATTEMPTS ?? '5',
    pendingTimeoutMs: env.RELAYER_PENDING_TIMEOUT_MS ?? '120000',
  });
}
