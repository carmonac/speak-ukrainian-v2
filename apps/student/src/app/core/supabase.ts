import { Injectable } from '@angular/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { runtimeConfig } from './runtime-config';

/** The browser Supabase client: used for authentication and Realtime only. */
@Injectable({ providedIn: 'root' })
export class Supabase {
  readonly client: SupabaseClient = createClient(
    runtimeConfig().supabaseUrl,
    runtimeConfig().supabaseAnonKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Picks up the session from the links in confirmation and reset emails.
        detectSessionInUrl: true,
        storageKey: 'su-student-auth',
      },
    },
  );
}
