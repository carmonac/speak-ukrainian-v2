import { Injectable, computed, inject, signal } from '@angular/core';
import type { Session } from '@supabase/supabase-js';
import { Supabase } from './supabase';

export type SignUpOutcome = 'signed-in' | 'confirm-email';

/** Sign-in state of the classroom, backed by Supabase Auth. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(Supabase).client;
  private readonly session = signal<Session | null>(null);
  private readonly initialised: Promise<void>;

  readonly signedIn = computed(() => this.session() !== null);
  readonly userId = computed(() => this.session()?.user.id ?? null);
  readonly email = computed(() => this.session()?.user.email ?? '');
  /** The name given at registration, until the profile has been loaded. */
  readonly metadataName = computed(
    () =>
      (this.session()?.user.user_metadata as { full_name?: string } | undefined)?.full_name ?? '',
  );

  constructor() {
    this.initialised = this.supabase.auth.getSession().then(({ data }) => {
      this.session.set(data.session);
    });
    this.supabase.auth.onAuthStateChange((_event, session) => this.session.set(session));
  }

  /** Resolves once the stored session, if any, has been restored. */
  async ready(): Promise<boolean> {
    await this.initialised;
    return this.signedIn();
  }

  /** The current access token, refreshed by the client when it is about to expire. */
  async accessToken(): Promise<string | null> {
    const { data } = await this.supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async signIn(email: string, password: string): Promise<void> {
    const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (/not confirmed/i.test(error.message)) {
        throw new Error('Confirm your email address first: check your inbox for the link.');
      }
      throw new Error(
        error.status === 400 ? 'Wrong email or password.' : 'Sign-in failed. Try again.',
      );
    }
    this.session.set(data.session);
  }

  async signUp(fullName: string, email: string, password: string): Promise<SignUpOutcome> {
    const { data, error } = await this.supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName }, emailRedirectTo: window.location.origin },
    });
    if (error) {
      throw new Error(
        /already registered/i.test(error.message)
          ? 'An account with this email already exists. Sign in instead.'
          : error.message || 'The account could not be created.',
      );
    }
    // With email confirmation switched on there is a user but no session yet.
    if (!data.session) {
      return 'confirm-email';
    }
    this.session.set(data.session);
    return 'signed-in';
  }

  async requestPasswordReset(email: string): Promise<void> {
    const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      throw new Error(error.message || 'The reset email could not be sent.');
    }
  }

  async updatePassword(password: string): Promise<void> {
    const { error } = await this.supabase.auth.updateUser({ password });
    if (error) {
      throw new Error(error.message || 'The password could not be changed.');
    }
  }

  async signOut(): Promise<void> {
    await this.supabase.auth.signOut();
    this.session.set(null);
  }
}
