import { describe, expect, it } from 'vitest';
import { pagePathSchema, resolveTranslation, savePageSchema } from './page.js';

const greeting = [
  { locale: 'en', value: 'Hello' },
  { locale: 'es', value: 'Hola' },
  { locale: 'pt-BR', value: 'Olá' },
];

describe('resolveTranslation', () => {
  it("uses the visitor's language when it is translated", () => {
    expect(resolveTranslation(greeting, ['es'])).toBe('Hola');
  });

  it('falls back from a regional variant to its base language', () => {
    expect(resolveTranslation(greeting, ['es-MX'])).toBe('Hola');
  });

  it('serves a regional translation to a visitor asking for the base language', () => {
    expect(resolveTranslation(greeting, ['pt'])).toBe('Olá');
  });

  it('honours the order of the visitor preferences', () => {
    expect(resolveTranslation(greeting, ['de', 'es', 'en'])).toBe('Hola');
  });

  it('falls back to English when the language is missing', () => {
    expect(resolveTranslation(greeting, ['uk'])).toBe('Hello');
    expect(resolveTranslation(greeting, [])).toBe('Hello');
  });

  it('treats an empty translation as missing', () => {
    const texts = [
      { locale: 'en', value: 'Hello' },
      { locale: 'es', value: '' },
    ];
    expect(resolveTranslation(texts, ['es'])).toBe('Hello');
  });

  it('uses whatever exists when there is no English either', () => {
    expect(resolveTranslation([{ locale: 'uk', value: 'Привіт' }], ['fr'])).toBe('Привіт');
  });

  it('is an empty string for a text with no translations', () => {
    expect(resolveTranslation([], ['en'])).toBe('');
  });
});

describe('pagePathSchema', () => {
  it.each(['/', '/about', '/courses/spanish', '/a-b-c/d1'])('accepts %s', (path) => {
    expect(pagePathSchema.safeParse(path).success).toBe(true);
  });

  it.each(['', 'about', '/About', '/about/', '/a b', '/a//b', '/-a', '/a?x=1'])(
    'refuses %j',
    (path) => {
      expect(pagePathSchema.safeParse(path).success).toBe(false);
    },
  );

  it.each(['/api', '/api/health', '/healthz', '/robots.txt'])(
    'refuses the reserved path %s',
    (path) => {
      expect(pagePathSchema.safeParse(path).success).toBe(false);
    },
  );

  it('does not treat a longer name as reserved', () => {
    expect(pagePathSchema.safeParse('/apiary').success).toBe(true);
  });
});

describe('savePageSchema', () => {
  const base = { title: 'About', path: '/about', content: '<h1>{{ header }}</h1>' };

  it('refuses two texts with the same name', () => {
    const result = savePageSchema.safeParse({
      ...base,
      texts: [
        { key: 'header', translations: [] },
        { key: 'header', translations: [] },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('refuses the same language twice within one text', () => {
    const result = savePageSchema.safeParse({
      ...base,
      texts: [
        {
          key: 'header',
          translations: [
            { locale: 'en', value: 'a' },
            { locale: 'en', value: 'b' },
          ],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('refuses a text name that is not a valid template identifier', () => {
    const result = savePageSchema.safeParse({
      ...base,
      texts: [{ key: 'my header', translations: [] }],
    });
    expect(result.success).toBe(false);
  });
});
