import { Injectable } from '@angular/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { runtimeConfig } from './runtime-config';

/** The browser Supabase client: used for sign-in and Realtime only. */
@Injectable({ providedIn: 'root' })
export class Supabase {
  readonly client: SupabaseClient = createClient(
    runtimeConfig().supabaseUrl,
    runtimeConfig().supabaseAnonKey,
    { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'su-admin-auth' } },
  );
}
