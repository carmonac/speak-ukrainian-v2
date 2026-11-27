import type { ConfigService } from '@nestjs/config';
import type { CourseSummary } from '@speakukrainian/shared';
import { describe, expect, it } from 'vitest';
import type { Env } from '../config/configuration.js';
import { SiteRenderer, usesCourses, type RenderablePage } from './site.renderer.js';

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

  describe('courses', () => {
    const course: CourseSummary = {
      id: 'c1',
      title: 'Ukrainian <A1>',
      slug: 'ukrainian-a1',
      summary:
        '<p><strong>Start</strong> here 👋</p><img src="https://example.com/files/1/a.png" />',
      summaryText: 'Start here 👋',
      priceCents: 2500,
      currency: 'eur',
      status: 'published',
      lessonCount: 3,
    };

    it('lists the published courses with their summary as HTML', () => {
      const html = renderer.render(
        page(
          '{{#each courses}}<a href="{{ url }}">{{ title }}</a>|{{ price }}|{{ lessonCount }}|{{ summary }}|{{ summaryText }}{{/each}}',
        ),
        ['en'],
        [course],
      );
      expect(html).toBe(
        '<a href="https://student.example.com/courses/ukrainian-a1">Ukrainian &lt;A1&gt;</a>|€25.00|3|' +
          '<p><strong>Start</strong> here 👋</p><img src="https://example.com/files/1/a.png" />|Start here 👋',
      );
    });

    it("formats the price in the visitor's language and says when it is free", () => {
      const free = { ...course, priceCents: 0 };
      expect(
        renderer.render(
          page('{{#each courses}}{{ price }}{{#if free}}!{{/if}};{{/each}}'),
          ['es'],
          [course, free],
        ),
      ).toBe('25,00 €;Free!;');
    });

    it('is an empty list when no courses are given', () => {
      expect(renderer.render(page('{{#each courses}}x{{else}}none{{/each}}'), ['en'])).toBe('none');
    });

    it('cannot be shadowed by a text', () => {
      const text = { key: 'courses', translations: [{ locale: 'en', value: 'fake' }] };
      expect(renderer.render(page('[{{ courses }}]', [text]), ['en'])).toBe('[]');
    });

    it('is only loaded for templates that mention it', () => {
      expect(usesCourses('{{#each courses}}{{/each}}')).toBe(true);
      expect(usesCourses('<h1>{{ title }}</h1>')).toBe(false);
    });
  });
});
