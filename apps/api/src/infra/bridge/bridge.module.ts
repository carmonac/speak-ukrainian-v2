import { Global, Module } from '@nestjs/common';
import { BridgeClient } from './bridge.client.js';

@Global()
@Module({ providers: [BridgeClient], exports: [BridgeClient] })
export class BridgeModule {}
