import { describe, expect, it } from 'vitest';
import { preferredLocales } from './site.locale.js';

describe('preferredLocales', () => {
  it('orders languages by quality, then by position', () => {
    expect(preferredLocales('en;q=0.5, es, fr;q=0.9, de;q=0.9')).toEqual(['es', 'fr', 'de', 'en']);
  });

  it('keeps regional variants', () => {
    expect(preferredLocales('es-ES,es;q=0.9,en;q=0.8')).toEqual(['es-ES', 'es', 'en']);
  });

  it('is empty for a missing or wildcard header', () => {
    expect(preferredLocales(undefined)).toEqual([]);
    expect(preferredLocales('*')).toEqual([]);
  });

  it('drops refused (q=0) and malformed entries', () => {
    expect(preferredLocales('en;q=0, <script>, es;q=abc, uk')).toEqual(['uk']);
  });

  it('puts a valid override first, without duplicating it', () => {
    expect(preferredLocales('en,es', 'es')).toEqual(['es', 'en']);
  });

  it('ignores an override that is not a language code', () => {
    expect(preferredLocales('en', '../etc')).toEqual(['en']);
  });
});
