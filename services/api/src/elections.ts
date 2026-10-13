import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { Address } from 'viem';
import { DatabaseService } from './database.js';
import { ChainService } from './chain.js';
import { manifestSchema, payloadHash, type Manifest } from '../../../packages/shared-types/src/index.js';

@Injectable()
export class ElectionsService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService, @Inject(ChainService) private readonly chain: ChainService) {}
  private key(electionId: string) { return { chainId: String(this.chain.config.CHAIN_ID), contractAddress: this.chain.address, electionId }; }
  async list() {
    const rows = await this.db.electionMetadata.findMany({ where: { chainId: String(this.chain.config.CHAIN_ID), contractAddress: this.chain.address }, orderBy: { createdAt: 'desc' } });
    return Promise.all(rows.map(row => this.get(row.electionId)));
  }
  async get(id: string, voter?: Address) {
    const chain = await this.chain.election(BigInt(id), voter);
    const row = await this.db.electionMetadata.findUnique({ where: { chainId_contractAddress_electionId: this.key(id) }, include: { candidates: { orderBy: { candidateId: 'asc' } } } });
    const parsed = row ? manifestSchema.safeParse({ title: row.title, description: row.description, candidates: row.candidates.map(c => ({ name: c.name, biography: c.biography })) }) : null;
    const manifest = parsed?.success ? parsed.data : null;
    const verified = manifest !== null && payloadHash(manifest) === chain.manifestHash && chain.candidateHashes.length === manifest.candidates.length && manifest.candidates.every((candidate, index) => payloadHash(candidate) === chain.candidateHashes[index]);
    return { chain, metadata: verified ? manifest : null, metadataStatus: verified ? 'verified' : row ? 'mismatch' : 'missing' };
  }
  async save(id: string, manifest: Manifest) {
    const chain = await this.chain.election(BigInt(id));
    if (payloadHash(manifest) !== chain.manifestHash || manifest.candidates.length !== chain.candidateCount || chain.candidateHashes.length !== manifest.candidates.length || !manifest.candidates.every((candidate, index) => payloadHash(candidate) === chain.candidateHashes[index])) throw new ConflictException('Metadata does not match the on-chain manifest');
    const { candidates, ...metadata } = manifest;
    const profiles = candidates.map((c, candidateId) => ({ ...c, candidateId }));
    return this.db.electionMetadata.upsert({ where: { chainId_contractAddress_electionId: this.key(id) }, create: { ...this.key(id), ...metadata, manifestHash: chain.manifestHash, candidates: { create: profiles } }, update: { ...metadata, manifestHash: chain.manifestHash, candidates: { deleteMany: {}, create: profiles } } });
  }
}
