import { Global, Module } from '@nestjs/common';
import { BridgeObjectStore } from './bridge.object-store.js';
import { OBJECT_STORE } from './object-store.js';
import { StorageService } from './storage.service.js';

/** Object storage: Cloudflare R2, reached through the gateway bridge. */
@Global()
@Module({
  providers: [{ provide: OBJECT_STORE, useClass: BridgeObjectStore }, StorageService],
  exports: [StorageService],
})
export class StorageModule {}
