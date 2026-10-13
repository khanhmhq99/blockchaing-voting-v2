import { Body, Controller, Get, Headers, Inject, Module, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { gaslessAbi } from '../../../../packages/contracts/src/gasless-abi.js';
import { addressSchema, uint256Schema, votingDomain, votingIntentTypes } from '../../../../packages/shared-types/src/gasless.js';
import { ChainService } from '../chain.js';
import { InfrastructureModule } from '../infrastructure.js';
import { IntentAuthorization } from './authorization.js';
import { TransactionSender } from './sender.js';
import { RelayerService } from './service.js';
import { relayerConfig } from './config.js';
import { RelayError } from './errors.js';

@Controller('v1/gasless')
export class RelayerController {
  constructor(@Inject(RelayerService) readonly relay: RelayerService, @Inject(ChainService) readonly chain: ChainService) {}
  @Get('config') config() {
    return { enabled: relayerConfig().enabled, domain: votingDomain(this.chain.config.CHAIN_ID, this.chain.address), types: votingIntentTypes, maxDeadlineSeconds: relayerConfig().maxDeadlineSeconds, walletSupport: 'EOA-only' };
  }
  @Get('nonce/:electionId/:voterAddress') async nonce(@Param('electionId') electionId: string, @Param('voterAddress') voterAddress: string) {
    if (!relayerConfig().enabled) throw new RelayError('GASLESS_DISABLED', 503);
    const id = BigInt(uint256Schema.parse(electionId)); const voter = addressSchema.parse(voterAddress);
    await this.chain.verifyNetwork();
    const block = await this.chain.client.getBlock();
    const nonce = await this.chain.client.readContract({ address: this.chain.address, abi: gaslessAbi, functionName: 'nonces', args: [id, voter], blockNumber: block.number });
    return { nonce: nonce.toString(), timestamp: block.timestamp.toString(), deadline: (block.timestamp + BigInt(Math.min(120, relayerConfig().maxDeadlineSeconds))).toString(), blockHash: block.hash };
  }
  @Post('votes') submit(@Body() body: unknown, @Headers('idempotency-key') key?: string) { return this.relay.submit(body, key); }
  @Get('intents/:digest') byIntent(@Param('digest') digest: string) { return this.relay.byIntent(z.string().regex(/^0x[0-9a-f]{64}$/).parse(digest)); }
  @Get('votes/:id') status(@Param('id') id: string) { return this.relay.status(z.uuid().parse(id)); }
}
@Module({ imports: [InfrastructureModule], controllers: [RelayerController], providers: [IntentAuthorization, TransactionSender, RelayerService], exports: [RelayerService] })
export class RelayerModule {}
