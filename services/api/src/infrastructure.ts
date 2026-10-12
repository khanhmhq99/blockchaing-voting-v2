import { Module } from '@nestjs/common';
import { DatabaseService } from './database.js';
import { ChainService } from './chain.js';

@Module({ providers: [DatabaseService, ChainService], exports: [DatabaseService, ChainService] })
export class InfrastructureModule {}
