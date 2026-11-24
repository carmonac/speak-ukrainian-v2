import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import type { Env } from '../../config/configuration.js';
import { StorageService } from './storage.service.js';
import { S3_CLIENT } from './storage.tokens.js';

/**
 * Object storage on Supabase Storage through its S3-compatible endpoint, which
 * gives ranged reads, delimiter listings and `LastModified` — everything the
 * H5P storage adapters need.
 */
@Global()
@Module({
  providers: [
    {
      provide: S3_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): S3Client =>
        new S3Client({
          endpoint:
            config.get('STORAGE_S3_ENDPOINT', { infer: true }) ??
            `${config.get('SUPABASE_URL', { infer: true }).replace(/\/$/, '')}/storage/v1/s3`,
          region: config.get('STORAGE_S3_REGION', { infer: true }),
          forcePathStyle: true,
          credentials: {
            accessKeyId: config.get('STORAGE_S3_ACCESS_KEY_ID', { infer: true }),
            secretAccessKey: config.get('STORAGE_S3_SECRET_ACCESS_KEY', { infer: true }),
          },
        }),
    },
    StorageService,
  ],
  exports: [S3_CLIENT, StorageService],
})
export class StorageModule {}
