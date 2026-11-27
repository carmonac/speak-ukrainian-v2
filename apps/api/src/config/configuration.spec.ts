import { describe, expect, it } from 'vitest';
import { validateEnv } from './configuration.js';

const valid = {
  AUTH_SECRET: 'a'.repeat(32),
  H5P_URL_TOKEN_SECRET: 'h'.repeat(32),
  ADMIN_EMAIL: 'admin@example.com',
};

describe('validateEnv', () => {
  it('lists every invalid variable with its path', () => {
    const error = (() => {
      try {
        validateEnv({ ADMIN_EMAIL: 'not-an-email', PORT: 'eighty' });
      } catch (e) {
        return e as Error;
      }
      throw new Error('validateEnv accepted an invalid environment');
    })();
    expect(error.message).toMatch(/^Invalid environment configuration:\n/);
    for (const name of ['PORT', 'AUTH_SECRET', 'ADMIN_EMAIL', 'H5P_URL_TOKEN_SECRET']) {
      expect(error.message).toMatch(new RegExp(`^  ${name}: `, 'm'));
    }
  });

  it('boots production without a Stripe key (paid checkouts are refused later)', () => {
    const env = validateEnv({ ...valid, NODE_ENV: 'production', STRIPE_SECRET_KEY: '  ' });
    expect(env.NODE_ENV).toBe('production');
    expect(env.STRIPE_SECRET_KEY).toBeUndefined();
  });
});
