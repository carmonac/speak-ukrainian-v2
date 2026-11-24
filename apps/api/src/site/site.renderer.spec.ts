import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import type { Env } from '../config/configuration.js';
import { SiteRenderer, type RenderablePage } from './site.renderer.js';

const config = {
  get: (key: string) =>
    key === 'STUDENT_APP_URL' ? 'https://student.example.com/' : 'https://example.com/',
} as unknown as ConfigService<Env, true>;

function page(content: string, texts: RenderablePage['texts'] = []): RenderablePage {
  return { title: 'Home', path: '/', content, texts };
}

const header = {
  key: 'header',
  translations: [
    { locale: 'en', value: 'Learn Ukrainian' },
    { locale: 'es', value: 'Aprende ucraniano' },
  ],
};

describe('SiteRenderer', () => {
  const renderer = new SiteRenderer(config);

  it("renders a text in the visitor's language", () => {
    expect(renderer.render(page('<h1>{{ header }}</h1>', [header]), ['es'])).toBe(
      '<h1>Aprende ucraniano</h1>',
    );
  });

  it('falls back to English for a language with no translation', () => {
    expect(renderer.render(page('{{ header }}', [header]), ['fr'])).toBe('Learn Ukrainian');
  });

  it('escapes text values, and leaves them raw only on request', () => {
    const text = { key: 'x', translations: [{ locale: 'en', value: '<b>hi</b>' }] };
    expect(renderer.render(page('{{ x }}|{{{ x }}}', [text]), ['en'])).toBe(
      '&lt;b&gt;hi&lt;/b&gt;|<b>hi</b>',
    );
  });

  it('provides the built-in values, without a trailing slash on URLs', () => {
    const html = renderer.render(page('{{ title }}|{{ locale }}|{{ studentUrl }}|{{ siteUrl }}'), [
      'uk',
    ]);
    expect(html).toBe('Home|uk|https://student.example.com|https://example.com');
  });

  it('does not let a text shadow a built-in value', () => {
    const text = { key: 'studentUrl', translations: [{ locale: 'en', value: 'https://evil' }] };
    expect(renderer.render(page('{{ studentUrl }}', [text]), ['en'])).toBe(
      'https://student.example.com',
    );
  });

  it('renders an unknown name as nothing', () => {
    expect(renderer.render(page('[{{ missing }}]'), ['en'])).toBe('[]');
  });

  it('does not expose object prototypes to templates', () => {
    expect(renderer.render(page('[{{ constructor.name }}]'), ['en'])).toBe('[]');
  });

  it('answers a broken template with an error page instead of throwing', () => {
    const result = renderer.renderSafely(page('{{#if}}'), ['en']);
    expect(result.ok).toBe(false);
    expect(result.html).toContain('This page could not be displayed');
  });

  it('escapes the template error it reports', () => {
    const result = renderer.renderSafely(page('{{#each <script>}}'), ['en']);
    expect(result.ok).toBe(false);
    expect(result.html).not.toContain('<script>');
  });
});
