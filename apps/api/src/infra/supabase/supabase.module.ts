import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../../config/configuration.js';

/** The service-role Supabase client: Auth administration and bucket setup. */
export const SUPABASE_ADMIN = Symbol('SUPABASE_ADMIN');
export type SupabaseAdmin = SupabaseClient;

@Global()
@Module({
  providers: [
    {
      provide: SUPABASE_ADMIN,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): SupabaseAdmin =>
        createClient(
          config.get('SUPABASE_URL', { infer: true }),
          config.get('SUPABASE_SERVICE_ROLE_KEY', { infer: true }),
          { auth: { autoRefreshToken: false, persistSession: false } },
        ),
    },
  ],
  exports: [SUPABASE_ADMIN],
})
export class SupabaseModule {}
