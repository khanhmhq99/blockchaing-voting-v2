import { randomBytes } from 'node:crypto';
import { Inject, Injectable, UnauthorizedException, HttpException } from '@nestjs/common';
import { verifyMessage, type Hex } from 'viem';
import { ChainService } from './chain.js';
import { payloadHash } from '../../../packages/shared-types/src/index.js';

@Injectable()
export class AdminService {
  private readonly challenges = new Map<string, { message: string; digest: string; action: string; expires: number }>();
  constructor(@Inject(ChainService) private readonly chain: ChainService) {}
  async challenge(action: string, digest: string) {
    for (const [id, item] of this.challenges) if (item.expires <= Date.now()) this.challenges.delete(id);
    if (this.challenges.size >= 1000) throw new HttpException('Challenge capacity reached', 429);
    const nonce = randomBytes(32).toString('hex');
    const expires = Date.now() + 120_000;
    const owner = await this.chain.owner();
    const message = ['Blockchain Voting: administrative operation only', `Origin: ${process.env.APP_ORIGIN ?? 'http://localhost:3000'}`, `Chain: ${this.chain.config.CHAIN_ID}`, `Contract: ${this.chain.address}`, `Admin: ${owner}`, `Action: ${action}`, `Payload: ${digest}`, `Nonce: ${nonce}`, `Expires: ${new Date(expires).toISOString()}`].join('\n');
    this.challenges.set(nonce, { message, digest, action, expires });
    return { nonce, message, expires, owner };
  }
  async authorize(action: string, payload: unknown, nonce: string | undefined, signature: string | undefined) {
    const challenge = nonce ? this.challenges.get(nonce) : undefined;
    if (nonce) this.challenges.delete(nonce); // One use, even when validation fails.
    if (!challenge || challenge.expires <= Date.now() || challenge.action !== action || challenge.digest !== payloadHash(payload) || !signature || !/^0x[0-9a-fA-F]{130}$/.test(signature)) throw new UnauthorizedException('Invalid or expired authorization');
    if (!await verifyMessage({ address: await this.chain.owner(), message: challenge.message, signature: signature as Hex })) throw new UnauthorizedException('Admin signature required');
  }
}
